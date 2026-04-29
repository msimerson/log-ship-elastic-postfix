'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it, before, after } = require('node:test');

const logship = require('../lib/logship');
const spool = require('../lib/spool');

describe('log-ship-elastic-postfix', () => {
  const shipper = logship.createShipper('./test');

  before(() => {
    return new Promise((resolve) => {
      fs.chmod(path.resolve('test', 'spool', 'nowrite'), '0555', (err) => {
        if (err) console.error(err);
        resolve();
      });
    });
  });

  after(() => {
    if (shipper) {
      if (shipper.watchdogTimer) {
        clearTimeout(shipper.watchdogTimer);
      }
      if (shipper.elastic) {
        if (typeof shipper.elastic.close === 'function') {
          try {
            shipper.elastic.close();
          }
          catch (_) {
            // ignore
          }
        }
        shipper.elastic = null;
      }
    }
    if (global.gc) {
      global.gc();
    }
  });

  describe('spool', () => {
    it('spool dir is defined', () => {
      assert.ok(shipper.cfg.main.spool);
    });

    it('spool dir is writable', () => {
      return new Promise((resolve, reject) => {
        spool.isWritable(shipper.cfg.main.spool, (err) => {
          if (err) reject(err);
          else {
            assert.ifError(err);
            resolve();
          }
        });
      });
    });

    it('errs if spool dir is not writable', () => {
      return new Promise((resolve) => {
        const spoolDir = path.resolve('./test', 'spool', 'nowrite');
        spool.isValidDir(spoolDir, (err) => {
          assert.strictEqual(err.code, 'EACCES');
          resolve();
        });
      });
    });
  });

  describe('fs utilities', () => {
    it('isDirectory reports true for dir', () => {
      assert.strictEqual(
        spool.isDirectory(path.resolve('./test', 'spool')), true);
    });

    it('isDirectory reports false for file', () => {
      const spoolFile = path.resolve('./test', 'spool', 'file');
      assert.strictEqual(spool.isDirectory(spoolFile), false);
    });

    it('isWritable reports true for writable dir', () => {
      const spoolDir = path.resolve('./test', 'spool');
      assert.strictEqual(spool.isWritable(spoolDir), true);
    });

    it('isWritable reports false for non-writable dir', () => {
      const spoolDir = path.resolve('./test', 'spool', 'nowrite');
      assert.strictEqual(spool.isWritable(spoolDir), false);
    });

    it('isWritablePreV12 reports true for writable dir', () => {
      const spoolDir = path.resolve('./test', 'spool');
      assert.strictEqual(spool.isWritablePreV12(spoolDir), true);
    });

    it('isWritablePreV12 reports false for non-writable dir', () => {
      const spoolDir = path.resolve('./test', 'spool', 'nowrite');
      assert.strictEqual(spool.isWritablePreV12(spoolDir), false);
    });
  });
});


