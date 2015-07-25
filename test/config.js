'use strict';

var assert  = require('assert');
var fs      = require('fs')

var shipper = require('../index');

describe('log-ship-elasticsearch-postfix', function () {
    describe('config', function () {
        it('finds a log-ship-elasticsearch-postfix.ini', function (done) {
            var Ship = shipper.createShipper('./test');
            assert.ok(Ship)
            // console.log(Ship.cfg);
            done();
        });

        it('config has required sections', function (done) {
            var cfg = shipper.createShipper('./test').cfg;
            // console.log(cfg);
            ['main', 'elastic', 'parser', 'reader'].forEach(function (s) {
                assert.ok(cfg[s]);
            });
            done();
        });

        it('determines the spool dir', function (done) {
            var cfg = shipper.createShipper('./test').cfg;
            assert.ok(cfg.main.spool);
            done();
        });

        it('spool dir is writable', function (done) {
            var cfg = shipper.createShipper('./test').cfg;
            fs.access(cfg.main.spool, fs.W_OK, function(err) {
                assert.ifError(err);
                done();
            });
        });

        it('throws if spool dir is not writable', function (done) {
            done();
        });
    });
});