'use strict';

var assert   = require('assert');

var shipper  = require('../index');
var Ship     = shipper.createShipper('./test');

describe('log-ship-elasticsearch-postfix', function () {
    describe('parser', function () {
        it('configured parser loads', function (done) {
            assert.ok(Ship.parser);
            done();
        });

        it.skip('parses postfix log entries', function (done) {
            done();
        });
    });
});