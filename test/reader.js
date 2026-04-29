'use strict';

const assert = require('node:assert/strict');
const { describe, it, after } = require('node:test');

const logship = require('../lib/logship');

describe('reader', () => {
  const shipper = logship.createShipper('./test');

  describe('when elasticsearch is available', () => {
    // ES tests will skip if elasticsearch is not reachable
    it('should load', { skip: !shipper.reader }, () => {
      assert.ok(shipper.reader);
    });

    if (shipper.reader) {
      it('is readable', () => {
        assert.ok(shipper.reader.liner &&
          (shipper.reader.liner.readable || shipper.queue.length));
      });

      it('creates an instance for a test log file', { skip: true }, () => {});

      it('reads the expected log lines', { skip: true }, () => {});

      it('saves a bookmark', { skip: true }, () => {});
    }
    else {
      it('needs elasticsearch available', { skip: true }, () => {});
    }
  });

  after(() => {
    if (shipper) {
      if (shipper.watchdogTimer) clearTimeout(shipper.watchdogTimer);
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
});


