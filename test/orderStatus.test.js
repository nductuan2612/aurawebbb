'use strict';
// [UC04] Kiểm thử 6 trạng thái đơn hàng, quy tắc chuyển trạng thái và ảnh hưởng tới kho.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../utils/orderStatus');

test('có đủ 6 trạng thái với nhãn tiếng Việt đúng đề bài', () => {
  assert.deepEqual(S.ORDER, ['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED']);
  assert.deepEqual(Object.values(S.LABELS), ['Chờ xác nhận', 'Đã xác nhận', 'Đang giao', 'Đã giao', 'Đã hủy', 'Trả hàng/Hoàn tiền']);
});

test('luồng thuận: chờ xác nhận -> đã xác nhận -> đang giao -> đã giao', () => {
  assert.equal(S.canTransition('PENDING', 'CONFIRMED', 'ADMIN'), true);
  assert.equal(S.canTransition('CONFIRMED', 'SHIPPING', 'ADMIN'), true);
  assert.equal(S.canTransition('SHIPPING', 'DELIVERED', 'ADMIN'), true);
  assert.equal(S.canTransition('DELIVERED', 'RETURNED', 'ADMIN'), true);
});

test('không được nhảy cóc hoặc đi lùi', () => {
  assert.equal(S.canTransition('PENDING', 'SHIPPING', 'ADMIN'), false);
  assert.equal(S.canTransition('PENDING', 'DELIVERED', 'ADMIN'), false);
  assert.equal(S.canTransition('DELIVERED', 'PENDING', 'ADMIN'), false);
  assert.equal(S.canTransition('SHIPPING', 'CONFIRMED', 'ADMIN'), false);
  assert.equal(S.canTransition('DELIVERED', 'CANCELLED', 'ADMIN'), false);
});

test('trạng thái cuối (đã hủy, trả hàng) không chuyển đi đâu nữa', () => {
  for (const to of S.ORDER) {
    assert.equal(S.canTransition('CANCELLED', to, 'ADMIN'), false);
    assert.equal(S.canTransition('RETURNED', to, 'ADMIN'), false);
  }
  assert.equal(S.isFinal('CANCELLED'), true);
  assert.equal(S.isFinal('RETURNED'), true);
  assert.equal(S.isFinal('PENDING'), false);
});

test('khách hàng chỉ được hủy đơn khi còn "Chờ xác nhận"', () => {
  assert.equal(S.canTransition('PENDING', 'CANCELLED', 'CUSTOMER'), true);
  assert.equal(S.canTransition('CONFIRMED', 'CANCELLED', 'CUSTOMER'), false);
  assert.equal(S.canTransition('PENDING', 'CONFIRMED', 'CUSTOMER'), false);
  assert.equal(S.canTransition('SHIPPING', 'DELIVERED', 'CUSTOMER'), false);
  assert.deepEqual(S.nextStatuses('PENDING', 'CUSTOMER'), ['CANCELLED']);
});

test('nextStatuses cho admin theo từng trạng thái', () => {
  assert.deepEqual(S.nextStatuses('PENDING', 'ADMIN').sort(), ['CANCELLED', 'CONFIRMED']);
  assert.deepEqual(S.nextStatuses('CONFIRMED', 'ADMIN').sort(), ['CANCELLED', 'SHIPPING']);
  assert.deepEqual(S.nextStatuses('SHIPPING', 'ADMIN').sort(), ['DELIVERED', 'RETURNED']);
  assert.deepEqual(S.nextStatuses('DELIVERED', 'ADMIN'), ['RETURNED']);
  assert.deepEqual(S.nextStatuses('CANCELLED', 'ADMIN'), []);
});

test('kho: trừ khi xác nhận, hoàn khi hủy hoặc trả sau khi đã trừ, không đụng kho khi hủy lúc chờ xác nhận', () => {
  assert.equal(S.stockEffect('PENDING', 'CONFIRMED'), 'DEDUCT');
  assert.equal(S.stockEffect('CONFIRMED', 'CANCELLED'), 'RESTORE');
  assert.equal(S.stockEffect('SHIPPING', 'RETURNED'), 'RESTORE');
  assert.equal(S.stockEffect('DELIVERED', 'RETURNED'), 'RESTORE');
  assert.equal(S.stockEffect('PENDING', 'CANCELLED'), 'NONE');
  assert.equal(S.stockEffect('CONFIRMED', 'SHIPPING'), 'NONE');
  assert.equal(S.stockEffect('SHIPPING', 'DELIVERED'), 'NONE');
});

test('mã giảm giá chỉ được hoàn lượt dùng khi HỦY, không hoàn khi trả hàng', () => {
  assert.equal(S.releasesDiscount('CANCELLED'), true);
  assert.equal(S.releasesDiscount('RETURNED'), false);
});

test('tiện ích hiển thị', () => {
  assert.equal(S.label('DELIVERED'), 'Đã giao');
  assert.equal(S.badgeClass('PENDING'), 'status-pending');
  assert.equal(S.isValid('PENDING'), true);
  assert.equal(S.isValid('HACKED'), false);
  assert.equal(S.isValid('__proto__'), false);
});
