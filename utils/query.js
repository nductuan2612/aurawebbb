'use strict';

/**
 * Ghép chuỗi query từ object, bỏ giá trị rỗng, hỗ trợ giá trị là mảng.
 * Dùng cho liên kết phân trang để giữ nguyên bộ lọc. Ví dụ: toQuery({ q: 'ao', size: ['S', 'M'], page: '' }) -> "q=ao&size=S&size=M"
 */
function toQuery(params) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    const list = value === undefined || value === null ? [] : [].concat(value);
    for (const item of list) {
      const s = String(item);
      if (s !== '') p.append(key, s);
    }
  }
  return p.toString();
}

module.exports = { toQuery };
