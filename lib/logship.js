'use strict';

if (process.env.COVERAGE) require('blanket');

// node built-ins
var path      = require('path');
var util      = require('util');

// npm modules
var moment    = require('moment-timezone');

// local modules
var config    = require('./config');
var logger    = require('./logger');
var postdoc   = require('./postfix-doc');
var spool     = require('./spool');

function PostfixToElastic (etcDir) {
  this.cfg          = config.loadConfig(etcDir);
  this.spool        = this.cfg.main.spool || '/var/spool/log-ship';
  this.batchLimit   = this.cfg.elastic.batch || 1024;
  this.batchDelay   = this.cfg.elastic.batchDelay || 5;
  this.batchTries   = 0;

  this.queue        = [];     // parsed lines stored here
  this.pfDocs       = {};     // postfix docs assembled here
  this.queueActive  = false;  // true while queue is being drained
  this.elasticAlive = false;

  spool.isValidDir(this.spool);  // initialize spool dir

  // initialize Elasticsearch
  var esm          = require(this.cfg.elastic.module);
  this.eshosts     = this.cfg.elastic.hosts.split(/[, ]+/);
  var esOpts       = {
    hosts: this.eshosts,
    log: 'error', // 'trace',
  };
  if (process.env.NODE_ENV === 'test') {
    esOpts.log = {
      type: 'file',
      path: path.join('test','spool','es-err.log'),
    };
  }
  this.elastic     = new esm.Client(esOpts);

  var readerOpts   = {
    batchLimit: this.batchLimit,
    bookmark: { dir: path.resolve(this.spool, '.bookmark') },
    watchDelay: this.cfg.reader.watchDelay,
  };

  var p2e = this;
  this.elastic.ping(function (err) {
    if (err) {
      logger.error(err);
      return;
    }

    p2e.elasticAlive = true;

    // elasticsearch is up, start reading lines
    var read = require(p2e.cfg.reader.module);
    p2e.reader = read.createReader(p2e.cfg.reader.file, readerOpts)
    .on('readable', function () {
      // log file is readable, read a line (see 'read' event)
      this.readLine();  // 'this' is a reader
    })
    .on('read', function (data, lineCount) {
      // logger.debug(lineCount + ': ' + data);
      var parsed = postdoc.parseLine(data, lineCount);
      if (!parsed) return;
      if (!parsed.qid) {
        logger.debug('ignoring: ' + data);
        return;
      }
      p2e.queue.push(parsed);
    })
    .on('end', function (done) {
      logger.debug('end of batch or file');
      p2e.doQueue(done);
    });
  });
}

PostfixToElastic.prototype.readLogLine = function(data, lineCount) {
  // identical to on('read') ^^^, used for testing
  var parsed = postdoc.parseLine(data, lineCount);
  if (parsed) this.queue.push(parsed);
};

