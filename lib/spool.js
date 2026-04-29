'use strict';

const fs = require('node:fs');
const path = require('node:path');

const logger = require('./logger');

exports.isValidDir = function(dir, done) {
  if (!done) {
    if (this.isDirectory(dir) && this.isWritable(dir)) {
      return true;
    }
    if (!this.isDirectory(dir)) {
      const parentDir = path.dirname(dir);
      logger.info('parent dir: ' + parentDir);
      if (!this.isDirectory(parentDir)) {
        fs.mkdirSync(parentDir);
      }
      fs.mkdirSync(dir);
    }

    return false;
  }

  this.isDirectory(dir, (err) => {
    if (err) return done(err);
    this.isWritable(dir, (err) => {
      if (err) return done(err);
      done(err, true);
    });
  });
};

exports.isDirectory = function(dir, done) {
  if (!done) {
    try {
      const stat = fs.statSync(dir);
      if (!stat) return false;
      return stat.isDirectory();
    }
    catch {
      return false;
    }
  }

  fs.stat(dir, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // TODO: make this recursive
        logger.info('mkdir: ' + dir);
        fs.mkdir(dir, (err) => {
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
      fs.accessSync(dir, fs.constants.W_OK);
    }
    catch {
      return false;
    }
    return true;
  }

  fs.access(dir, fs.constants.W_OK, (err) => {
    if (err) {
      logger.error('ERROR: spool dir is not writable: ' + err.code);
      return done(err);
    }
    done(err, true);
  });
};

exports.isWritablePreV12 = function(dir, done) {
  const tmpFile = path.resolve(dir, '.tmp');
  if (!done) {
    try {
      fs.writeFileSync(tmpFile, 'write test');
      fs.unlinkSync(tmpFile);
    }
    catch {
      return false;
    }
    return true;
  }

  fs.writeFile(tmpFile, 'write test', (err) => {
    if (err) {
      logger.error('ERROR: spool dir is not writable: ' + err.code);
      return done(err);
    }
    fs.unlink(tmpFile, (err) => {
      done(err, true);
    });
  });
};

