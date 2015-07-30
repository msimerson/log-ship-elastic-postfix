'use strict';

var assert   = require('assert');
var util     = require('util');

var shipper  = require('../index');

/* jshint maxlen: 250 */
var testLine = 'Jul 26 04:18:34 mx12 postfix/qmgr[28761]: 3mfHGL1r9gzyQP: from=<system>, size=813, nrcpt=1 (queue active)';

describe('log-ship-elasticsearch-postfix', function () {

    it('configured parser loads', function (done) {
        var Ship = shipper.createShipper('./test');
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
