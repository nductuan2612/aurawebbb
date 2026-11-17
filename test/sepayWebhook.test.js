'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../services/sepayWebhookService');

test('SePay webhook: chuẩn hóa IP IPv4-mapped', () => {
  assert.equal(svc.normalizeIp('::ffff:203.0.113.5'), '203.0.113.5');
  assert.equal(svc.normalizeIp('203.0.113.5'), '203.0.113.5');
});

test('SePay webhook: validate và chuẩn hóa payload', () => {
  const r = svc.payloadValues({
    id: 123456,
    gateway: 'MBBank',
    transactionDate: '2024-07-02 11:08:33',
    accountNumber: '001',
    code: 'AM123',
    content: 'AM123 chuyen tien',
    transferType: 'in',
    transferAmount: 500000,
    accumulated: 105000000,
    referenceCode: 'FT123',
  }, JSON.stringify({ id: 123456 }));
  assert.equal(r.error, undefined);
  assert.equal(r.id, '123456');
  assert.equal(r.transferAmount, 500000);
  assert.equal(r.paymentCode, 'AM123');
});

test('SePay webhook: từ chối payload giao dịch tiền ra hoặc id sai', () => {
  assert.equal(svc.payloadValues({ id: 1, accountNumber: '001', transferType: 'out', transferAmount: 1 }, '{}').transferType, 'out');
  assert.match(svc.payloadValues({ id: 'abc', accountNumber: '001', transferType: 'in', transferAmount: 1 }, '{}').error, /id/i);
});
