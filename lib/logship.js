'use strict';

if (process.env.COVERAGE) require('blanket');

// node built-ins
const path = require('node:path');
const util = require('node:util');

// local modules
const config = require('./config');
const logger = require('./logger');
const pfDoc = require('./postfix-doc');
const spool = require('./spool');

function PostfixToElastic(etcDir) {
  this.loadConfig(etcDir);

  this.postdoc = pfDoc(this.cfg);
  this.batchTries = 0;
  this.queue = [];     // parsed lines stored here
  this.pfDocs = {};    // postfix docs assembled here
  this.queueActive = false;  // true while queue is being drained
  this.elasticAlive = false;
  this.watchdog();

  spool.isValidDir(this.cfg.main.spool);  // initialize spool dir

  this.tryLoadingRedis();

  // initialize Elasticsearch
  const esm = require(this.cfg.elastic.module);
  this.elastic = new esm.Client(this.getEsOpts());

  const p2e = this;
  this.elastic.ping()
    .then(() => {
      p2e.elasticAlive = true;
      p2e.setReaderOpts();
      p2e.startReader();
    })
    .catch((err) => {
      logger.error('Failed to connect to Elasticsearch:', err.message);
      logger.error('Shutting down process. Elasticsearch must be available at startup.');
      p2e.shutdown();
    });
}

PostfixToElastic.prototype.loadConfig = function(etcDir) {
  this.cfg = config(etcDir);

  if (!this.cfg.elastic.timeformat) {
    this.cfg.elastic.timeformat = 'YYYY-MM-DD';
  }
  if (!this.cfg.main.spool) {
    this.cfg.main.spool = '/var/spool/log_ship/postfix';
  }
  if (this.cfg.reader.batchDelay === undefined) {
    this.cfg.reader.batchDelay = 5;
  }
  if (!this.cfg.reader.batchLimit) {
    this.batchLimit = 1024;
  }
};

PostfixToElastic.prototype.tryLoadingRedis = function() {
  if (!this.cfg.redis) return;
  if (!this.cfg.redis.module) return;
  try {
    const redis = require(this.cfg.redis.module);
    this.redis = redis.createClient({
      host: this.cfg.redis.host || '127.0.0.1',
      port: this.cfg.redis.port || 6379,
    });
    this.redis.on('error', (err) => {
      logger.error(err);
    });
    if (this.cfg.redis.db !== undefined) {
      this.redis.select(this.cfg.redis.db);
    }
  }
  catch (err) {
    logger.error(err.message);
  }
};

PostfixToElastic.prototype.setReaderOpts = function() {
  this.readerOpts = {
    batchLimit: this.cfg.reader.batchLimit,
    bookmark: { dir: path.resolve(this.cfg.main.spool, '.bookmark') },
    watchDelay: this.cfg.reader.watchDelay,
    batchDelay: this.cfg.reader.batchDelay,
  };
};

PostfixToElastic.prototype.startReader = function() {
  const p2e = this;

  // elasticsearch is up, start reading lines
  const read = require(p2e.cfg.reader.module);
  p2e.reader = read.createReader(p2e.cfg.reader.file, p2e.readerOpts)
    .on('readable', function () {
      // log file is readable, read a line (see 'read' event)
      this.readLine();  // 'this' is a reader
    })
    .on('read', (data, lineCount) => {
      const parsed = p2e.postdoc.parseLine(data, lineCount);
      if (!parsed) return;
      if (!parsed.qid) {
        logger.debug('ignoring: ' + data);
        return;
      }
      p2e.queue.push(parsed);
    })
    .on('drain', (done) => {
      p2e.doQueue(done);
    })
    .on('end', () => {
      logger.info('end of file');
    });
};

PostfixToElastic.prototype.getEsOpts = function () {
  const hosts = this.cfg.elastic.hosts.split(/[, ]+/);
  const nodes = hosts.map((host) => `http://${host}`);

  const esOpts = {
    nodes,
    requestTimeout: 30000,
  };

  if (process.env.NODE_ENV === 'test') {
    esOpts.logger = {
      info: (_) => { },
      debug: (_) => { },
      warn: (_) => { },
      error: (msg) => logger.error(msg),
    };
  }

  return esOpts;
};

