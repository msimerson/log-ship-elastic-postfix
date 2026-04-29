'use strict';

// local modules
const logger = require('./logger');

function PostfixDoc(cfg) {
  this.cfg = cfg;
  this.timezone = cfg.parser.timezone || 'America/Phoenix';
  this.parser = require(cfg.parser.module);
}

PostfixDoc.prototype.parseLine = function (line, lineCount) {
  const sys = this.parser.asObjectType('syslog', line);
  if (!sys || !sys.prog) {
    emitParseError('syslog', line);
    return;
  }

  // Parse postfix, rspamd, and rmilter logs
  if (!/^(postfix|rspamd|rmilter)/.test(sys.prog)) return;

  logger.debug(lineCount + ': ' + line);
  const parsed = this.parser.asObjectType(sys.prog, sys.msg);
  if (!parsed) {
    emitParseError(sys.prog, sys.msg);
    return;
  }

  ['host','prog'].forEach((f) => {
    if (!sys[f]) return;
    parsed[f] = sys[f];
  });

  parsed.date = this.parseSyslogDate(sys.date);
  logger.debug(parsed);
  return parsed;
};

PostfixDoc.prototype.parseSyslogDate = function (syslogDate) {
  // Parse syslog format: "Jul 26 04:18:34" (no year)
  // Use current year, then adjust if needed for dates in the future
  const now = new Date();
  const currentYear = now.getFullYear();

  // Parse the syslog date
  const dateStr = `${currentYear}-${syslogDate}`;
  const date = this.parseDateWithTimezone(dateStr);

  // If the parsed date is more than 6 months in the future, assume it's from last year
  if (date > now && (date - now) > 6 * 30 * 24 * 60 * 60 * 1000) {
    const lastYearStr = `${currentYear - 1}-${syslogDate}`;
    return this.formatDateWithTimezone(this.parseDateWithTimezone(lastYearStr));
  }

  return this.formatDateWithTimezone(date);
};

PostfixDoc.prototype.parseDateWithTimezone = function (dateStr) {
  // Parse date string in format "YYYY-MMM DD HH:mm:ss"
  const regex = /(\d{4})-([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})/;
  const match = dateStr.match(regex);
  if (!match) {
    return new Date(dateStr);
  }

  const [, year, monthStr, day, hour, minute, second] = match;
  const monthMap = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };

  const month = monthMap[monthStr];
  if (month === undefined) {
    return new Date(dateStr);
  }

  // Create a date object representing the local time
  // We'll treat the input as local time and use it as-is
  const localDate = new Date(
    parseInt(year, 10),
    month,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  );

  return localDate;
};

PostfixDoc.prototype.formatDateWithTimezone = function (date) {
  // Format date as ISO string with timezone offset
  // Get the timezone offset for this date in the configured timezone
  const offset = this.getTimezoneOffset(this.timezone, date);
  const offsetHours = Math.floor(Math.abs(offset) / (60 * 60 * 1000));
  const offsetMinutes = Math.floor((Math.abs(offset) % (60 * 60 * 1000)) / (60 * 1000));
  const sign = offset <= 0 ? '+' : '-';
  const offsetStr = sign + String(offsetHours).padStart(2, '0') + ':' + String(offsetMinutes).padStart(2, '0');

  // Format the date as YYYY-MM-DDTHH:mm:ss with offset
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`;
};

PostfixDoc.prototype.getTimezoneOffset = function (tzName, date) {
  // Get the offset in milliseconds for the given timezone
  // Using Intl API to determine offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const partsMap = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      partsMap[part.type] = part.value;
    }
  });

  // Create a UTC date from the formatter's output
  const tzDate = new Date(Date.UTC(
    parseInt(partsMap.year, 10),
    parseInt(partsMap.month, 10) - 1,
    parseInt(partsMap.day, 10),
    parseInt(partsMap.hour, 10),
    parseInt(partsMap.minute, 10),
    parseInt(partsMap.second, 10)
  ));

  // The offset is the difference
  return date.getTime() - tzDate.getTime();
};

PostfixDoc.prototype.update = function(doc, lo) {
  switch (lo.prog) {
    case 'postfix/qmgr':    // a queue event (1+ per msg)
      return this.addToPostfixDocQmgr(doc, lo);
    case 'postfix/smtp':    // a delivery attempt
      return this.addToPostfixDocSmtp(doc, lo);
    case 'postfix/cleanup':
      ['message-id','resent-message-id'].forEach((h) => {
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
    case 'rmilter':
      return this.addToDocRmilter(doc, lo);
    case 'rspamd':
      return this.addToDocRspamd(doc, lo);
  }
  this.addEvent(doc, lo);
};

PostfixDoc.prototype.addToPostfixDocSmtp = function (doc, lo) {
  // update the 'main' level of the doc with these
  ['delay','delays'].forEach((field) => {
    if (lo[field] === undefined) return;
    doc[field] = lo[field];
    delete lo[field];
  });

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
  ['from','size','nrcpt'].forEach((field) => {
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

PostfixDoc.prototype.addToDocRmilter = function (doc, lo) {
  // rmilter logs can contain queue IDs in the "msg_done" action
  // Example: "msg done: queue_id: <795941FED7>; ..."
  if (!lo.queue_id && lo.msg && /queue.?id/.test(lo.msg)) {
    const match = lo.msg.match(/queue.?id:\s*<([^>]+)>/);
    if (match) lo.queue_id = match[1];
  }

  // Store rmilter-specific data if present
  if (lo.spam_scan !== undefined) {
    lo.action = `rmilter_spam_${lo.spam_scan}`;
  }
  if (lo.virus_scan !== undefined) {
    lo.action = `rmilter_virus_${lo.virus_scan}`;
  }
  if (lo.dkim !== undefined) {
    lo.action = `rmilter_dkim_${lo.dkim}`;
  }

  this.addEvent(doc, lo);
};

PostfixDoc.prototype.addToDocRspamd = function (doc, lo) {
  // rspamd logs contain queue IDs in the rspamd_message_parse action
  // Example: "rspamd_message_parse: loaded message; ... queue-id: <795941FED7>; ..."
  if (!lo.queue_id && lo.msg && /queue.?id/.test(lo.msg)) {
    const match = lo.msg.match(/queue.?id:\s*<([^>]+)>/);
    if (match) lo.queue_id = match[1];
  }

  // Store rspamd scan results if present
  if (lo.score !== undefined || lo.action !== undefined) {
    if (!lo.action) lo.action = 'rspamd_scan_result';
  }

  this.addEvent(doc, lo);
};

PostfixDoc.prototype.addEvent = function(doc, e) {
  if (e.action && e.action === 'queued') {
    // when postfix touches a message, it emits a qmgr. The first
    // informs us when a message enters the queue, subsequent are useless.
    for (let i = 0; i < doc.events.length; i++) {
      if (doc.events[i].action === 'queued') return;
    }
  }

  ['qid','host','prog'].forEach((field) => {
    delete e[field];
  });

  // duplicate detection
  for (let j = 0; j < doc.events.length; j++) {
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

