'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const logger = require('../lib/logger');

describe('logger', () => {
  ['info', 'error', 'debug'].forEach((level) => {
    it(`has ${level} function`, () => {
      assert.strictEqual(typeof logger[level], 'function');
    });
  });

  describe('emits log entries', () => {
    it('debug', () => {
      process.env.DEBUG = 1;
      assert.ifError(logger.debug('test debug'));
      delete process.env.DEBUG;
    });

    it('info', () => {
      delete process.env.NODE_ENV;
      assert.ifError(logger.info('test info'));
      process.env.NODE_ENV = 'test';
    });

    it('error', () => {
      assert.ifError(logger.error('test error'));
    });
  });
});

