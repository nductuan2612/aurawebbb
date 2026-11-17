'use strict';
// [UC05] Kiểm thử điều kiện mã giảm giá và cách tính tiền.
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCode, computeDiscountAmount, evaluateDiscount, shippingFeeFor, computeTotals } = require('../utils/pricing');

const NOW = new Date('2026-11-04T05:00:00Z');
const base = {
  Code: 'WELCOME10', DiscountType: 'PERCENT', DiscountValue: 10, MaxDiscountAmount: 100000, MinOrderValue: 300000,
  StartsAt: new Date('2026-10-01T00:00:00Z'), EndsAt: new Date('2026-12-31T00:00:00Z'), UsageLimit: 500, UsedCount: 3, IsActive: true,
};

test('normalizeCode: chuẩn hóa chữ hoa và từ chối ký tự lạ', () => {
  assert.equal(normalizeCode('  welcome10 '), 'WELCOME10');
  assert.equal(normalizeCode('a b'), null);
  assert.equal(normalizeCode("x'; DROP TABLE Users;--"), null);
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode(null), null);
});

test('computeDiscountAmount: phần trăm làm tròn xuống và bị chặn bởi mức tối đa', () => {
  assert.equal(computeDiscountAmount(base, 480000), 48000);
  assert.equal(computeDiscountAmount(base, 2000000), 100000);
  assert.equal(computeDiscountAmount({ ...base, DiscountValue: 15 }, 333333), 49999);
  assert.equal(computeDiscountAmount({ ...base, MaxDiscountAmount: null }, 2000000), 200000);
});

test('computeDiscountAmount: giảm cố định không vượt giá trị đơn', () => {
  const fixed = { DiscountType: 'FIXED', DiscountValue: 50000, MaxDiscountAmount: null };
  assert.equal(computeDiscountAmount(fixed, 500000), 50000);
  assert.equal(computeDiscountAmount(fixed, 30000), 30000);
  assert.equal(computeDiscountAmount(fixed, 0), 0);
});

test('evaluateDiscount: mã hợp lệ', () => {
  const r = evaluateDiscount(base, 480000, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.amount, 48000);
});

test('evaluateDiscount: từng điều kiện từ chối đều có thông báo riêng', () => {
  assert.match(evaluateDiscount(null, 500000, NOW).message, /không tồn tại/);
  assert.match(evaluateDiscount({ ...base, IsActive: false }, 500000, NOW).message, /ngừng áp dụng/);
  assert.match(evaluateDiscount({ ...base, StartsAt: new Date('2026-12-01T00:00:00Z') }, 500000, NOW).message, /chưa đến/);
  assert.match(evaluateDiscount({ ...base, EndsAt: new Date('2026-10-30T00:00:00Z') }, 500000, NOW).message, /hết hạn/);
  assert.match(evaluateDiscount({ ...base, UsageLimit: 5, UsedCount: 5 }, 500000, NOW).message, /hết lượt/);
  const low = evaluateDiscount(base, 299999, NOW);
  assert.equal(low.ok, false);
  assert.match(low.message, /300\.000₫/);
});

test('evaluateDiscount: UsageLimit rỗng nghĩa là không giới hạn lượt', () => {
  assert.equal(evaluateDiscount({ ...base, UsageLimit: null, UsedCount: 99999 }, 500000, NOW).ok, true);
});

test('evaluateDiscount: đúng ngưỡng tối thiểu và đúng mốc thời gian vẫn được áp dụng', () => {
  assert.equal(evaluateDiscount(base, 300000, NOW).ok, true);
  assert.equal(evaluateDiscount(base, 500000, base.StartsAt).ok, true);
  assert.equal(evaluateDiscount(base, 500000, base.EndsAt).ok, true);
});

test('shippingFeeFor: miễn phí từ 500.000₫ sau giảm giá', () => {
  assert.equal(shippingFeeFor(499999), 30000);
  assert.equal(shippingFeeFor(500000), 0);
});

test('computeTotals khớp đơn mẫu AMDEMO0009 và AMDEMO0007 trong seed', () => {
  // 480.000 - 10% = 432.000 (< 500.000) nên còn phí giao 30.000
  assert.deepEqual(computeTotals(480000, 48000), { subtotal: 480000, discountAmount: 48000, shippingFee: 30000, total: 462000 });
  // 1.290.000 giảm 20% bị chặn ở 200.000, còn 1.090.000 nên miễn phí giao
  const d = computeDiscountAmount({ DiscountType: 'PERCENT', DiscountValue: 20, MaxDiscountAmount: 200000 }, 1290000);
  assert.deepEqual(computeTotals(1290000, d), { subtotal: 1290000, discountAmount: 200000, shippingFee: 0, total: 1090000 });
});

test('computeTotals: giảm giá không bao giờ làm tổng âm', () => {
  const t = computeTotals(100000, 999999);
  assert.equal(t.discountAmount, 100000);
  assert.ok(t.total >= 0);
});
