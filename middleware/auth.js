'use strict';
/**
 * [UC01] Xác thực và phân quyền.
 *  - attachUser   : đọc userId từ phiên rồi nạp tài khoản từ CSDL ở MỖI request vào req.user và res.locals.user.
 *                   Vai trò luôn lấy từ CSDL, không tin dữ liệu trong phiên, nên khóa tài khoản hay đổi vai trò có hiệu lực ngay.
 *  - requireAuth  : bắt buộc đăng nhập.
 *  - requireAdmin : GUARD của khu vực /admin. Tài khoản khách hàng (CUSTOMER) bị chặn tuyệt đối với mọi phương thức HTTP.
 *  - requireGuest : chỉ cho khách chưa đăng nhập (trang đăng nhập và đăng ký).
 */
const db = require('../config/db');
const logger = require('../utils/logger');
const { AppError, ForbiddenError } = require('../utils/errors');

async function attachUser(req, res, next) {
  req.user = null;
  res.locals.user = null;
  try {
    const userId = req.session && req.session.userId;
    if (userId) {
      const u = await db.one(
        `SELECT UserId AS userId, Email AS email, FullName AS fullName, Role AS role, IsActive AS isActive
           FROM Users WHERE UserId = :userId`, { userId });
      if (u && u.isActive) {
        req.user = { id: u.userId, email: u.email, fullName: u.fullName, role: u.role };
        res.locals.user = req.user;
      } else {
        delete req.session.userId; // tài khoản bị khóa hoặc đã xóa giữa phiên
      }
    }
  } catch (err) {
    logger.warn('Không đọc được tài khoản từ CSDL:', err.message);
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl || '/'));
  }
  return next(new AppError('Bạn cần đăng nhập để thực hiện thao tác này.', 401, { expose: true }));
}

/** Chưa đăng nhập thì chuyển tới trang đăng nhập; đã đăng nhập nhưng không phải ADMIN thì trả 403. */
function requireAdmin(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);
  if (req.user.role !== 'ADMIN') {
    logger.warn(`Từ chối truy cập quản trị: userId=${req.user.id} ${req.method} ${req.originalUrl}`);
    return next(new ForbiddenError());
  }
  return next();
}

function requireGuest(req, res, next) {
  if (!req.user) return next();
  return res.redirect(req.user.role === 'ADMIN' ? '/admin' : '/account');
}

module.exports = { attachUser, requireAuth, requireAdmin, requireGuest };
