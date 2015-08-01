'use strict';
/* jshint maxlen: 100 */

var assert  = require('assert');
var fs      = require('fs');
var path    = require('path');

var logship  = require('../lib/logship');
// var hostName = require('os').hostname();

describe('log-ship-elastic-postfix', function () {
    var shipper = logship.createShipper('./test');

    describe('config', function () {
        it('finds a log-ship-elastic-postfix.ini', function (done) {
            assert.ok(shipper);
            done();
        });

        it('config has required sections', function (done) {
            // console.log(cfg);
            ['main', 'elastic', 'parser', 'reader'].forEach(function (s) {
                assert.ok(shipper.cfg[s]);
            });
            done();
        });
    });
});
