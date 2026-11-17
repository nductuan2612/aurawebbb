'use strict';
// [UC06] Kiểm thử kiểm tra chữ ký (checksum) của thông báo thanh toán IPN/webhook.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sig = require('../utils/payment/signature');

const hmac = (algo, key, data) => crypto.createHmac(algo, key).update(data, 'utf8').digest('hex');

/* ------------------------------------------------------------------ mock */
test('mock: ký rồi kiểm tra thì hợp lệ', () => {
  const body = { paymentRef: '2610000001', amount: 801000, status: 'SUCCESS', transactionNo: 'MOCK1', responseCode: '00' };
  body.signature = sig.mockSign(body, 'secret');
  assert.equal(sig.mockVerify(body, 'secret'), true);
});

test('mock: sửa số tiền, thêm trường, sai khóa hoặc thiếu chữ ký đều bị từ chối', () => {
  const body = { paymentRef: '2610000001', amount: 801000, status: 'SUCCESS', transactionNo: 'MOCK1', responseCode: '00' };
  body.signature = sig.mockSign(body, 'secret');
  assert.equal(sig.mockVerify({ ...body, amount: 1000 }, 'secret'), false);
  assert.equal(sig.mockVerify({ ...body, extra: 'x' }, 'secret'), false);
  assert.equal(sig.mockVerify(body, 'other-secret'), false);
  const { signature, ...noSig } = body;
  assert.equal(sig.mockVerify(noSig, 'secret'), false);
  assert.equal(sig.mockVerify({ ...body, signature: '' }, 'secret'), false);
  assert.equal(sig.mockVerify(null, 'secret'), false);
});

/* ------------------------------------------------------------------ payOS */
test('payOS: chữ ký tạo link ký trên 5 trường theo thứ tự chữ cái', () => {
  const p = { amount: 2000, cancelUrl: 'https://c.example/cancel', description: 'Thanh toan', orderCode: 123, returnUrl: 'https://r.example/return' };
  const expected = hmac('sha256', 'k', 'amount=2000&cancelUrl=https://c.example/cancel&description=Thanh toan&orderCode=123&returnUrl=https://r.example/return');
  assert.equal(sig.payosSignCreate(p, 'k'), expected);
});

test('payOS: webhook hợp lệ qua kiểm tra, sửa dữ liệu hoặc sai khóa thì bị từ chối', () => {
  const data = { orderCode: 123, amount: 801000, description: 'AM123', reference: 'FT26', code: '00', desc: 'Thanh cong', counterAccountName: null };
  const body = { code: '00', desc: 'success', success: true, data, signature: sig.payosSignData(data, 'checksum-key') };
  assert.equal(sig.payosVerifyWebhook(body, 'checksum-key'), true);
  assert.equal(sig.payosVerifyWebhook({ ...body, data: { ...data, amount: 1 } }, 'checksum-key'), false);
  assert.equal(sig.payosVerifyWebhook({ ...body, data: { ...data, orderCode: 124 } }, 'checksum-key'), false);
  assert.equal(sig.payosVerifyWebhook(body, 'wrong-key'), false);
  assert.equal(sig.payosVerifyWebhook({ ...body, signature: 'abc' }, 'checksum-key'), false);
  assert.equal(sig.payosVerifyWebhook({ code: '00', data }, 'checksum-key'), false);
  assert.equal(sig.payosVerifyWebhook({ code: '00', data: null, signature: 'x' }, 'checksum-key'), false);
  assert.equal(sig.payosVerifyWebhook(null, 'checksum-key'), false);
});

test('payOS: chuỗi ký sắp theo tên khóa, null thành rỗng', () => {
  assert.equal(sig.payosQueryString({ b: 2, a: null, c: 'x' }), 'a=&b=2&c=x');
});

/* ------------------------------------------------------------------ VNPay */
const vnp = () => ({ vnp_Amount: '80100000', vnp_TxnRef: '2610000001', vnp_OrderInfo: 'Thanh toan don AM1', vnp_ResponseCode: '00', vnp_TransactionNo: '14123456' });

test('VNPay: chuỗi ký sắp theo tên và mã hóa URL (khoảng trắng thành +)', () => {
  assert.equal(sig.vnpSignData({ vnp_B: 'a b', vnp_A: 'x&y' }), 'vnp_A=x%26y&vnp_B=a+b');
});

test('VNPay: HMAC-SHA512, hợp lệ khi đúng, không phân biệt hoa thường của chuỗi hash', () => {
  const q = vnp();
  q.vnp_SecureHash = sig.vnpSign(q, 'hash-secret');
  assert.equal(q.vnp_SecureHash.length, 128);
  assert.equal(sig.vnpVerify(q, 'hash-secret'), true);
  assert.equal(sig.vnpVerify({ ...q, vnp_SecureHash: q.vnp_SecureHash.toUpperCase() }, 'hash-secret'), true);
});

test('VNPay: sửa số tiền, sai khóa, thêm tham số vnp_ lạ, thiếu hash đều bị từ chối', () => {
  const q = vnp();
  q.vnp_SecureHash = sig.vnpSign(q, 'hash-secret');
  assert.equal(sig.vnpVerify({ ...q, vnp_Amount: '100' }, 'hash-secret'), false);
  assert.equal(sig.vnpVerify(q, 'sai-khoa'), false);
  assert.equal(sig.vnpVerify({ ...q, vnp_Extra: '1' }, 'hash-secret'), false);
  const { vnp_SecureHash, ...noHash } = q;
  assert.equal(sig.vnpVerify(noHash, 'hash-secret'), false);
  assert.equal(sig.vnpVerify({ ...q, vnp_SecureHash: '' }, 'hash-secret'), false);
});

test('VNPay: vnp_SecureHashType và tham số không phải vnp_ không ảnh hưởng chữ ký', () => {
  const q = vnp();
  q.vnp_SecureHash = sig.vnpSign(q, 'hash-secret');
  assert.equal(sig.vnpVerify({ ...q, vnp_SecureHashType: 'HmacSHA512', utm: 'abc' }, 'hash-secret'), true);
});

test('VNPay: tham số lặp (mảng) bị từ chối để không bị lừa bằng HTTP parameter pollution', () => {
  const q = vnp();
  q.vnp_SecureHash = sig.vnpSign(q, 'hash-secret');
  assert.equal(sig.vnpVerify({ ...q, vnp_Amount: ['80100000', '1'] }, 'hash-secret'), false);
});

test('safeEqualHex: độ dài khác nhau hoặc rỗng đều false', () => {
  assert.equal(sig.safeEqualHex('abcd', 'abcd'), true);
  assert.equal(sig.safeEqualHex('abcd', 'abc'), false);
  assert.equal(sig.safeEqualHex('', ''), false);
  assert.equal(sig.safeEqualHex(undefined, 'abcd'), false);
});
