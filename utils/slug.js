'use strict';

// Dải dấu kết hợp U+0300 đến U+036F, tạo bằng mã số để không nhúng ký tự thật vào mã nguồn.
const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/** "Áo sơ mi lụa cổ nơ" -> "ao-so-mi-lua-co-no" */
function slugify(input, max = 200) {
  return String(input || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, max)
    .replace(/-+$/g, '');
}

module.exports = { slugify };
