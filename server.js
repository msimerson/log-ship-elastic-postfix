
'use strict';

const logger = require('./lib/logger');
const logship = require('./lib/logship');

// if adding any more CLI args, switch to using nopt
let cfgDir;
if (process.argv[2] &&
  /^-c/.test(process.argv[2]) &&
  process.argv[3]) {
  cfgDir = process.argv[3];
  logger.info('using config dir: ' + cfgDir);
}

const shipper = logship.createShipper(cfgDir);

process.on('SIGINT', () => {     // Control-C
  logger.info('\nSIGINT received (Ctrl-C)');
  shipper.shutdown();
});

process.on('SIGTERM', () => {   // kill $PID
  logger.info('\nSIGTERM received');
  shipper.shutdown();
});

