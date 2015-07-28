'use strict';

// node built-ins
var fs        = require('fs');
var path      = require('path');
var util      = require('util');

// npm modules
var ini       = require('ini');
var moment    = require('moment');

function PostfixToElastic (etcDir) {
	this.cfg    = this.loadConfig(etcDir);
	this.spool  = this.cfg.main.spool || '/var/spool/log-ship';
	this.validateSpoolDir();
	this.batchSize = 100;

	this.parser = require(this.cfg.parser.module);

	var esm = require(this.cfg.elastic.module);
	this.eshosts = this.cfg.elastic.hosts.split(/[, ]+/);
	console.log(this.eshosts);
	this.elastic = new esm.Client({
		hosts: this.eshosts,
		// log: 'trace',
	});

	this.queue = [];
	
	var p2e = this;

	var logRead = function (data) {
		var syslogObj = p2e.parser.asObject('syslog', data);
		if (!syslogObj || !syslogObj.prog) {
			emitParseError('syslog', data);
		}
		// console.log(syslogObj);
		if (!/^postfix/.test(syslogObj.prog)) return; // not postfix, ignore
		// console.log(syslogObj);
		var parsed = p2e.parser.asObject(syslogObj.prog, syslogObj.msg);
		['host','prog'].forEach(function (f) {
			if (!syslogObj[f]) return;
			parsed[f] = syslogObj[f];
		});
		parsed.date = moment(syslogObj.date, 'MMM DD HH:mm:ss').format();
		p2e.queue.push(parsed);
	};

	var logReadable = function () {
    	if (p2e.queue.length > p2e.batchSize) {
    		// queue is full, trigger an ES send
    		p2e.doQueue();
    		return;
    	}
    	this.read();
	};

	var read = require(this.cfg.reader.module);
	this.reader = read.createReader(this.cfg.reader.file, {
		bookmark: {
			dir: path.resolve(this.spool, '.bookmark'),
		}
	})
    .on('readable', logReadable)
	.on('read', logRead)
	.on('end', function () { p2e.doQueue(); });
}

PostfixToElastic.prototype.doneQueue = function(err) {
	var p2e = this;
	if (err) {
		console.error(err);
		console.error('pausing 15s');
		setTimeout(function () {
			p2e.doQueue();
		}, 15 * 1000);
		return;
	}
	this.reader.read();
};

function emitParseError(prog, msg) {
    console.error('PARSE ERROR for ' + prog + ':' + msg);
}

