'use strict';

var assert   = require('assert');

var logship  = require('../lib/logship');
var shipper  = logship.createShipper('./test');
var hostName = require('os').hostname();

describe('log-ship-elastic-postfix', function () {

  describe('reader', function () {

    // these don't load unless an ES connection is available
    if (/(?:travis|worker|dev-test|testing-docker)/.test(hostName)) {

      it('should load', function (done) {
        assert.ok(shipper.reader);
        done();
      });

      if (shipper.reader) {
        it('is readable', function (done) {
          assert.ok(shipper.reader.liner &&
            (shipper.reader.liner.readable || shipper.queue.length));
          // console.log(shipper.reader.liner.readable);
          // console.log(shipper.queue);
          done();
        });

        it.skip('creates an instance for a test log file', function (done) {
          done();
        });

        it.skip('reads the expected log lines', function (done) {
          done();
        });

        it.skip('saves a bookmark', function (done) {
          done();
        });
      }
    }
    else {
      it.skip('needs elasticsearch available', function (done) {
        console.log('hostname: ' + hostName);
        done();
      });
    }
  });
});
