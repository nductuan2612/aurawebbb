'use strict';
/**
 * [UC01] Xác định giỏ hàng của người đang truy cập.
 *  - Khách đã đăng nhập: giỏ gắn với UserId.
 *  - Khách vãng lai: giỏ gắn với băm SHA-256 của token trong cookie đã ký "ivy_guest" (CSDL không lưu token gốc).
 *    Khi khách đăng nhập, giỏ vãng lai được gộp vào giỏ tài khoản (userModel.mergeGuestCart).
 * Giỏ hàng chỉ được TẠO khi khách thêm sản phẩm đầu tiên, không tạo cho mỗi lượt xem trang (tránh rác từ bot).
 */
const crypto = require('crypto');
const db = require('../config/db');
const env = require('../config/env');
const { sha256Hex } = require('../utils/security');

const GUEST_COOKIE = 'ivy_guest';
const GUEST_MAX_AGE = 1000 * 60 * 60 * 24 * 90;

function readGuest(req, res, next) {
  const token = req.signedCookies && req.signedCookies[GUEST_COOKIE];
  req.guestTokenHash = typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) ? sha256Hex(token) : null;
  next();
}

function ensureGuestToken(req, res) {
  if (req.guestTokenHash) return req.guestTokenHash;
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(GUEST_COOKIE, token, {
    httpOnly: true, signed: true, sameSite: 'lax', secure: env.cookieSecure, maxAge: GUEST_MAX_AGE,
  });
  req.guestTokenHash = sha256Hex(token);
  return req.guestTokenHash;
}

/** Chỉ đọc, không tạo giỏ. Trả về null nếu chưa có. */
async function findCartId(req) {
  if (req.user) {
    const c = await db.one('SELECT CartId AS cartId FROM Carts WHERE UserId = :uid', { uid: req.user.id });
    return c ? c.cartId : null;
  }
  if (!req.guestTokenHash) return null;
  const c = await db.one('SELECT CartId AS cartId FROM Carts WHERE GuestTokenHash = :h', { h: req.guestTokenHash });
  return c ? c.cartId : null;
}

/** Dùng khi thêm sản phẩm: có giỏ rồi thì lấy, chưa có thì tạo. */
async function getOrCreateCartId(req, res) {
  const existing = await findCartId(req);
  if (existing) return existing;
  if (!req.user) ensureGuestToken(req, res);
  try {
    if (req.user) await db.query('INSERT INTO Carts (UserId) VALUES (:uid)', { uid: req.user.id });
    else await db.query('INSERT INTO Carts (GuestTokenHash) VALUES (:h)', { h: req.guestTokenHash });
  } catch (err) {
    if (!db.isUniqueViolation(err)) throw err; // hai request cùng lúc, request kia đã tạo xong
  }
  return findCartId(req);
}

/** Số lượng hiển thị trên biểu tượng giỏ hàng ở đầu trang. */
async function attachCartCount(req, res, next) {
  res.locals.cartCount = 0;
  try {
    let row = null;
    if (req.user) {
      row = await db.one(
        `SELECT COALESCE(SUM(ci.Quantity), 0) AS cnt FROM Carts c
           JOIN CartItems ci ON ci.CartId = c.CartId WHERE c.UserId = :uid`, { uid: req.user.id });
    } else if (req.guestTokenHash) {
      row = await db.one(
        `SELECT COALESCE(SUM(ci.Quantity), 0) AS cnt FROM Carts c
           JOIN CartItems ci ON ci.CartId = c.CartId WHERE c.GuestTokenHash = :h`, { h: req.guestTokenHash });
    }
    res.locals.cartCount = row ? Number(row.cnt) || 0 : 0;
  } catch (_) {
    /* CSDL chưa sẵn sàng: không chặn trang, chỉ hiển thị 0 */
  }
  next();
}

module.exports = { GUEST_COOKIE, readGuest, ensureGuestToken, findCartId, getOrCreateCartId, attachCartCount };
