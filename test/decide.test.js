'use strict';
// [UC06] Kiểm thử quyết định xử lý IPN/webhook: gửi lặp (idempotency), sai số tiền, thanh toán muộn, trả tiền hai lần.
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide } = require('../utils/payment/decide');

const pay = (over = {}) => ({ status: 'PENDING', amount: 801000, gatewayTxnNo: null, ...over });
const ok = (over = {}) => ({ success: true, amount: 801000, txnNo: 'T1', ...over });
const bad = (over = {}) => ({ success: false, amount: 801000, txnNo: null, ...over });
const none = (outcome) => ({ action: 'NONE', outcome, needsRefund: false });

test('không có khoản thanh toán tương ứng', () => {
  assert.deepEqual(decide(null, ok()), none('PAYMENT_NOT_FOUND'));
});

test('thanh toán thành công lần đầu', () => {
  assert.deepEqual(decide(pay(), ok()), { action: 'MARK_PAID', outcome: 'PAID', needsRefund: false });
});

test('IDEMPOTENCY: thông báo thành công gửi lặp không xử lý lại', () => {
  assert.deepEqual(decide(pay({ status: 'PAID', gatewayTxnNo: 'T1' }), ok()), none('DUPLICATE'));
  // cả hai bên đều không có mã giao dịch vẫn là gửi lặp
  assert.deepEqual(decide(pay({ status: 'PAID', gatewayTxnNo: null }), ok({ txnNo: null })), none('DUPLICATE'));
});

test('khoản đã PAID nhận thông báo với mã giao dịch khác: không ghi đè, báo riêng để admin kiểm tra', () => {
  assert.deepEqual(decide(pay({ status: 'PAID', gatewayTxnNo: 'T1' }), ok({ txnNo: 'T2' })), none('DUPLICATE_OTHER_TXN'));
});

test('khoản đã hoàn tiền nhận thông báo thành công: coi là gửi lặp, không chuyển lại thành PAID', () => {
  assert.deepEqual(decide(pay({ status: 'REFUNDED', gatewayTxnNo: 'T1' }), ok()), none('DUPLICATE'));
});

test('sai số tiền thì không ghi nhận, kể cả khi cổng báo thành công', () => {
  assert.deepEqual(decide(pay(), ok({ amount: 1000 })), none('AMOUNT_MISMATCH'));
  assert.deepEqual(decide(pay(), ok({ amount: Number.NaN })), none('AMOUNT_MISMATCH'));
  assert.deepEqual(decide(pay(), bad({ amount: 5 })), none('AMOUNT_MISMATCH'));
});

test('số tiền trong CSDL dạng chuỗi vẫn so khớp đúng', () => {
  assert.equal(decide(pay({ amount: '801000' }), ok()).action, 'MARK_PAID');
});

test('đơn đã có một lần thanh toán khác ở trạng thái PAID thì chặn lần này (trả tiền hai lần)', () => {
  assert.deepEqual(decide(pay(), ok(), { otherPaid: true }), none('DOUBLE_PAYMENT'));
});

test('thứ tự ưu tiên: chính khoản này đã PAID thì là DUPLICATE, không phải DOUBLE_PAYMENT', () => {
  assert.equal(decide(pay({ status: 'PAID', gatewayTxnNo: 'T1' }), ok(), { otherPaid: true }).outcome, 'DUPLICATE');
});

test('khách trả muộn sau khi lần thử bị hủy hoặc thất bại vẫn được ghi nhận', () => {
  assert.equal(decide(pay({ status: 'CANCELLED' }), ok()).action, 'MARK_PAID');
  assert.equal(decide(pay({ status: 'FAILED' }), ok()).action, 'MARK_PAID');
});

test('đơn đã hủy hoặc trả hàng mà vẫn nhận được tiền: ghi nhận và đánh dấu cần hoàn tiền', () => {
  assert.deepEqual(decide(pay(), ok(), { orderClosed: true }), { action: 'MARK_PAID', outcome: 'PAID_ORDER_CLOSED', needsRefund: true });
});

test('thông báo thất bại: chỉ chuyển PENDING sang FAILED', () => {
  assert.deepEqual(decide(pay(), bad()), { action: 'MARK_FAILED', outcome: 'FAILED', needsRefund: false });
});

test('thông báo thất bại không bao giờ hạ cấp khoản đã trả hoặc đã đóng', () => {
  for (const status of ['PAID', 'REFUNDED', 'CANCELLED', 'FAILED']) {
    assert.deepEqual(decide(pay({ status }), bad()), none('IGNORED'), status);
  }
});
