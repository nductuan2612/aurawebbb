'use strict';
/**
 * [UC01] Băm và so khớp mật khẩu bằng bcrypt (cost 12). Không bao giờ lưu mật khẩu gốc.
 * Dùng bản bcryptjs (JavaScript thuần) nên không cần biên dịch gì thêm trên Windows.
 */
const bcrypt = require('bcryptjs');

const COST = 12;

function hash(plain) {
  return new Promise((resolve, reject) => {
    bcrypt.hash(String(plain), COST, (err, h) => (err ? reject(err) : resolve(h)));
  });
}

function compare(plain, hashed) {
  return new Promise((resolve, reject) => {
    bcrypt.compare(String(plain), String(hashed), (err, ok) => (err ? reject(err) : resolve(ok)));
  });
}

let dummyHash = null;

/**
 * Khi email không tồn tại, vẫn chạy một lần so khớp bcrypt để thời gian phản hồi
 * không tiết lộ email nào đã đăng ký (chống dò tài khoản).
 */
async function burnTime(plain) {
  if (!dummyHash) dummyHash = await hash('mat-khau-gia-de-do-thoi-gian-1');
  await compare(plain, dummyHash);
  return false;
}

module.exports = { hash, compare, burnTime, COST };
