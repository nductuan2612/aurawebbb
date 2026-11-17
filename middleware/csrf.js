'use strict';
/**
 * Chống CSRF bằng "double submit cookie" có chữ ký.
 *  - Token nằm trong cookie đã ký (cookie-parser) và phải được gửi kèm trong body (csrfToken) hoặc header X-CSRF-Token.
 *  - So sánh bằng safeEqual để không lộ thông tin qua thời gian xử lý.
 *  - GET/HEAD/OPTIONS không đổi dữ liệu nên không cần token.
 *  - Webhook của cổng thanh toán được gắn TRƯỚC middleware này vì xác thực bằng chữ ký riêng.
 */
const crypto = require('crypto');
const env = require('../config/env');
const { safeEqual } = require('../utils/security');
const { BusinessError } = require('../utils/errors');

const COOKIE_NAME = 'ivy_csrf';

function issue(res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, signed: true, sameSite: 'lax', secure: env.cookieSecure, maxAge: 1000 * 60 * 60 * 24,
  });
  return token;
}

function csrf(req, res, next) {
  const current = req.signedCookies && req.signedCookies[COOKIE_NAME];
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.locals.csrfToken = typeof current === 'string' ? current : issue(res);
    return next();
  }
  const sent = (req.body && req.body.csrfToken) || req.get('x-csrf-token');
  if (typeof current !== 'string' || typeof sent !== 'string' || !safeEqual(current, sent)) {
    return next(new BusinessError('Phiên làm việc đã hết hạn hoặc mã bảo mật không hợp lệ. Vui lòng tải lại trang rồi thử lại.', { code: 'CSRF' }));
  }
  res.locals.csrfToken = current;
  return next();
}

module.exports = { csrf, COOKIE_NAME };
