'use strict';

// node built-ins
const fs = require('node:fs');
const path = require('node:path');

// npm modules
const ini = require('ini');

// local modules
const logger = require('./logger');

function loadConfig(etcDir) {
  const file = 'log-ship-elastic-postfix.ini';
  const candidates = [];
  if (etcDir) candidates.push(path.resolve(etcDir, file));
  if (etcDir !== '/etc') {
    candidates.push(path.resolve('/etc', file));
  }
  if (etcDir !== './') {
    candidates.push(path.resolve('./', file));
  }

  // first one that is readable wins
  for (let i = 0; i < candidates.length; i++) {
    const filePath = candidates[i];
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return ini.parse(data);
    }
    catch (ignore) {
      logger.error(ignore);
    }
  }
}

module.exports = function (etcDir) {
  return new loadConfig(etcDir);
};
