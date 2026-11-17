'use strict';
/** Các hàm hỗ trợ bảo mật dùng chung: so sánh an toàn, chặn open redirect, thoát ký tự đặc biệt. */
const crypto = require('crypto');

// Hai ký tự ngắt dòng U+2028/U+2029 được tạo bằng mã số để không nhúng ký tự thật vào mã nguồn.
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), 'g');
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), 'g');

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** So sánh chuỗi trong thời gian không phụ thuộc vị trí khác biệt (chống tấn công đo thời gian). */
function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) {
    crypto.timingSafeEqual(x, x);
    return false;
  }
  return crypto.timingSafeEqual(x, y);
}

/**
 * Thoát ký tự đặc biệt của LIKE (SQL Server). Dùng cùng mệnh đề: LIKE @p ESCAPE '\'
 * Nhờ vậy ô tìm kiếm không thể dùng % hoặc _ để quét toàn bộ bảng.
 */
function escapeLike(s) {
  return String(s).replace(/[\\%_[]/g, (ch) => '\\' + ch);
}

/**
 * Chỉ cho phép chuyển hướng tới đường dẫn nội bộ của website (chống open redirect).
 * Từ chối: "//evil.com", "/\evil.com", "https://evil.com" và ký tự điều khiển
 * (trình duyệt bỏ tab/xuống dòng trong URL nên "/\t/evil.com" có thể thành "//evil.com").
 */
function safeNextPath(p, fallback = '/') {
  if (typeof p !== 'string' || p.length === 0 || p.length > 300) return fallback;
  if (p[0] !== '/') return fallback;
  if (p[1] === '/' || p[1] === '\\') return fallback;
  if (/[\u0000-\u001F\u007F\\]/.test(p)) return fallback;
  return p;
}

/**
 * Chuyển dữ liệu thành JSON an toàn để nhúng trong thẻ <script type="application/json">.
 * Thoát < > & và U+2028/U+2029 để không thể "thoát" khỏi thẻ script (XSS).
 */
function safeJson(value) {
  const s = JSON.stringify(value === undefined ? null : value);
  return s
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEP, '\\u2028')
    .replace(PARA_SEP, '\\u2029');
}

module.exports = { sha256Hex, randomToken, safeEqual, escapeLike, safeNextPath, safeJson };
