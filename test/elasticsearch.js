'use strict';

var assert   = require('assert');
var fs       = require('fs');
var path     = require('path');

var shipper  = require('../index');
var Ship     = shipper.createShipper('./test');
var hostName = require('os').hostname();

describe('log-ship-elasticsearch-postfix', function () {
    /* jshint maxlen: 100 */
    describe('elasticsearch', function () {

        it('loads the specified elasticsearch module', function (done) {
            assert.ok(Ship.elastic);
            done();
        });

        if (/(?:travis|worker|dev-test)/.test(hostName)) {
            // gotta have ES available to test these...

            it('can store an index map template', function (done) {
                var filePath = path.resolve('index-map-template.json');
                var indexMap;

                fs.readFile(filePath, function (err, data) {
                    if (err) return done(err);
                    indexMap = JSON.parse(data);
                    // console.log(indexMap);

                    Ship.elastic.indices.delete({index: indexMap.template},
                    function (err) {
                        if (err) console.error(err); // may not exist
                        Ship.elastic.indices.create({index: indexMap.template },
                        function (err, res) {
                            if (err) console.error(err); // may already exist

                            Ship.elastic.indices.putMapping({
                                index: indexMap.template,
                                type: indexMap.template,
                                body: indexMap.mappings,
                            }, function (err, result) {
                                assert.ifError(err);
                                console.log(result);
                                done(err, result);
                            });                        
                        });
                    });
                });
            });

            it('connects to configured ES host', function (done) {

                Ship.elastic.ping({
                    // ping usually has a 3000ms timeout
                    // requestTimeout: Infinity,
                }, function (error) {
                    if (error) {
                       return done('elasticsearch cluster is down!');
                    }
                    done(error, 'All is well');
                });
            });

            it.skip('populatePfdocsFromEs: does', function (done) {
                done();
            });

            it.skip('saveResultsToEs saves pfDocs to ES', function (done) {
                done();
            });

            it.skip('doQueue: flushes queue to ES', function (done) {
                done();
            });

        }
        else {
            it.skip('needs elasticsearch available', function (done) {
                done();
            });
        }
    });
});
