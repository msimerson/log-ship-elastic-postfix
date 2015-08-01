'use strict';

var fs        = require('fs');
var path      = require('path');

var ini       = require('ini');

exports.loadConfig = function(etcDir) {
    var file = 'log-ship-elastic-postfix.ini';
    var candidates = [];
    if (etcDir) candidates.push(path.resolve(etcDir, file));
    if (etcDir !== '/etc') {
        candidates.push(path.resolve('/etc', file));
    }
    if (etcDir !== './') {
        candidates.push(path.resolve('./', file));
    }

    // first one that is readable wins
    for (var i = 0; i < candidates.length; i++) {
        var filePath = candidates[i];
        try {
            var data = fs.readFileSync(filePath, 'utf-8');
            return ini.parse(data);
        }
        catch (ignore) {
            console.error(ignore);
        }
    }
};