PostfixToElastic.prototype.doQueue = function() {
	var p2e = this;
	this.pfDocs = {};

	if (this.queue.length === 0) {
		return this.doneQueue('doQueue: no items in queue');
	}

	p2e.populatePfdocsFromEs(function (err, res) {
		console.log('populatePfdocsFromEs returned');
		if (err) return p2e.doneQueue(err);

		// update pfDocs with log entries
		p2e.updatePfDocs(function (err, res) {
			console.log('updatePfDocs returned');
			if (err) return p2e.doneQueue(err);

			p2e.saveResultsToEs(function (err, res) {
				console.log('saveResultsToEs returned');
				console.log(arguments);
				if (err) return p2e.doneQueue(err);
				p2e.doneQueue(null, res);
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
	console.log('\t populatePfdocsFromEs: searching ES for pfQids');

	this.elastic.search({
        index: 'postfix-orphan',
        type: 'postfix-orphan',
        body: {
        	filter: {
        		terms: { 'qid': uniqueQids }
        	}
	    }
	}, function (err, res) {
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
        	if (p2e.pfDocs[qid]) continue;
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
		console.log(logObj);

		// default document template
		if (!this.pfDocs[qid]) this.pfDocs[qid] = {
			qid:     qid,
			host:    logObj.host,
			events:  [],
			date:    logObj.date,
			isFinal: false,
		};
		this.addToPostfixDoc(logObj);
	}
	done();
};

PostfixToElastic.prototype.saveResultsToEs = function(done) {
	var p2e = this;
	// create/update 'em all to ES
	console.log(util.inspect(this.pfDocs, {depth: null}));
	var esBulk = [];  // index, create, update

	Object.keys(this.pfDocs).forEach(function (qid) {
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

	p2e.elastic.bulk({ body: esBulk }, function (err, res) {
        if (err) return done(err);
        if (res.errors) {
        	console.log(util.inspect(res.errors, {depth: null}));
        }
        done(null, res);
    });
};

PostfixToElastic.prototype.addEvent = function(e) {
	var qid = e.qid;

	if (e.action && e.action === 'queued') {
        // every time postfix touches a message, it emits a qmgr. The first
        // informs us when a message enters the queue, subsequent are useless.
        // (instead, get useful info from postfix/smtp)
        for (var i=0; i<this.pfDocs[qid].events.length; i++) {
            // if (this.pfDocs[qid].events[i].action === 'queued') return;
	    }
    }

	['qid','host','prog'].forEach(function (field) {
		delete e[field];
	});

	this.pfDocs[qid].events.push(e);
};

PostfixToElastic.prototype.addToPostfixDoc = function(lo) {
	var doc = this.pfDocs[lo.qid];

    switch (lo.prog) {
        case 'postfix/qmgr':    // a queue event (1+ per msg)
	        if (lo.msg === 'removed') {
	            doc.isFinal = true;
	            this.addEvent({ date: lo.date, action: 'removed' });
	            return;
	        }

		    if (lo.status) {
		        if (/expired, returned/.test(lo.status)) {
		            lo.action = 'expired';
		            delete lo.status;
		            this.addEvent(lo);
		            return;
		        }
		        emitParseError('qmgr', lo.msg);
		        return;
		    }

		    // qmgr did something with the queued message
		    lo.action = 'queued';

		    if (lo.from === undefined) lo.from = ''; // null sender
		    ['from','size','nrcpt'].forEach(function (field) {
		        doc[field] = lo[field];
		        delete lo[field];
		    });

		    this.addEvent(lo);
		    return;
        case 'postfix/smtp':    // a delivery attempt
       		['delay','delays'].forEach(function (field) {
		        if (lo[field] === undefined) return;
		        doc[field] = lo[field];
		        delete lo[field];
		    });
		    // doc.date = lo.date;
		    this.addEvent(lo);
        	return;
        case 'postfix/cleanup':
            ['message-id','resent-message-id'].forEach(function (h) {
                if (lo[h] === undefined) return;
                doc[h] = lo[h];
            });
            return;
        case 'postfix/scache':
            if (lo.msg.substr(0,10) === 'statistics') {
                return;
            }
            emitParseError(lo.prog, lo.msg);
            return;
        case 'postfix/pickup':   // tells us the uid
            doc.uid = lo.uid;
            return;
        case 'postfix/error':
            lo.action = 'error';
            break;
        case 'postfix/bounce':
            lo.action = 'bounced';
            break;
        case 'postfix/local':    // a local process injected a message
            break;
    }
    this.addEvent(lo);
};

PostfixToElastic.prototype.loadConfig = function(etcDir) {
	var file = 'log-ship-elasticsearch-postfix.ini';
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

PostfixToElastic.prototype.validateSpoolDir = function(done) {

	if (!done) {
		if (this.isDirectory(this.spool) && this.isWritable(this.spool)) {
			return true;
		}
		return false;
	}

	this.isDirectory(this.spool, function (err) {
		if (err) return done(err);
		this.isWritable(this.spool, function (err) {
			if (err) return done(err);
			done(err, true);
		});
	}.bind(this));
};

PostfixToElastic.prototype.isDirectory = function(dir, done) {
	if (!done) return fs.statSync(dir).isDirectory();

	fs.stat(dir, function (err, stats) {
		if (err) {
			if (err.code === 'ENOENT') {
				// TODO: make this recursive
				console.log('mkdir: ' + dir);
				fs.mkdir(dir, function (err) {
					if (err) return done(err);
					done(err, true);
				});
			}
			return done(err);
		}
		return done(err, stats.isDirectory());
	});
};

PostfixToElastic.prototype.isWritable = function(dir, done) {
	if (!fs.access) { return this.isWritablePreV12(dir, done); }
	if (!done) {
		try {
			fs.accessSync(dir, fs.W_OK);
		}
		catch (e) {
			return false;
		}
		return true;
	}

	fs.access(dir, fs.W_OK, function (err) {
		if (err) {
			console.error('ERROR: spool dir is not writable: ' + err.code);
			return done(err);
		}
		done(err, true);
	});
};

PostfixToElastic.prototype.isWritablePreV12 = function(dir, done) {
	var tmpFile = path.resolve(dir, '.tmp');
	if (!done) {
		try {
			fs.writeFileSync(tmpFile, 'write test');
			fs.unlinkSync(tmpFile);
		}
		catch (e) {
			return false;
		}
		return true;
	}

	fs.writeFile(tmpFile, 'write test', function (err) {
		if (err) {
			console.error('ERROR: spool dir is not writable: ' + err.code);
			return done(err);
		}
		fs.unlink(tmpFile, function(err) {
			done(err, true);
		});
	});
};

module.exports = {
    createShipper: function (etcDir) {
        return new PostfixToElastic(etcDir);
    }
};
