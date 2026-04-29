'use strict';

// this is a stub library. Overload/extend these functions with a more
// feature-filled or robust library such as winston, log4js, or npmlog.

exports.debug = (msg) => {
  if (!process.env.DEBUG) return;
  console.log(msg);
};

exports.info = (msg) => {
  if (process.env.NODE_ENV === 'test') return;
  console.log(msg);
};

exports.error = (msg) => {
  if (process.env.NODE_ENV === 'test') return;
  console.error(msg);
};

