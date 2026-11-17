'use strict';
/** Ghi log đơn giản có mốc thời gian. Không bao giờ truyền mật khẩu hay khóa bí mật vào đây. */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;

function emit(level, args) {
  if (LEVELS[level] < threshold) return;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(`[${new Date().toISOString()}] ${level.toUpperCase()}`, ...args);
}

module.exports = {
  debug: (...a) => emit('debug', a),
  info: (...a) => emit('info', a),
  warn: (...a) => emit('warn', a),
  error: (...a) => emit('error', a),
};
