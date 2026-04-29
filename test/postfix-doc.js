'use strict';

const assert = require('node:assert/strict');
const util = require('node:util');
const { describe, it, before, after } = require('node:test');

const logship = require('../lib/logship');

const testLine = 'Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: from=<system>, size=813, nrcpt=1 (queue active)';

describe('postfix-doc', () => {
  it('configured parser loads', () => {
    const shipper = logship.createShipper('./test');
    assert.ok(shipper.postdoc.parser);
  });

  describe('addEvent', () => {
    let shipper;

    before(() => {
      return new Promise((resolve) => {
        shipper = logship.createShipper('./test');
        shipper.readLogLine(testLine, 1);
        shipper.updatePfDocs(() => {
          resolve();
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
          shipper.elastic = null;
        }
      }
      if (global.gc) {
        global.gc();
      }
    });

    it('appends an event to a doc', () => {
      const doc = shipper.pfDocs['3mfHGL1r9gzyQP'];
      shipper.postdoc.addEvent(doc, { qid: '3mfHGL1r9gzyQP', action: 'removed' });
      assert.strictEqual(doc.events.length, 2, util.inspect(doc, { depth: null }));
    });

    it('does not append duplicate event', () => {
      const doc = shipper.pfDocs['3mfHGL1r9gzyQP'];
      shipper.postdoc.addEvent(doc, { qid: '3mfHGL1r9gzyQP', action: 'removed' });
      assert.strictEqual(doc.events.length, 2, util.inspect(doc, { depth: null }));
    });

    it('does not append subsequent queue events', () => {
      const doc = shipper.pfDocs['3mfHGL1r9gzyQP'];
      shipper.postdoc.addEvent(doc, {
        qid: '3mfHGL1r9gzyQP',
        action: 'queued',
        date: 'Does not matter',
      });
      assert.strictEqual(doc.events.length, 2, util.inspect(doc, { depth: null }));
    });
  });

  describe('update', () => {
    let shipper;

    before(() => {
      shipper = logship.createShipper('./test');
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
          shipper.elastic = null;
        }
      }
      if (global.gc) {
        global.gc();
      }
    });

    it('updates a postfix doc with a qmgr line ', () => {
      shipper.pfDocs['3mfHGL1r9gzyQP'] = {
        qid:     '3mfHGL1r9gzyQP',
        host:    'mx12',
        events:  [],
        date:    'Jul  5 20:21:22',
        isFinal: false,
      };
      const doc = shipper.pfDocs['3mfHGL1r9gzyQP'];
      shipper.postdoc.update(doc, {
        prog: 'postfix/qmgr',
        date: 'Jul  5 20:21:22',
        qid: '3mfHGL1r9gzyQP',
        host: 'mx12',
        from: 'system',
        size: 813,
        nrcpt: 1,
      });
      assert.deepEqual(shipper.pfDocs['3mfHGL1r9gzyQP'], {
        qid: '3mfHGL1r9gzyQP',
        host: 'mx12',
        events: [ { date: 'Jul  5 20:21:22', action: 'queued' } ],
        date: 'Jul  5 20:21:22',
        isFinal: false,
        from: 'system',
        size: 813,
        nrcpt: 1,
      },
      util.inspect(shipper.pfDocs['3mfHGL1r9gzyQP'], { depth: null }));
    });

    it('updates the postfix doc with a pickup line', () => {
      const doc = shipper.pfDocs['3mfHGL1r9gzyQP'];
      shipper.postdoc.update(doc, {
        prog: 'postfix/pickup',
        date: 'Jul 29 16:18:30',
        qid: '3mfHGL1r9gzyQP',
        host: 'mx5',
        uid: 1206,
        from: 'system',
      });

      assert.deepEqual(doc, {
        qid: '3mfHGL1r9gzyQP',
        host: 'mx12',
        events: [ { date: 'Jul  5 20:21:22', action: 'queued' } ],
        date: 'Jul  5 20:21:22',
        isFinal: false,
        from: 'system',
        size: 813,
        nrcpt: 1,
        uid: 1206
      },
      util.inspect(doc, { depth: null }));
    });

    it('updates the postfix doc with a bounce line', () => {
      const doc = shipper.pfDocs['3mfHGL1r9gzyQP'];
      shipper.postdoc.update(doc, {
        prog: 'postfix/bounce',
        date: 'Jul 30 01:14:46',
        qid: '3mfHGL1r9gzyQP',
        host: 'mx5',
        message: 'sender non-delivery notification: 3mhjft5mzQzyNY',
      });

      assert.deepEqual(doc, {
        qid: '3mfHGL1r9gzyQP',
        host: 'mx12',
        events: [
          { date: 'Jul  5 20:21:22', action: 'queued' },
          {
            date: 'Jul 30 01:14:46',
            message: 'sender non-delivery notification: 3mhjft5mzQzyNY',
            action: 'bounced'
          }
        ],
        date: 'Jul  5 20:21:22',
        isFinal: false,
        from: 'system',
        size: 813,
        nrcpt: 1,
        uid: 1206
      },
      util.inspect(doc, { depth: null }));
    });

    it('updates the postfix doc with an error line', () => {
      const doc = shipper.pfDocs['3mfHGL1r9gzyQP'];
      shipper.postdoc.update(doc, {
        qid: '3mfHGL1r9gzyQP',
        to: 'teehel@tvtanks.com',
        relay: 'none',
        delay: '34093',
        delays: '34093/0.07/0/0.19',
        dsn: '4.4.1',
        status: 'deferred (delivery temporarily suspended: connect to mail.tvtanks.com[72.200.300.229]:25: Connection timed out)',
      });

      assert.deepEqual(doc, {
        qid: '3mfHGL1r9gzyQP',
        host: 'mx12',
        events: [
          { date: 'Jul  5 20:21:22', action: 'queued' },
          { date: 'Jul 30 01:14:46',
            message: 'sender non-delivery notification: 3mhjft5mzQzyNY',
            action: 'bounced'
          },
          {
            to: 'teehel@tvtanks.com',
            relay: 'none',
            delay: '34093',
            delays: '34093/0.07/0/0.19',
            dsn: '4.4.1',
            status: 'deferred (delivery temporarily suspended: connect to mail.tvtanks.com[72.200.300.229]:25: Connection timed out)'
          }
        ],
        date: 'Jul  5 20:21:22',
        isFinal: false,
        from: 'system',
        size: 813,
        nrcpt: 1,
        uid: 1206
      },
      util.inspect(doc, { depth: null }));
    });

    it('updates a postfix doc with postsuper lines', () => {
      shipper.pfDocs['3nsRhm5bH5z306M'] = {
        qid:     '3nsRhm5bH5z306M',
        host:    'mailq2',
        events:  [],
        date:    'Nov  6 01:01:03',
        isFinal: false,
      };
      const doc = shipper.pfDocs['3nsRhm5bH5z306M'];
      shipper.postdoc.update(doc, {
        date: 'Nov  6 01:01:03',
        host: 'mailq2',
        prog: 'postfix/postsuper',
        msg: 'released from hold',
        qid: '3nsRhm5bH5z306M',
      });
      shipper.postdoc.update(doc, {
        date: 'Nov  6 01:01:04',
        host: 'mailq2',
        prog: 'postfix/postsuper',
        msg: 'removed',
        qid: '3nsRhm5bH5z306M',
      });
      assert.deepEqual(doc, {
        qid: '3nsRhm5bH5z306M',
        host: 'mailq2',
        events: [
          { date: 'Nov  6 01:01:03', action: 'released from hold' },
          { date: 'Nov  6 01:01:04', action: 'removed' }
        ],
        date: 'Nov  6 01:01:03',
        isFinal: true
      },
      util.inspect(shipper.pfDocs['3nsRhm5bH5z306M'], { depth: null }));
    });
  });
});
