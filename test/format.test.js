'use strict';
// Kiểm thử định dạng tiền, giờ Việt Nam, phân trang, slug.
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatVnd, percentOff, maskName } = require('../utils/format');
const time = require('../utils/time');
const { paginate } = require('../utils/pagination');
const { slugify } = require('../utils/slug');

test('formatVnd', () => {
  assert.equal(formatVnd(1290000), '1.290.000₫');
  assert.equal(formatVnd(0), '0₫');
  assert.equal(formatVnd(999), '999₫');
  assert.equal(formatVnd(-5000), '-5.000₫');
  assert.equal(formatVnd('abc'), '');
});

test('percentOff làm tròn và bỏ qua giá gốc không hợp lệ', () => {
  assert.equal(percentOff(890000, 1090000), 18);
  assert.equal(percentOff(450000, 590000), 24);
  assert.equal(percentOff(500, null), 0);
  assert.equal(percentOff(500, 400), 0);
});

test('maskName: che bớt họ tên khi hiển thị đánh giá công khai', () => {
  assert.equal(maskName('Nguyễn Thu Hà'), 'Nguyễn T. H.');
  assert.equal(maskName('An'), 'An');
  assert.equal(maskName(''), 'Khách hàng');
});

test('giờ Việt Nam: đổi qua lại với UTC (UTC+7)', () => {
  const d = new Date('2026-11-03T17:30:00Z');
  assert.equal(time.formatDateTime(d), '00:30 04/11/2026');
  assert.equal(time.formatDate(d), '04/11/2026');
  assert.equal(time.toDateInput(d), '2026-11-04');
  assert.equal(time.toDateTimeLocal(d), '2026-11-04T00:30');
  assert.equal(time.fromDateTimeLocal('2026-11-04T07:00').toISOString(), '2026-11-04T00:00:00.000Z');
  assert.equal(time.fromDateInput('2026-11-04').toISOString(), '2026-11-03T17:00:00.000Z');
  assert.equal(time.toDateTimeLocal(time.fromDateTimeLocal('2026-12-31T23:59')), '2026-12-31T23:59');
});

test('giờ Việt Nam: ngày không có thật bị từ chối', () => {
  assert.equal(time.parseYmd('2026-02-30'), null);
  assert.equal(time.parseYmd('2026-13-01'), null);
  assert.equal(time.fromDateTimeLocal('2026-02-30T10:00'), null);
  assert.equal(time.fromDateTimeLocal('abc'), null);
  assert.deepEqual(time.parseYmd('2028-02-29'), { y: 2028, mo: 2, d: 29 });
});

test('mã đơn và mốc thời gian VNPay theo giờ Việt Nam', () => {
  const d = new Date('2026-11-03T17:30:15Z');
  assert.equal(time.vnYYMMDD(d), '261104');
  assert.equal(time.vnTimestamp14(d), '20261104003015');
});

test('paginate', () => {
  assert.deepEqual(paginate(240, 5, 12).items, [1, 2, 3, 4, 5, 6, null, 19, 20]);
  const p = paginate(0, 1, 12);
  assert.equal(p.totalPages, 1);
  assert.deepEqual(p.items, [1]);
  assert.equal(paginate(100, 99, 12).current, 9);
  assert.equal(paginate(100, -3, 12).current, 1);
  assert.equal(paginate(100, 'x', 12).current, 1);
  assert.equal(paginate(30, 2, 12).offset, 12);
  assert.equal(paginate(30, 3, 12).hasNext, false);
});

test('slugify bỏ dấu tiếng Việt, kể cả đ', () => {
  assert.equal(slugify('Áo sơ mi lụa cổ nơ'), 'ao-so-mi-lua-co-no');
  assert.equal(slugify('Đầm xòe hoa nhí'), 'dam-xoe-hoa-nhi');
  assert.equal(slugify('  Quần   jeans!! (xanh)  '), 'quan-jeans-xanh');
  assert.equal(slugify(''), '');
});
