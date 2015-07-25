'use strict';

var fs        = require('fs');
var path      = require('path');

var ini       = require('ini');

function PostfixToElastic (etcDir) {
	this.cfg   = this.loadConfig(etcDir);
	this.spool = this.validateSpoolDir();



}

PostfixToElastic.prototype.loadConfig = function(etcDir) {
	var file = 'log-ship-elasticsearch-postfix.ini';
	var candidates = [];
	if (etcDir) candidates.push(path.resolve(etcDir, file));
	if (etcDir !== '/etc') {
		candidates.push(path.resolve('/etc', file));
	}

	for (var i = 0; i < candidates.length; i++) {
		var filePath = candidates[i];
		if (!fs.existsSync(filePath)) continue;
		return ini.parse(fs.readFileSync(filePath, 'utf-8'));
	};
};

PostfixToElastic.prototype.validateSpoolDir = function(done) {
	var dir = this.cfg.main.spool || '/var/spool/log-ship';

	fs.stat(dir, function (err, stat) {
		if (err && err.code === 'ENOENT') {
			// TODO: make this recursive (stat parent until one exists)
			console.log('mkdir: ' + dir);
			fs.mkdir(dir, function (err) {
				if (err) return done(err);
				done(err, true);
			});
		}
		// body...
	})
};

module.exports = {
    createShipper: function (etcDir) {
        return new PostfixToElastic(etcDir);
    }
};
