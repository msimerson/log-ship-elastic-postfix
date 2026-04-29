'use strict';

const assert = require('node:assert/strict');
const { describe, it, after } = require('node:test');

const logship = require('../lib/logship');

describe('log-ship-elastic-postfix', () => {
  const shipper = logship.createShipper('./test');

  after(() => {
    if (shipper.watchdogTimer) {
      clearTimeout(shipper.watchdogTimer);
    }
    if (shipper.elastic && typeof shipper.elastic.close === 'function') {
      shipper.elastic.close();
    }
  });

  describe('config', () => {
    it('finds a log-ship-elastic-postfix.ini', () => {
      assert.ok(shipper);
    });

    it('config has required sections', () => {
      ['main', 'elastic', 'parser', 'reader'].forEach((s) => {
        assert.ok(shipper.cfg[s]);
      });
    });
  });
});


