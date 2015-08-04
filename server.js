
var fs       = require('fs');
var path     = require('path');
var util     = require('util');

var logship  = require('./lib/logship');
var shipper  = logship.createShipper('./');

/*
process.on('SIGHUP', function () {
    console.log('SIGHUP: reloading config');
});
*/
process.on('SIGINT', function() {     // Control-C
    console.log('\nSIGINT received (Ctrl-C)');
    shipper.shutdown();
});

process.on('SIGTERM', function () {   // kill $PID
    console.log('\nSIGTERM received');
    shipper.shutdown();
});
