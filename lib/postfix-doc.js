'use strict';

// npm modules
var moment    = require('moment-timezone');

// local modules
var logger    = require('./logger');

function PostfixDoc (cfg) {
  this.cfg = cfg;

  // moment-timezone converts syslog timestamps to Date objects
  moment.tz.setDefault(cfg.parser.timezone || 'America/Phoenix');

  this.parser = require(cfg.parser.module);
}

PostfixDoc.prototype.parseLine = function (line, lineCount) {

  var sys = this.parser.asObjectType('syslog', line);
  if (!sys || !sys.prog) {
    emitParseError('syslog', line);
    return;
  }

  if (!/^postfix/.test(sys.prog)) return; // not postfix, ignore

  logger.debug(lineCount + ': ' + line);
  var parsed = this.parser.asObjectType(sys.prog, sys.msg);
  if (!parsed) {
    emitParseError(sys.prog, sys.msg);
    return;
  }

  ['host','prog'].forEach(function (f) {
    if (!sys[f]) return;
    parsed[f] = sys[f];
  });

  parsed.date = moment(sys.date, 'MMM DD HH:mm:ss').format();
  logger.debug(parsed);
  return parsed;
};

PostfixDoc.prototype.update = function(doc, lo) {
  switch (lo.prog) {
    case 'postfix/qmgr':    // a queue event (1+ per msg)
      return this.addToPostfixDocQmgr(doc, lo);
    case 'postfix/smtp':    // a delivery attempt
      return this.addToPostfixDocSmtp(doc, lo);
    case 'postfix/cleanup':
      ['message-id','resent-message-id'].forEach(function (h) {
        if (lo[h] === undefined) return;
        doc[h] = lo[h];
      });
      return;
    case 'postfix/scache':
      if (lo.statistics) return;
      emitParseError('scache', JSON.stringify(lo));
      return;
    case 'postfix/pickup':   // tells us the uid
      doc.uid = lo.uid;
      return;
    case 'postfix/error':
      lo.action = 'error';
      break;
    case 'postfix/bounce':
      lo.action = 'bounced';
      break;
    case 'postfix/local':    // a local process injected a message
      break;
    case 'postfix/postsuper':
      return this.addToPostfixDocSuper(doc, lo);
  }
  this.addEvent(doc, lo);
};

PostfixDoc.prototype.addToPostfixDocSmtp = function (doc, lo) {

  // update the 'main' level of the doc with these
  ['delay','delays'].forEach(function (field) {
    if (lo[field] === undefined) return;
    doc[field] = lo[field];
    delete lo[field];
  });

  // doc.date = lo.date;
  this.addEvent(doc, lo);
};

PostfixDoc.prototype.addToPostfixDocQmgr = function(doc, lo) {

  if (lo.msg === 'removed') {
    doc.isFinal = true;
    this.addEvent(doc, { qid: lo.qid, date: lo.date, action: 'removed' });
    return;
  }

  if (lo.status) {
    if (/expired, returned/.test(lo.status)) {
      lo.action = 'expired';
      delete lo.status;
      this.addEvent(doc, lo);
      return;
    }
    emitParseError('qmgr', JSON.stringify(lo));
    return;
  }

  // qmgr did something with the queued message
  lo.action = 'queued';

  if (lo.from === undefined) lo.from = ''; // null sender
  ['from','size','nrcpt'].forEach(function (field) {
    doc[field] = lo[field];
    delete lo[field];
  });

  this.addEvent(doc, lo);
};

PostfixDoc.prototype.addToPostfixDocSuper = function (doc, lo) {
  if (lo.msg === 'removed') {
    doc.isFinal = true;
  }

  this.addEvent(doc, { qid: lo.qid, date: lo.date, action: lo.msg });
};

PostfixDoc.prototype.addEvent = function(doc, e) {

  if (e.action && e.action === 'queued') {
    // when postfix touches a message, it emits a qmgr. The first
    // informs us when a message enters the queue, subsequent are useless.
    for (var i=0; i<doc.events.length; i++) {
      if (doc.events[i].action === 'queued') return;
    }
  }

  ['qid','host','prog'].forEach(function (field) {
    delete e[field];
  });

  // duplicate detection
  for (var j=0; j<doc.events.length; j++) {
    if (JSON.stringify(e) === JSON.stringify(doc.events[j])) {
      return;  // don't save duplicate event
    }
  }

  doc.events.push(e);
};

function emitParseError(prog, msg) {
  logger.error('PARSE ERROR for ' + prog + ':' + msg);
}

module.exports = function (cfg) {
  return new PostfixDoc(cfg);
};
