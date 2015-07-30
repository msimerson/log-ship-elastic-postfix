'use strict';

var assert   = require('assert');
var util     = require('util');

var shipper  = require('../index');

/* jshint maxlen: 250 */
var testLine = 'Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: from=<system>, size=813, nrcpt=1 (queue active)';

describe('log-ship-elasticsearch-postfix', function () {

    it('configured parser loads', function (done) {
        var Ship     = shipper.createShipper('./test');
        assert.ok(Ship.parser);
        done();
    });

    describe('readLogLine', function () {
        var Ship     = shipper.createShipper('./test');

        it('receives a log line, parses, appends to queue', function (done) {
            Ship.queue = [];
            Ship.readLogLine(testLine, 1);
            assert.deepEqual(Ship.queue[0],
                {   qid: '3mfHGL1r9gzyQP',
                    from: 'system',
                    size: '813',
                    nrcpt: '1',
                    host: 'mx12',
                    prog: 'postfix/qmgr',
                    date: '2015-07-26T04:18:34-07:00'
                },
                util.inspect(Ship.queue[0], {depth: null})
            );
            done();
        });

        it('ignores other lines', function (done) {
            var notPostfixLine =
                'Jul 29 18:10:56 mx1 spamd[16960]: spamd: identified spam (9.3/5.0) for nagios:1210 in 0.9 seconds, 5 bytes';
            Ship.readLogLine(notPostfixLine, 1);
            assert.deepEqual(Ship.queue[1],
                undefined,
                util.inspect(Ship.queue[1], {depth: null})
            );
            done();
        });
    });

    describe('addToPostfixDoc', function () {
        // Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP:
        //      from=<system>, size=813, nrcpt=1 (queue active)
        var Ship     = shipper.createShipper('./test');
        it('updates a postfix doc with a qmgr line ', function (done) {
            Ship.pfDocs['3mfHGL1r9gzyQP'] = {
                qid:     '3mfHGL1r9gzyQP',
                host:    'mx12',
                events:  [],
                date:    'Jul  5 20:21:22',
                isFinal: false,
            };
            Ship.addToPostfixDoc({
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
            Ship.addToPostfixDoc({
                prog: 'postfix/pickup',
                date: 'Jul 29 16:18:30',
                qid: '3mfHGL1r9gzyQP',
                host: 'mx5',
                uid: 1206,
                from: 'system',
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
                uid: 1206
            },
            util.inspect(Ship.pfDocs['3mfHGL1r9gzyQP'], {depth: null}));
            done();
        });

        it('updates the postfix doc with a bounce line', function (done) {
            Ship.addToPostfixDoc({
                prog: 'postfix/bounce',
                date: 'Jul 30 01:14:46',
                qid: '3mfHGL1r9gzyQP',
                host: 'mx5',
                message: 'sender non-delivery notification: 3mhjft5mzQzyNY',
            });

            assert.deepEqual(Ship.pfDocs['3mfHGL1r9gzyQP'], {
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
            util.inspect(Ship.pfDocs['3mfHGL1r9gzyQP'], {depth: null}));
            done();
        });

        it('updates the postfix doc with an error line', function (done) {
            Ship.addToPostfixDoc({
                qid: '3mfHGL1r9gzyQP',
                to: 'teehel@tvtanks.com',
                relay: 'none',
                delay: '34093',
                delays: '34093/0.07/0/0.19',
                dsn: '4.4.1',
                status: 'deferred (delivery temporarily suspended: connect to mail.tvtanks.com[72.200.300.229]:25: Connection timed out)',
            });

            assert.deepEqual(Ship.pfDocs['3mfHGL1r9gzyQP'], {
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
            util.inspect(Ship.pfDocs['3mfHGL1r9gzyQP'], {depth: null}));
            done();
        });
    });

    describe('addDocEvent', function () {
        var Ship     = shipper.createShipper('./test');

        before(function (done) {
            Ship.readLogLine(testLine, 1);
            Ship.updatePfDocs(function () {
                done();
            });
        });

        it('appends an event to a doc', function (done) {
            Ship.addDocEvent({
                qid: '3mfHGL1r9gzyQP',
                action: 'removed',
            });
            assert.equal(Ship.pfDocs['3mfHGL1r9gzyQP'].events.length, 2,
                util.inspect(Ship.pfDocs['3mfHGL1r9gzyQP'], {depth: null})
            );
            done();
        });

        it('does not append duplicate event', function (done) {
            Ship.addDocEvent({
                qid: '3mfHGL1r9gzyQP',
                action: 'removed',
            });
            assert.equal(Ship.pfDocs['3mfHGL1r9gzyQP'].events.length, 2,
                util.inspect(Ship.pfDocs['3mfHGL1r9gzyQP'], {depth: null})
            );
            done();
        });

        it('does not append subsequent queue events', function (done) {
            Ship.addDocEvent({
                qid: '3mfHGL1r9gzyQP',
                action: 'queued',
                date: 'Does not matter',
            });
            assert.equal(Ship.pfDocs['3mfHGL1r9gzyQP'].events.length, 2,
                util.inspect(Ship.pfDocs['3mfHGL1r9gzyQP'], {depth: null})
            );
            done();
        });
    });

    describe('updatePfDocs', function () {

        it('applies log lines to pfDocs', function (done) {
            var Ship = shipper.createShipper('./test');
            Ship.readLogLine('Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: from=<system>, size=813, nrcpt=1 (queue active)');
            Ship.readLogLine('Jul 26 04:18:34 mx12 postfix/smtp[20662]: 3mfHGL1r9gzyQP: to=<system>, relay=127.0.0.2[127.0.0.2]:25, delay=0.53, delays=0.13/0/0.23/0.16, dsn=2.0.0, status=sent (250 Queued! (#2.0.0))');
            Ship.readLogLine('Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: removed');
            Ship.updatePfDocs(function () {
                assert.deepEqual(Ship.pfDocs['3mfHGL1r9gzyQP'],
                    { qid: '3mfHGL1r9gzyQP',
                      host: 'mx12',
                      events:
                       [ { date: '2015-07-26T04:18:34-07:00', action: 'queued' },
                         { to: 'system',
                           relay: '127.0.0.2[127.0.0.2]:25',
                           dsn: '2.0.0',
                           status: 'sent (250 Queued! (#2.0.0))',
                           date: '2015-07-26T04:18:34-07:00' },
                         { date: '2015-07-26T04:18:34-07:00', action: 'removed' } ],
                      date: '2015-07-26T04:18:34-07:00',
                      isFinal: true,
                      from: 'system',
                      size: '813',
                      nrcpt: '1',
                      delay: '0.53',
                      delays: '0.13/0/0.23/0.16'
                    },
                    util.inspect(Ship.pfDocs['3mfHGL1r9gzyQP'], {depth: null})
                );
                done();
            });
        });
    });
});
