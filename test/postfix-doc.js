'use strict';

var assert = require('assert');
var util     = require('util');

var shipper = require('../index');
var postdoc = require('../lib/postfix-doc');

/* jshint maxlen: 250 */
var testLine = 'Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: from=<system>, size=813, nrcpt=1 (queue active)';

describe('postfix-doc', function () {

    describe('addEvent', function () {
        var Ship = shipper.createShipper('./test');

        before(function (done) {
            Ship.readLogLine(testLine, 1);
            Ship.updatePfDocs(function () {
                // console.log(Ship.pfDocs);
                done();
            });
        });

        it('appends an event to a doc', function (done) {
            var doc = Ship.pfDocs['3mfHGL1r9gzyQP'];
            postdoc.addEvent(doc, { qid: '3mfHGL1r9gzyQP', action: 'removed' });
            assert.equal(doc.events.length, 2, util.inspect(doc, {depth: null}));
            done();
        });

        it('does not append duplicate event', function (done) {
            var doc = Ship.pfDocs['3mfHGL1r9gzyQP'];
            postdoc.addEvent(doc, { qid: '3mfHGL1r9gzyQP', action: 'removed' });
            assert.equal(doc.events.length, 2, util.inspect(doc, {depth: null}));
            done();
        });

        it('does not append subsequent queue events', function (done) {
            var doc = Ship.pfDocs['3mfHGL1r9gzyQP'];
            postdoc.addEvent(doc, {
                qid: '3mfHGL1r9gzyQP',
                action: 'queued',
                date: 'Does not matter',
            });
            assert.equal(doc.events.length, 2, util.inspect(doc, {depth: null}));
            done();
        });
    });

    describe('update', function () {
        // Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP:
        //      from=<system>, size=813, nrcpt=1 (queue active)
        var Ship = shipper.createShipper('./test');
        it('updates a postfix doc with a qmgr line ', function (done) {
            Ship.pfDocs['3mfHGL1r9gzyQP'] = {
                qid:     '3mfHGL1r9gzyQP',
                host:    'mx12',
                events:  [],
                date:    'Jul  5 20:21:22',
                isFinal: false,
            };
            var doc = Ship.pfDocs['3mfHGL1r9gzyQP'];
            postdoc.update(doc, {
                'prog': 'postfix/qmgr',
                'date': 'Jul  5 20:21:22',
                'qid': '3mfHGL1r9gzyQP',
                'host': 'mx12',
                'from': 'system',
                'size': 813,
                'nrcpt': 1,
            });
            assert.deepEqual(Ship.pfDocs['3mfHGL1r9gzyQP'], {
                qid: '3mfHGL1r9gzyQP',
                host: 'mx12',
                events: [ { date: 'Jul  5 20:21:22', action: 'queued' } ],
                date: 'Jul  5 20:21:22',
                isFinal: false,
                from: 'system',
                size: 813,
                nrcpt: 1,
            },
            util.inspect(Ship.pfDocs['3mfHGL1r9gzyQP'], {depth: null}));
            done();
        });

        it('updates the postfix doc with a pickup line', function (done) {
            var doc = Ship.pfDocs['3mfHGL1r9gzyQP'];
            postdoc.update(doc, {
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
            util.inspect(doc, {depth: null}));
            done();
        });

        it('updates the postfix doc with a bounce line', function (done) {
            var doc = Ship.pfDocs['3mfHGL1r9gzyQP'];
            postdoc.update(doc, {
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
                    { date: 'Jul 30 01:14:46',
                      message: 'sender non-delivery notification: 3mhjft5mzQzyNY',
                      action: 'bounced' }
                ],
                date: 'Jul  5 20:21:22',
                isFinal: false,
                from: 'system',
                size: 813,
                nrcpt: 1,
                uid: 1206
            },
            util.inspect(doc, {depth: null}));
            done();
        });

        it('updates the postfix doc with an error line', function (done) {
            var doc = Ship.pfDocs['3mfHGL1r9gzyQP'];
            postdoc.update(doc, {
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
                    action: 'bounced' },
                    { to: 'teehel@tvtanks.com',
                        relay: 'none',
                    delay: '34093',
                    delays: '34093/0.07/0/0.19',
                    dsn: '4.4.1',
                    status: 'deferred (delivery temporarily suspended: connect to mail.tvtanks.com[72.200.300.229]:25: Connection timed out)' }
                ],
                date: 'Jul  5 20:21:22',
                isFinal: false,
                from: 'system',
                size: 813,
                nrcpt: 1,
                uid: 1206
            },
            util.inspect(doc, {depth: null}));
            done();
        });
    });
});