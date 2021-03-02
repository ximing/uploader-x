'use strict';

let createLog = function(logFunc: any) {
  let LOG: any = {};
  LOG.ALL = (...args: any[]) => {
    // logFunc('FILE_ALL', ...args);
    logFunc({
      logLevel: 'FILE_ALL',
      logInfo: args[0],
    });
  };
  LOG.DEBUG = (...args: any[]) => {
    // logFunc('FILE_DEBUG', ...args);
    logFunc({
      logLevel: 'FILE_DEBUG',
      logInfo: args[0],
    });
  };
  LOG.INFO = (...args: any[]) => {
    // logFunc('FILE_INFO', ...args);
    logFunc({
      logLevel: 'FILE_INFO',
      logInfo: args[0],
    });
  };
  LOG.WARN = (...args: any[]) => {
    // logFunc('FILE_WARN', ...args);
    logFunc({
      logLevel: 'FILE_WARN',
      logInfo: args[0],
    });
  };
  LOG.ERROR = (...args: any[]) => {
    // logFunc('FILE_ERROR', ...args);
    logFunc({
      logLevel: 'FILE_ERROR',
      logInfo: args[0],
    });
  };
  LOG.FATAL = (...args: any[]) => {
    // logFunc('FILE_FATAL', ...args);
    logFunc({
      logLevel: 'FILE_FATAL',
      logInfo: args[0],
    });
  };
  LOG.OFF = (...args: any[]) => {
    // logFunc('FILE_OFF', ...args);
    logFunc({
      logLevel: 'FILE_OFF',
      logInfo: args[0],
    });
  };

  return LOG;
};

export default createLog;
