'use strict';
/**
 * Kiểm tra và làm sạch dữ liệu đầu vào từ form.
 * Mỗi hàm trả về { value } khi hợp lệ hoặc { error } kèm thông báo tiếng Việt.
 * Lưu ý: chống XSS nằm ở khâu hiển thị (EJS tự thoát ký tự bằng <%= %>) cộng với CSP.
 * Làm sạch đầu vào ở đây là lớp bảo vệ bổ sung, không thay thế việc thoát khi hiển thị.
 */
const { parseYmd, toDateInput } = require('./time');

// eslint-disable-next-line no-control-regex
const CONTROL_ALL = new RegExp('[\\u0000-\\u001F\\u007F' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
// eslint-disable-next-line no-control-regex
const CONTROL_KEEP_NEWLINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const PHONE_RE = /^(?:0|\+84)[35789]\d{8}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const IMG_LOCAL_RE = /^\/images\/[A-Za-z0-9_\-/.]{1,200}\.(?:jpe?g|png|webp|gif|svg|avif)$/i;
const SIZES = ['S', 'M', 'L', 'XL'];

/** Một dòng: bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài. */
function line(v, max = 255) {
  return String(v ?? '').replace(CONTROL_ALL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Nhiều dòng: giữ xuống dòng, bỏ ký tự điều khiển khác. */
function text(v, max = 1000) {
  return String(v ?? '').replace(/\r\n?/g, '\n').replace(CONTROL_KEEP_NEWLINE, '').trim().slice(0, max);
}

function email(raw) {
  const v = line(raw, 300).toLowerCase();
  if (!v) return { error: 'Vui lòng nhập email.' };
  const local = v.split('@')[0];
  if (v.length > 254 || !EMAIL_RE.test(v) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { error: 'Email chưa đúng định dạng, ví dụ ten@example.com.' };
  }
  return { value: v };
}

function fullName(raw) {
  const v = line(raw, 300);
  if (v.length < 2) return { error: 'Họ tên cần có ít nhất 2 ký tự.' };
  if (v.length > 100) return { error: 'Họ tên tối đa 100 ký tự.' };
  return { value: v };
}

function phone(raw, { required = true } = {}) {
  const v = line(raw, 40).replace(/[ .-]/g, '');
  if (!v) return required ? { error: 'Vui lòng nhập số điện thoại.' } : { value: null };
  if (!PHONE_RE.test(v)) return { error: 'Số điện thoại chưa đúng, ví dụ 0912345678.' };
  return { value: v.startsWith('+84') ? `0${v.slice(3)}` : v };
}

/** Mật khẩu: không cắt khoảng trắng. Tối đa 72 byte vì bcrypt chỉ dùng 72 byte đầu. */
function password(raw) {
  const v = String(raw ?? '');
  if (v.length < 8) return { error: 'Mật khẩu cần có ít nhất 8 ký tự.' };
  if (Buffer.byteLength(v, 'utf8') > 72) return { error: 'Mật khẩu quá dài (tối đa 72 byte).' };
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return { error: 'Mật khẩu cần có cả chữ cái và chữ số.' };
  return { value: v };
}

function requiredLine(raw, label, max) {
  const v = line(raw, max + 1);
  if (!v) return { error: `Vui lòng nhập ${label}.` };
  if (v.length > max) return { error: `${label[0].toUpperCase()}${label.slice(1)} tối đa ${max} ký tự.` };
  return { value: v };
}

function optionalLine(raw, label, max) {
  const v = line(raw, max + 1);
  if (!v) return { value: null };
  if (v.length > max) return { error: `${label[0].toUpperCase()}${label.slice(1)} tối đa ${max} ký tự.` };
  return { value: v };
}

function optionalText(raw, label, max) {
  const v = text(raw, max + 1);
  if (!v) return { value: null };
  if (v.length > max) return { error: `${label[0].toUpperCase()}${label.slice(1)} tối đa ${max} ký tự.` };
  return { value: v };
}

/** Số nguyên trong khoảng. Chấp nhận kiểu gõ có dấu chấm ngăn cách hàng nghìn, ví dụ 1.290.000. */
function intInRange(raw, label, min, max) {
  let s = String(raw ?? '').trim();
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+$/.test(s)) return { error: `${label[0].toUpperCase()}${label.slice(1)} phải là số nguyên.` };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    return { error: `${label[0].toUpperCase()}${label.slice(1)} phải nằm trong khoảng ${min} đến ${max}.` };
  }
  return { value: n };
}

/** Số nguyên dương dùng cho id. Trả về null nếu không hợp lệ. */
function id(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 2147483647 ? n : null;
}

function dateOfBirth(raw) {
  const s = line(raw, 20);
  if (!s) return { value: null };
  const p = parseYmd(s);
  if (!p) return { error: 'Ngày sinh chưa đúng định dạng.' };
  if (s < '1900-01-01' || s > toDateInput(new Date())) return { error: 'Ngày sinh không hợp lệ.' };
  return { value: s };
}

function slug(raw) {
  const v = line(raw, 220).toLowerCase();
  if (!SLUG_RE.test(v)) return { error: 'Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang.' };
  return { value: v };
}

function hexColor(raw) {
  const v = line(raw, 10);
  if (!HEX_RE.test(v)) return { error: 'Mã màu cần dạng #RRGGBB, ví dụ #1C1C1C.' };
  return { value: v.toUpperCase() };
}

function size(raw) {
  const v = line(raw, 5).toUpperCase();
  if (!SIZES.includes(v)) return { error: 'Kích cỡ chỉ nhận S, M, L hoặc XL.' };
  return { value: v };
}

/** Đường dẫn ảnh: chỉ nhận /images/... trong website hoặc địa chỉ https. */
function isImagePath(s) {
  if (IMG_LOCAL_RE.test(s) && !s.includes('..') && !s.includes('//')) return true;
  if (/^https:\/\/[^\s"'<>\\]{1,250}$/i.test(s)) {
    try {
      return new URL(s).protocol === 'https:';
    } catch (_) {
      return false;
    }
  }
  return false;
}

/** Mỗi dòng một đường dẫn ảnh. */
function imageLines(raw, max) {
  const lines = String(raw ?? '').split(/\r?\n/).map((l) => line(l, 300)).filter(Boolean);
  if (lines.length > max) return { error: `Tối đa ${max} ảnh cho mỗi sản phẩm.` };
  for (const l of lines) {
    if (!isImagePath(l)) {
      return { error: `Đường dẫn ảnh không hợp lệ: "${l.slice(0, 60)}". Dùng dạng /images/products/P001.jpg hoặc địa chỉ https.` };
    }
  }
  return { value: lines };
}

/** Ô tích (checkbox) gửi "on" khi được tích và không gửi gì khi bỏ trống. */
function checked(raw) {
  return raw === 'on' || raw === '1' || raw === 'true';
}

module.exports = {
  SIZES, line, text, email, fullName, phone, password, requiredLine, optionalLine, optionalText,
  intInRange, id, dateOfBirth, slug, hexColor, size, isImagePath, imageLines, checked,
};
