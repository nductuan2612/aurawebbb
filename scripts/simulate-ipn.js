#!/usr/bin/env node
/**
 * [UC06] Giả lập IPN của cổng thanh toán giả lập (PAYMENT_PROVIDER=mock) để kiểm thử từ dòng lệnh.
 *
 * Cách dùng:
 *   node scripts/simulate-ipn.js <paymentRef> <amount> [action]
 *
 *   paymentRef : mã tham chiếu thanh toán (cột PaymentRef của bảng Payments, hiện cả ở trang cổng demo)
 *   amount     : số tiền của đơn, bằng đồng (ví dụ 801000). Phải khớp với đơn thì mới được ghi nhận.
 *   action     : success | fail | tamper | wrongamount | replay   (mặc định success)
 *
 *   success     thanh toán thành công
 *   fail        thanh toán thất bại
 *   tamper      sửa số tiền sau khi đã ký, nên chữ ký không còn khớp (kỳ vọng INVALID_SIGNATURE)
 *   wrongamount chữ ký đúng nhưng số tiền thấp hơn đơn 1.000đ (kỳ vọng AMOUNT_MISMATCH)
 *   replay      gửi cùng một thông báo thành công hai lần (lần hai kỳ vọng DUPLICATE)
 *
 * Ví dụ:
 *   node scripts/simulate-ipn.js 2610000016 540000 replay
 *
 * Yêu cầu: server đang chạy tại APP_BASE_URL (hoặc http://localhost:PORT), cùng file .env có MOCK_GATEWAY_SECRET
 * giống với server. Khóa này chỉ nằm ở server và file .env, không bao giờ gửi qua trình duyệt.
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const https = require('https');
const { createMockProvider } = require('../services/payment/providers/mock');
const env = require('../config/env');

const [, , paymentRef, amountArg, action = 'success'] = process.argv;
const ACTIONS = ['success', 'fail', 'tamper', 'wrongamount', 'replay'];
const amount = Number(amountArg);

if (!/^\d{6,19}$/.test(paymentRef || '') || !Number.isSafeInteger(amount) || amount <= 0 || !ACTIONS.includes(action)) {
  console.error('Cách dùng: node scripts/simulate-ipn.js <paymentRef> <amount> [success|fail|tamper|wrongamount|replay]');
  console.error('Ví dụ    : node scripts/simulate-ipn.js 2610000016 540000 replay');
  process.exit(1);
}
if (env.payment.provider !== 'mock') {
  console.error(`PAYMENT_PROVIDER đang là "${env.payment.provider}". Script này chỉ dùng với cổng giả lập (mock).`);
  process.exit(1);
}

const provider = createMockProvider({ secret: env.payment.mockSecret });
const sequence = action === 'replay' ? ['success', 'success'] : [action];
const target = `${(process.env.APP_BASE_URL || `http://localhost:${env.port}`).replace(/\/+$/, '')}/payment/mock/ipn`;

function post(url, body) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);
    const lib = new URL(url).protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('hết thời gian chờ')));
    req.write(json);
    req.end();
  });
}

(async () => {
  for (const a of sequence) {
    const body = provider.buildEvent({ paymentRef, amount, action: a });
    console.log(`\nGửi thông báo "${a}" tới ${target}`);
    try {
      const res = await post(target, body);
      let outcome = '';
      try { outcome = JSON.parse(res.body).outcome || ''; } catch (_) { /* phản hồi không phải JSON */ }
      console.log(`  HTTP ${res.status}  kết quả: ${outcome || res.body.slice(0, 120)}`);
    } catch (err) {
      console.error('  Không gửi được:', err.message);
      process.exitCode = 1;
    }
  }
})();
