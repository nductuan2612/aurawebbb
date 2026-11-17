'use strict';
/** Định dạng tiền, phần trăm và tên hiển thị. Không phụ thuộc dữ liệu ICU của Node. */

/** 1290000 -> "1.290.000₫" */
function formatVnd(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return '';
  const digits = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${v < 0 ? '-' : ''}${digits}₫`;
}

/** Phần trăm giảm từ giá gốc xuống giá bán, làm tròn. Không có giá gốc hợp lệ thì trả về 0. */
function percentOff(price, compareAt) {
  const p = Number(price);
  const c = Number(compareAt);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= 0 || c <= p) return 0;
  return Math.round(((c - p) * 100) / c);
}

/** "Nguyễn Thu Hà" -> "Nguyễn T. H." Dùng khi hiển thị đánh giá công khai để không lộ họ tên đầy đủ. */
function maskName(fullName) {
  const tokens = String(fullName || '').normalize('NFC').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 'Khách hàng';
  if (tokens.length === 1) return tokens[0];
  const [first, ...rest] = tokens;
  return `${first} ${rest.map((t) => `${Array.from(t)[0].toUpperCase()}.`).join(' ')}`;
}

module.exports = { formatVnd, percentOff, maskName };
