const env = require('../../config/environment');
const isDev = env.NODE_ENV !== 'production';

const logger = {
  info:  (msg, meta) => isDev ? console.log(`ℹ️  ${msg}`, meta ?? '') : console.log(JSON.stringify({ level: 'info',  msg, ...meta })),
  warn:  (msg, meta) => isDev ? console.warn(`⚠️  ${msg}`, meta ?? '') : console.log(JSON.stringify({ level: 'warn',  msg, ...meta })),
  error: (msg, err)  => isDev ? console.error(`❌ ${msg}`, err ?? '')  : console.log(JSON.stringify({ level: 'error', msg, err: err?.message })),
  debug: (msg, meta) => isDev ? console.log(`🔍 ${msg}`, meta ?? '')  : undefined,
};

module.exports = logger;
