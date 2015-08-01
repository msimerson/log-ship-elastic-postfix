
var fs       = require('fs');
var path     = require('path');
var util     = require('util');

var logship  = require('./lib/logship');
var shipper  = logship.createShipper('./');

var shutdown = function () {
    console.log('starting graceful shutdown');

    process.env.WANTS_SHUTDOWN=1;

    if (shipper.reader && shipper.reader.liner) {
        shipper.reader.liner.close();
    }

    if (!shipper.elasticAlive) process.exit();
    if (!shipper.queueActive) process.exit();

    var maxWait = setTimeout(function () {
        // if things haven't shut down in 10s, die anyway
        process.exit();
    }, 10 * 1000);

    function waitForQueue () {
        if (shipper.queueActive) {
            console.log('queue is active');
            setTimeout(function () {
                waitForQueue();
            }, 1 * 1000);
            return;
        }

        process.exit();
    }
    waitForQueue();
};

/*
process.on('SIGHUP', function () {
    console.log('SIGHUP: reloading config');
});
*/
process.on('SIGINT', function() {     // Control-C
    console.log('\nSIGINT received (Ctrl-C)');
    shutdown();
});

process.on('SIGTERM', function () {   // kill $PID
    console.log('\nSIGTERM received');
    shutdown();
});