PostfixToElastic.prototype.formatDate = function(dateStr, format) {
  // Parse ISO date string and format according to the format string
  // format: "YYYY-MM-DD" or similar
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr; // return as-is if parsing fails
  }

  // Extract year, month, day from UTC date
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  // Replace format placeholders
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day);
};

PostfixToElastic.prototype.readLogLine = function(data, lineCount) {
  // same as .on('read') ^^^, used for testing
  const parsed = this.postdoc.parseLine(data, lineCount);
  if (parsed) this.queue.push(parsed);
};

PostfixToElastic.prototype.doneQueue = function(err, done) {
  const p2e = this;

  if (err) {
    logger.error(err);
    if (p2e.batchTries > 3) {
      return p2e.shutdown();
    }
    setTimeout(() => {
      p2e.pfDocs = {};
      p2e.queueActive = false;
      p2e.doQueue(done);  // retry
    }, 60 * 1000);
    return;
  }

  // batch of lines is safely committed to ES, reset
  p2e.pfDocs = {};
  p2e.queue = [];
  p2e.queueActive = false;
  p2e.batchTries = 0;
  logger.debug('\t\tqueue reset');
  if (done) done(null, p2e.cfg.reader.batchDelay);  // resume sending lines
};

PostfixToElastic.prototype.doQueue = function(done) {
  const p2e = this;

  if (this.queue.length === 0) {
    if (this.reader && this.reader.watcher) {
      logger.info('waiting for file to change');
      return this.doneQueue(null);
    }
    logger.info('doQueue: empty');
    return this.doneQueue(null, done);
  }

  if (this.queueActive) {
    logger.info('doQueue: already active');
    return;
  }

  if (process.env.WANTS_SHUTDOWN) return;
  this.watchdog();

  this.queueActive = true;
  this.batchTries++;

  logger.info('doQueue: ' + this.queue.length + ' lines');
  p2e.populatePfdocsFromEs((err) => {
    if (err) return p2e.doneQueue(err);

    // update pfDocs with log entries
    p2e.updatePfDocs(() => {
      p2e.getParentIds(() => {
        p2e.saveResultsToEs((err) => {
          logger.debug('\tsaveResultsToEs returned');
          if (err) return p2e.doneQueue(err, done);
          logger.info('\tsaveResultsToEs: ok');
          p2e.doneQueue(null, done);
        });
      });
    });
  });
};

PostfixToElastic.prototype.getParentIds = function(done) {
  const p2e = this;

  if (!this.redis) {
    logger.info('getParentIds() skipping, no redis');
    return done();
  }

  const sameOrderAsRedisReply = [];
  Object.keys(p2e.pfDocs).forEach((docId) => {
    sameOrderAsRedisReply.push(docId);
  });

  this.redis.mget(sameOrderAsRedisReply, (err, replies) => {
    for (let i = 0; i < replies.length; i++) {
      if (!replies[i]) continue;
      logger.debug('parent reply ' + i + ': ' + replies[i]);
      p2e.pfDocs[sameOrderAsRedisReply[i]]._parent = replies[i];
    }

    done();
  });
};