PostfixToElastic.prototype.doneQueue = function(err, done) {
  var p2e = this;

  if (err) {
    logger.error(err);
    if (p2e.batchTries > 3) {
      return p2e.shutdown();
    }
    setTimeout(function () {
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
  if (done) done(null, p2e.batchDelay);  // resume sending lines
};

PostfixToElastic.prototype.doQueue = function(done) {
  var p2e = this;

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

  this.queueActive = true;
  this.batchTries++;

  logger.info('doQueue: ' + this.queue.length + ' lines');
  p2e.populatePfdocsFromEs(function (err, res) {
    if (err) return p2e.doneQueue(err);

    // update pfDocs with log entries
    p2e.updatePfDocs(function (err, res) {

      p2e.saveResultsToEs(function (err, res) {
        logger.debug('\tsaveResultsToEs returned');
        if (err) return p2e.doneQueue(err, done);
        logger.info('\tsaveResultsToEs: ok');
        p2e.doneQueue(null, done);
      });
    });
  });
};

PostfixToElastic.prototype.populatePfdocsFromEs = function(done) {
  var p2e = this;
  var pfQids = {};

  for (var i = 0; i < this.queue.length; i++) {
    pfQids[ this.queue[i].qid ] = true;
  }

  var uniqueQids = Object.keys(pfQids);
  if (uniqueQids.length === 0) {
    return done('no qids in new logs');
  }
  logger.debug('\tunique queue IDs: ' + uniqueQids.length);

  // get all pfQids from ES index
  this.elastic.search({
    index: p2e.cfg.elastic.indices || 'postfix-orphan*',
    type: p2e.cfg.elastic.type,
    size: p2e.batchLimit * 3,
    body: {
      filter: {
        terms: { _id: uniqueQids }
      }
    }
  },
  function (err, res) {
    if (err) {
      if (/^IndexMissing/.test(err.message)) {
        // the index will get created when we insert a document
        return done(null);
      }
      return done(err);
    }

    logger.info('\telastic doc matches: ' + res.hits.total);
    // logger.debug(util.inspect(res.hits, {depth:null}));

    // populate pfDocs from ES qid matches
    for (var i = 0; i < res.hits.hits.length; i++) {
      var qid = res.hits.hits[i]._id;
      p2e.pfDocs[qid] = res.hits.hits[i]._source;
      p2e.pfDocs[qid]._index = res.hits.hits[i]._index;
      var version = res.hits.hits[i]._version;
      if (version) {
        logger.debug('qid: ' + qid + ' ver: ' + version);
        // p2e.pfDocs[qid]._version = version;
      }
    }
    done();
  });
};

PostfixToElastic.prototype.updatePfDocs = function(done) {

  var count = { new: 0 };
  for (var j = 0; j < this.queue.length; j++) {
    var logObj = this.queue[j];
    var qid    = logObj.qid;

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
    postdoc.update(this.pfDocs[qid], logObj);
  }
  logger.info('\tupdatePfDocs: new: ' + count.new);
  done();
};

PostfixToElastic.prototype.saveResultsToEs = function(done) {
  var p2e = this;
  // create/update 'em all to ES
  // logger.debug(util.inspect(this.pfDocs, {depth: null}));
  var esBulk = [];  // index, create, update

  Object.keys(p2e.pfDocs).forEach(function (qid) {
    var doc = p2e.pfDocs[qid];

    var bulkMeta = {
      _index: doc._index || p2e.getIndexName(doc.date),
      _type: p2e.cfg.elastic.type,
      _id: qid,
    };

    if (doc.qid) delete doc.qid;  // redundant

    if (doc._index) {
      delete doc._index;
      // var version = doc._version;
      // if (version) delete doc._version;
      // update expects a (partial) doc and/or script
      esBulk.push({ update : bulkMeta }, {
        doc: doc,
        doc_as_upsert: true,
        detect_noop: true,
      });
    }
    else if (false) {
      // index will add or replace a document as necessary
      esBulk.push({ index : bulkMeta }, doc);
    }
    else {
      // create fails if a doc with the same index and type exists
      esBulk.push({ create : bulkMeta }, doc);
    }
  });

  // logger.info(esBulk);
  p2e.elastic.bulk({ body: esBulk, consistency: 'all' }, function (err, res) {
    if (err) return done(err);
    if (res.errors) {
      logger.info(util.inspect(res, { depth: null }));
      return done('bulk errors, see logs');
    }
    done(null, res);
  });
};

PostfixToElastic.prototype.getIndexName = function(date) {

  var name = this.cfg.elastic.index || 'postfix-orphan';
  if (!/-(?:YYYY|MM|DD)/.test(name)) return name;

  // http://momentjs.com/docs/#/get-set/get/
  date = moment(date);

  name = name.replace(/\-YYYY/, '-' + date.format('YYYY'));
  name = name.replace(/\-MM/,   '-' + date.format('MM'));
  name = name.replace(/\-DD/,   '-' + date.format('DD'));

  return name;
};

PostfixToElastic.prototype.shutdown = function() {
  var p2e = this;

  console.log('starting graceful shutdown');

  process.env.WANTS_SHUTDOWN=1;

  if (!p2e.elasticAlive) process.exit();
  if (!p2e.queueActive) process.exit();

  setTimeout(function () {
    // deadman: if things haven't shut down in 15s, die
    process.exit();
  }, 15 * 1000);

  function waitForQueue () {
    if (!p2e.queueActive) process.exit();
    logger.info('queue is active');
    setTimeout(function () {
      waitForQueue();
    }, 1 * 1000);
  }
  waitForQueue();
};

module.exports = {
  createShipper: function (etcDir) {
    return new PostfixToElastic(etcDir);
  }
};
