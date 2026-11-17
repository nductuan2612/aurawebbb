'use strict';
/**
 * Xử lý lỗi tập trung. Lỗi hệ thống (500) không bao giờ lộ chi tiết ra trình duyệt;
 * lỗi nghiệp vụ (4xx, expose = true) hiển thị thông báo tiếng Việt cho người dùng.
 */
const env = require('../config/env');
const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).render('errors/404', { path: req.path });
}

// eslint-disable-next-line no-unused-vars
function handler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err && err.status >= 400 && err.status < 600 ? err.status : 500;
  const expose = Boolean(err && err.expose === true);
  const detail = expose ? err.message : 'Đã xảy ra lỗi. Vui lòng thử lại sau.';

  if (status >= 500) logger.error('Lỗi hệ thống:', err && err.stack ? err.stack : err);

  res.status(status);

  const wantsJson = (req.get('Accept') || '').includes('application/json') || req.xhr
    || req.path.startsWith('/webhook/') || /\/ipn$/.test(req.path)
    || /^Apikey\s+/i.test(req.get('authorization') || '');
  if (wantsJson) return res.json({ ok: false, error: detail, code: err && err.code });

  const message = expose ? detail : undefined; // chỉ hiện thông báo đã được phép công khai
  if (status === 404) return res.render('errors/404', { path: req.path, message });
  if (status === 401) return res.render('errors/401', { message });
  if (status === 403) return res.render('errors/403', { message });
  if (expose) {
    const back = req.get('Referrer');
    return res.render('errors/400', { message: detail, status, back: back && back.startsWith(`${req.protocol}://${req.get('host')}`) ? back : '/' });
  }
  return res.render('errors/500', { detail: env.isProd ? '' : (err && err.message) || '' });
}

module.exports = { notFound, handler };
