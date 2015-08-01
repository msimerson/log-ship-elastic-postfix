'use strict';

if (process.env.COVERAGE) require('blanket');

// node built-ins
var fs        = require('fs');
var path      = require('path');
var util      = require('util');

// npm modules
var ini       = require('ini');
var moment    = require('moment-timezone');

// local modules
var spool     = require('./spool');
var postdoc   = require('./postfix-doc');

function PostfixToElastic (etcDir) {
    this.cfg         = this.loadConfig(etcDir);
    this.spool       = this.cfg.main.spool || '/var/spool/log-ship';
    this.batchLimit  = this.cfg.elastic.batch || 1024;

    this.queue       = [];   // parsed lines stored here
    this.pfDocs      = {};   // postfix docs assembled here
    this.queueActive = false;  // true while queue is being drained
    this.elasticAlive = false;

    spool.isValidDir(this.spool);  // initialize spool dir

    // initialize the parser
    this.parser      = require(this.cfg.parser.module);

    // moment-timezone converts syslog timestamps to Date objects
    moment.tz.setDefault(this.cfg.parser.timezone || 'America/Phoenix');
    this.parser.moment = moment;

    // initialize Elasticsearch
    var esm          = require(this.cfg.elastic.module);
    this.eshosts     = this.cfg.elastic.hosts.split(/[, ]+/);
    this.elastic     = new esm.Client({
        hosts: this.eshosts,
        // log: 'trace',
    });

    var p2e = this;
    this.elastic.ping(function (err, res) {
        if (err) {
            console.error(err);
            return;
        }

        this.elasticAlive = true;

        // elasticsearch is up, start reading lines
        var read = require(p2e.cfg.reader.module);
        p2e.reader = read.createReader(p2e.cfg.reader.file, {
            batchLimit: p2e.batchLimit,
            bookmark: {
                dir: path.resolve(p2e.spool, '.bookmark'),
            }
        })
        .on('readable', function () {
            // log file is readable, read a line (see 'read') 
            this.readLine();  // 'this' is a reader
        })
        .on('read', p2e.readLogLine.bind(p2e))
        .on('end', function (done) {
            // console.log('reader end');
            p2e.doQueue(done);
        });
    });
}

PostfixToElastic.prototype.readLogLine = function (data, lineCount, done) {

    var parsed = postdoc.parseLine(this.parser, data, lineCount);
    if (!parsed) return;

    this.queue.push(parsed);

    // tell reader to send another line
    done();
};

PostfixToElastic.prototype.doneQueue = function(err, done) {
    var p2e = this;

    if (err) {
        console.error(err);
        setTimeout(function () {
            p2e.doQueue();  // retry
        }, 15 * 1000);
        return;
    }

    // batch of lines is safely committed to ES, reset
    p2e.pfDocs = {};
    p2e.queue = [];
    p2e.queueActive = false;
    if (done) done();   // resume emitting lines
};

PostfixToElastic.prototype.doQueue = function(done) {
    var p2e = this;

    if (this.queue.length === 0) {
        return this.doneQueue('doQueue: no items in queue');
    }

    if (this.queueActive) {
        console.log('queue already active');
        return;
    }

    if (process.env.WANTS_SHUTDOWN) return;

    this.queueActive = true;
    p2e.populatePfdocsFromEs(function (err, res) {
        console.log('populatePfdocsFromEs returned');
        if (err) return p2e.doneQueue(err);

        // update pfDocs with log entries
        p2e.updatePfDocs(function (err, res) {
            console.log('\tupdatePfDocs returned');
            if (err) return p2e.doneQueue(err);

            p2e.saveResultsToEs(function (err, res) {
                console.log('\tsaveResultsToEs returned');
                if (err) return p2e.doneQueue(err);
                console.log('\t\tdocs saved to ES');
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

    // get all pfQids from ES postfix-orphan index
    this.elastic.search({
        index: 'postfix-orphan',
        type: 'postfix-orphan',
        size: p2e.batchLimit * 3,
        body: {
            filter: {
                terms: { 'qid': uniqueQids }
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

        console.log('\tpostfix orphan match count: ' + res.hits.total);
        // console.log(util.inspect(res.hits, {depth:null}));

        // populate pfDocs from ES
        for (var i = 0; i < res.hits.hits.length; i++) {
            var qid = res.hits.hits[i]._source.qid;
            if (p2e.pfDocs[qid]) {
                console.error('\tdupe');
                continue;
            }
            p2e.pfDocs[qid] = res.hits.hits[i]._source;
            p2e.pfDocs[qid]._id = res.hits.hits[i]._id;
        }
        done();
    });
};

PostfixToElastic.prototype.updatePfDocs = function(done) {

    for (var j = 0; j < this.queue.length; j++) {
        var logObj = this.queue[j];
        var qid    = logObj.qid;

        // default document template
        if (!this.pfDocs[qid]) this.pfDocs[qid] = {
            qid:     qid,
            host:    logObj.host,
            events:  [],
            date:    logObj.date,
            isFinal: false,
        };
        postdoc.update(this.pfDocs[qid], logObj);
    }
    done();
};

PostfixToElastic.prototype.saveResultsToEs = function(done) {
    var p2e = this;
    // create/update 'em all to ES
    // console.log(util.inspect(this.pfDocs, {depth: null}));
    var esBulk = [];  // index, create, update

    Object.keys(p2e.pfDocs).forEach(function (qid) {
        var doc = p2e.pfDocs[qid];

        if (doc._id) {
            var id = doc._id;
            delete doc._id;
            esBulk.push({ index : {
                    _index: 'postfix-orphan',
                    _type: 'postfix-orphan',
                    _id: id,
                },
            }, doc);
        }
        else {
            esBulk.push({ create : {
                    _index: 'postfix-orphan',
                    _type: 'postfix-orphan',
                }
            }, doc);
        }
    });

    // console.log(esBulk);
    p2e.elastic.bulk({ body: esBulk }, function (err, res) {
        if (err) return done(err);
        if (res.errors) {
            console.log(util.inspect(res.errors, {depth: null}));
            return done('bulk errors, see logs');
        }
        done(null, res);
    });
};

PostfixToElastic.prototype.loadConfig = function(etcDir) {
    var file = 'log-ship-elastic-postfix.ini';
    var candidates = [];
    if (etcDir) candidates.push(path.resolve(etcDir, file));
    if (etcDir !== '/etc') {
        candidates.push(path.resolve('/etc', file));
    }

    // first one that is readable wins
    for (var i = 0; i < candidates.length; i++) {
        var filePath = candidates[i];
        try {
            var data = fs.readFileSync(filePath, 'utf-8');
            return ini.parse(data);
        }
        catch (ignore) {}
    }
};

module.exports = {
    createShipper: function (etcDir) {
        return new PostfixToElastic(etcDir);
    }
};
