'use strict';
/* jshint maxlen: 100 */

var assert   = require('assert');
var fs       = require('fs');
var path     = require('path');

var logship  = require('../lib/logship');
var spool    = require('../lib/spool');
var hostName = require('os').hostname();

describe('log-ship-elastic-postfix', function () {
    var shipper = logship.createShipper('./test');

    before(function (done) {
        fs.chmod(path.resolve('test','spool','nowrite'), '0444', function (err) {
            if (err) console.error(err);
            done();
        });
    });

    describe('spool', function () {
        it('spool dir is defined', function (done) {
            assert.ok(shipper.cfg.main.spool);
            done();
        });

        it('spool dir is writable', function (done) {
            spool.isWritable(shipper.cfg.main.spool, function (err) {
                assert.ifError(err);
                done();
            });
        });

        it('errs if spool dir is not writable', function (done) {
            var errShip = logship.createShipper('./test');
            var spoolDir = path.resolve('./test', 'spool','nowrite');
            // console.log(errShip);
            spool.isValidDir(spoolDir, function (err) {
                assert.equal(err.code, 'EACCES');
                done();
            });
        });
    });

    describe('fs utilities', function () {
        it('isDirectory reports true for dir', function (done) {
            assert.equal(
                spool.isDirectory(path.resolve('./test', 'spool')), true);
            done();
        });

        it('isDirectory reports false for file', function (done) {
            var spoolFile = path.resolve('./test', 'spool','file');
            assert.equal(spool.isDirectory(spoolFile), false);
            done();
        });

        it('isWritable reports true for writable dir', function (done) {
            var spoolDir = path.resolve('./test', 'spool');
            assert.equal(spool.isWritable(spoolDir), true);
            done();
        });

        it('isWritable reports false for non-writable dir', function (done) {
            var spoolDir = path.resolve('./test', 'spool', 'nowrite');
            assert.equal(spool.isWritable(spoolDir), false);
            done();
        });

        it('isWritablePreV12 reports true for writable dir', function (done) {
            var spoolDir = path.resolve('./test', 'spool');
            assert.equal(spool.isWritablePreV12(spoolDir), true);
            done();
        });

        it('isWritablePreV12 reports false for non-writable dir', function (done) {
            var spoolDir = path.resolve('./test', 'spool', 'nowrite');
            assert.equal(spool.isWritablePreV12(spoolDir), false);
            done();
        });
    });
});
