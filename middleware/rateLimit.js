'use strict';
/**
 * Giới hạn tần suất request để chống dò mật khẩu, đăng ký hàng loạt và spam.
 * Vượt giới hạn thì trả trang lỗi 429 tiếng Việt (qua trình xử lý lỗi chung).
 */
const rateLimit = require('express-rate-limit');
const { AppError } = require('../utils/errors');

const tooMany = (message) => (req, res, next) => next(new AppError(message, 429, { expose: true }));

/** Khóa theo IP + email để một kẻ tấn công không khóa nhầm người dùng khác dùng chung IP. */
function keyByIpAndEmail(req) {
  const email = String((req.body && req.body.email) || '').toLowerCase().slice(0, 200);
  return `${req.ip || '0'}:${email}`;
}

// Chỉ đếm các lần đăng nhập THẤT BẠI (route trả 401/400 khi sai, nên lần thành công không bị tính).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: keyByIpAndEmail,
  handler: tooMany('Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.'),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany('Bạn đã đăng ký quá nhiều lần trong một giờ. Vui lòng thử lại sau.'),
});

/** Giới hạn chung cho toàn website, đủ rộng để không ảnh hưởng người dùng thật. */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany('Bạn thao tác quá nhanh. Vui lòng chờ một chút rồi thử lại.'),
});

/** Đánh giá sản phẩm và thêm vào giỏ: chống spam. */
const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany('Bạn thao tác quá nhanh. Vui lòng chờ một chút rồi thử lại.'),
});

module.exports = { loginLimiter, registerLimiter, globalLimiter, actionLimiter };
