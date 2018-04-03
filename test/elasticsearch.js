
var assert   = require('assert');
var fs       = require('fs');
var path     = require('path');

var logship  = require('../lib/logship');
var shipper  = logship.createShipper('./test');
var hostName = require('os').hostname();

describe('elasticsearch', function () {

  it('loads the specified elasticsearch module', function (done) {
    assert.ok(shipper.elastic);
    done();
  });

  if (/(?:travis|worker|dev-test|testing-docker)/.test(hostName)) {
    // need ES available to test these...

    before(function (done) {
      var pfDoc = path.resolve('test', 'fixtures', 'postfix.json');
      fs.readFile(pfDoc, function (err) {
        if (err) return done(err);
        shipper.elastic.update({
          index: 'postfix-2017-11-16',
          type: 'postfix',
          id: '3p04tw2SxSz4w6c',
          body: pfDoc,
        });
        done();
      });
    });

    this.timeout(4000);
    it('can store an index map template', function (done) {
      var filePath = path.resolve('index-map-template.json');
      var indexMap;

      fs.readFile(filePath, function (err, data) {
        if (err) return done(err);
        indexMap = JSON.parse(data);
        // console.log(indexMap);

        shipper.elastic.indices.delete({ index: indexMap.template }, function () {
          console.log(arguments);
          // if (err) console.error(err); // may not exist, ignore error
          shipper.elastic.indices.create({ index: indexMap.template }, function () {
            console.log(arguments);
            // if (err) console.error(err); // may already exist

            shipper.elastic.indices.putMapping({
              index: 'postfix-orphan',
              type: 'postfix',
              body: indexMap.mappings,
            }, function (err) {
              if (err) console.error(err);
              console.log(arguments);
              // assert.ifError(err);
              // other tests are running, so currently
              // stored mapping may conflict
              done();
            });
          });
        });
      });
    });

    it('connects to configured ES host', function (done) {

      shipper.elastic.ping({
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
    it.skip('needs elasticsearch available: ' + hostName, function (done) {
      done();
    });
  }
});
