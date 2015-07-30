'use strict';

var assert   = require('assert');

var shipper  = require('../index');
var Ship     = shipper.createShipper('./test');
var hostName = require('os').hostname();

describe('log-ship-elasticsearch-postfix', function () {

    describe('reader', function () {

        // these don't load unless an ES connection is available
        if (/(?:travis|worker|dev-test)/.test(hostName)) {

            it('should load', function (done) {
                assert.ok(Ship.reader);
                done();
            });

            if (Ship.reader) {
                it('is readable', function (done) {
                    assert.ok(Ship.reader.liner &&
                        (Ship.reader.liner.readable || Ship.queue.length));
                    // console.log(Ship.reader.liner.readable);
                    // console.log(Ship.queue);
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