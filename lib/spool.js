'use strict';

if (process.env.COVERAGE) require('blanket');

var fs        = require('fs');
var path      = require('path');

exports.isValidDir = function(dir, done) {

    if (!done) {
        if (this.isDirectory(dir) && this.isWritable(dir)) {
            return true;
        }
        if (!this.isDirectory(dir)) {
            var parentDir = path.dirname(dir);
            console.log('parent dir: ' + parentDir);
            if (!this.isDirectory(parentDir)) {
                fs.mkdirSync(parentDir);
            }
            fs.mkdirSync(dir);
        }

        return false;
    }

    this.isDirectory(dir, function (err) {
        if (err) return done(err);
        this.isWritable(dir, function (err) {
            if (err) return done(err);
            done(err, true);
        });
    }.bind(this));
};

exports.isDirectory = function(dir, done) {
    if (!done) {
        try {
            var stat = fs.statSync(dir);
        }
        catch (ignore) {}
        if (!stat) return false;
        return stat.isDirectory();
    }

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

exports.isWritable = function(dir, done) {
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

exports.isWritablePreV12 = function(dir, done) {
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
