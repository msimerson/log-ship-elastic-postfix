'use strict';

var fs        = require('fs');
var path      = require('path');

var ini       = require('ini');

function PostfixToElastic (etcDir) {
	this.cfg    = this.loadConfig(etcDir);
	this.spool  = this.cfg.main.spool || '/var/spool/log-ship';
	this.validateSpoolDir();

	this.parser = require(this.cfg.parser.module);

	var esm = require(this.cfg.elastic.module);
	this.eshosts = this.cfg.elastic.hosts.split(/[, ]+/);
	console.log(this.eshosts);
	this.elastic = new esm.Client({
		hosts: this.eshosts,
		log: 'trace',
	});



}


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

module.exports = {
    createShipper: function (etcDir) {
        return new PostfixToElastic(etcDir);
    }
};
