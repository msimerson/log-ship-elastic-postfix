'use strict';

var logger   = require('./lib/logger');
var logship  = require('./lib/logship');

// if adding any more CLI args, switch to using nopt
var cfgDir;
if (process.argv[2] &&
  /^\-c/.test(process.argv[2]) &&
  process.argv[3]) {
  cfgDir = process.argv[3];
  logger.info('using config dir: ' + cfgDir);
}

var shipper  = logship.createShipper(cfgDir);

/*
process.on('SIGHUP', function () {
  logger.info('SIGHUP: reloading config');
});
*/
process.on('SIGINT', function() {     // Control-C
  logger.info('\nSIGINT received (Ctrl-C)');
  shipper.shutdown();
});

process.on('SIGTERM', function () {   // kill $PID
  logger.info('\nSIGTERM received');
  shipper.shutdown();
});