PostfixToElastic.prototype.populatePfdocsFromEs = function(done) {
  const p2e = this;
  const pfQids = {};

  // get a (likely short) list of elastic time series indexes in which these
  // postfix documents would reside. This signficantly reduces the search cost
  const uniqYMDs = {}; // to reduce index search space

  for (let i = 0; i < this.queue.length; i++) {
    pfQids[this.queue[i].qid] = true;
    const df = this.formatDate(this.queue[i].date, p2e.cfg.elastic.timeformat);
    uniqYMDs[df] = true;
  }

  const uniqIndexNames = [];
  Object.keys(uniqYMDs).forEach((ymd) => {
    uniqIndexNames.push(p2e.cfg.elastic.index + '-' + ymd);
    if (p2e.cfg.elastic.parent && p2e.cfg.elastic.parent.index) {
      uniqIndexNames.push(p2e.cfg.elastic.parent.index + '-' + ymd);
    }
  });

  // get all pfQids from ES index
  this.elastic.search({
    index: uniqIndexNames.join(','),
    ignore_unavailable: true,
    size: p2e.cfg.reader.batchLimit * 3,
    query: {
      terms: { _id: Object.keys(pfQids) }
    }
  })
    .then((res) => {
      const total = res.hits.total.value || res.hits.total;
      logger.info('\telastic doc matches: ' + total);

      // populate pfDocs from ES qid matches
      for (let i = 0; i < res.hits.hits.length; i++) {
        const qid = res.hits.hits[i]._id;
        p2e.pfDocs[qid] = res.hits.hits[i]._source;
        p2e.pfDocs[qid]._index = res.hits.hits[i]._index;
        if (res.hits.hits[i]._parent) {
          p2e.pfDocs[qid]._parent = res.hits.hits[i]._parent;
        }
        const version = res.hits.hits[i]._version;
        if (version) {
          logger.debug('qid: ' + qid + ' ver: ' + version);
        }
      }
      done();
    })
    .catch((err) => {
      done(err);
    });
};

PostfixToElastic.prototype.updatePfDocs = function(done) {
  const count = { new: 0 };
  for (let j = 0; j < this.queue.length; j++) {
    const logObj = this.queue[j];
    const qid = logObj.qid;

    // default document template
    if (!this.pfDocs[qid]) {
      count.new++;
      this.pfDocs[qid] = {
        qid:     qid,
        host:    logObj.host,
        events:  [],
        date:    logObj.date,
        isFinal: false,
      };
    }
    this.postdoc.update(this.pfDocs[qid], logObj);
  }
  logger.info('\tupdatePfDocs: new: ' + count.new);
  done();
};

PostfixToElastic.prototype.saveResultsToEs = function(done) {
  const p2e = this;
  // create/update 'em all to ES
  const operations = [];  // bulk operations

  Object.keys(p2e.pfDocs).forEach((qid) => {
    const doc = p2e.pfDocs[qid];     // this doc

    const bulkMeta = {
      _id: qid,
    };
    if (doc.qid) delete doc.qid;  // redundant

    const dateSuffix = p2e.formatDate(doc.date, p2e.cfg.elastic.timeformat);

    if (doc._parent && p2e.cfg.elastic.parent) {
      bulkMeta.parent = doc._parent;
      delete doc._parent;
      bulkMeta._index  = p2e.cfg.elastic.parent.index + '-' + dateSuffix;
    }
    else {
      bulkMeta._index  = p2e.cfg.elastic.index + '-' + dateSuffix;
    }

    if (doc._index) {
      delete doc._index;
      // update expects a (partial) doc and/or script
      operations.push({
        update: bulkMeta
      });
      operations.push({
        doc: doc,
        doc_as_upsert: true,
        detect_noop: true,
      });
    }
    else {
      // create fails if a doc with the same index and type exists
      operations.push({
        create: bulkMeta
      });
      operations.push(doc);
    }
  });

  p2e.elastic.bulk({ operations })
    .then((res) => {
      if (res.errors) {
        logger.info(util.inspect(res, { depth: null }));
        return done('bulk errors, see logs');
      }
      done(null, res);
    })
    .catch((err) => {
      done(err);
    });
};

PostfixToElastic.prototype.shutdown = function() {
  const p2e = this;

  console.log('starting graceful shutdown');

  process.env.WANTS_SHUTDOWN = 1;

  setTimeout(() => {
    // deadman: if things haven't shut down in 35s, die
    process.exit();
  }, 35 * 1000);

  function waitForQueue() {
    if (!p2e.queueActive) process.exit();
    logger.info('queue is active');
    setTimeout(() => {
      waitForQueue();
    }, 1 * 1000);
  }
  waitForQueue();
};

PostfixToElastic.prototype.watchdog = function() {
  const p2e = this;
  p2e.watchdogTimer = setTimeout(() => {
    logger.info('inactive for 6 hours, shutting down.');
    p2e.shutdown();
  }, 6 * 60 * 60 * 1000);  // 6 hours
};

module.exports = {
  createShipper: (etcDir) => {
    return new PostfixToElastic(etcDir);
  }
};
