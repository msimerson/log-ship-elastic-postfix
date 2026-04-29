'use strict';

const assert = require('node:assert/strict');
const util = require('node:util');
const { describe, it, before, after } = require('node:test');

const logship = require('../lib/logship');


const testLine = 'Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: from=<system>, size=813, nrcpt=1 (queue active)';
let shipper;

describe('log-ship-elastic-postfix', () => {
  before(() => {
    shipper = logship.createShipper('./test');
  });

  describe('readLogLine', () => {
    it('receives a log line, parses, appends to queue', () => {
      shipper.queue = [];
      shipper.readLogLine(testLine, 1);
      // Note: date parsing uses current year since log format doesn't include year
      const queueEntry = shipper.queue[0];
      assert.strictEqual(queueEntry.qid, '3mfHGL1r9gzyQP');
      assert.strictEqual(queueEntry.from, 'system');
      assert.strictEqual(queueEntry.size, '813');
      assert.strictEqual(queueEntry.nrcpt, '1');
      assert.strictEqual(queueEntry.host, 'mx12');
      assert.strictEqual(queueEntry.prog, 'postfix/qmgr');
      assert.match(queueEntry.date, /^\d{4}-07-26T04:18:34-07:00$/);
    });

    it('ignores other lines', () => {
      const notPostfixLine =
        'Jul 29 18:10:56 mx1 spamd[16960]: spamd: identified spam (9.3/5.0) for nagios:1210 in 0.9 seconds, 5 bytes';
      shipper.readLogLine(notPostfixLine, 1);
      assert.deepEqual(shipper.queue[1],
        undefined,
        util.inspect(shipper.queue[1], { depth: null })
      );
    });
  });

  describe('updatePfDocs', () => {
    it('applies log lines to pfDocs', () => {
      return new Promise((resolve) => {
        const testShipper = logship.createShipper('./test');

        testShipper.readLogLine('Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: from=<system>, size=813, nrcpt=1 (queue active)', 1);
        testShipper.readLogLine('Jul 26 04:18:34 mx12 postfix/smtp[20662]: 3mfHGL1r9gzyQP: to=<system>, relay=127.0.0.2[127.0.0.2]:25, delay=0.53, delays=0.13/0/0.23/0.16, dsn=2.0.0, status=sent (250 Queued! (#2.0.0))', 2);
        testShipper.readLogLine('Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: removed', 3);
        testShipper.updatePfDocs(() => {
          const pfDoc = testShipper.pfDocs['3mfHGL1r9gzyQP'];
          assert.strictEqual(pfDoc.qid, '3mfHGL1r9gzyQP');
          assert.strictEqual(pfDoc.host, 'mx12');
          assert.strictEqual(pfDoc.from, 'system');
          assert.strictEqual(pfDoc.size, '813');
          assert.strictEqual(pfDoc.nrcpt, '1');
          assert.strictEqual(pfDoc.delay, '0.53');
          assert.strictEqual(pfDoc.delays, '0.13/0/0.23/0.16');
          assert.strictEqual(pfDoc.isFinal, true);
          assert.strictEqual(pfDoc.events.length, 3);
          if (testShipper.watchdogTimer) clearTimeout(testShipper.watchdogTimer);
          resolve();
        });
      });
    });
  });

  after(() => {
    if (shipper) {
      if (shipper.watchdogTimer) clearTimeout(shipper.watchdogTimer);
      if (shipper.elastic) {
        if (typeof shipper.elastic.close === 'function') {
          try {
            shipper.elastic.close();
          }
          catch (_) {
            // ignore
          }
        }
        // Force cleanup of elasticsearch client
        shipper.elastic = null;
      }
    }
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });
});


