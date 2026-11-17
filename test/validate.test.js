'use strict';
// Kiểm thử kiểm tra dữ liệu đầu vào của form (email, số điện thoại, mật khẩu, số, ảnh).
const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../utils/validate');

test('email: hợp lệ được chuẩn hóa chữ thường, sai định dạng bị từ chối', () => {
  assert.equal(v.email('  A.B@Example.COM ').value, 'a.b@example.com');
  for (const bad of ['', 'abc', 'a@b', 'a@@b.com', 'a..b@x.com', '.a@x.com', 'a@x..com', 'a b@x.com', '<script>@x.com']) {
    assert.ok(v.email(bad).error, JSON.stringify(bad));
  }
});

test('phone: chấp nhận 0xxxxxxxxx và +84, chuẩn hóa về dạng 0', () => {
  assert.equal(v.phone('0912345678').value, '0912345678');
  assert.equal(v.phone('091 234 5678').value, '0912345678');
  assert.equal(v.phone('+84912345678').value, '0912345678');
  assert.ok(v.phone('0212345678').error);
  assert.ok(v.phone('091234567').error);
  assert.ok(v.phone('abc').error);
  assert.ok(v.phone('').error);
  assert.equal(v.phone('', { required: false }).value, null);
});

test('password: tối thiểu 8 ký tự, có chữ và số, không quá 72 byte', () => {
  assert.ok(v.password('abc12345').value);
  assert.ok(v.password('short1').error);
  assert.ok(v.password('chỉ-có-chữ-cái').error);
  assert.ok(v.password('12345678').error);
  assert.ok(v.password('a1' + 'x'.repeat(71)).error);
  assert.ok(v.password(undefined).error);
});

test('line: bỏ ký tự điều khiển và gộp khoảng trắng', () => {
  assert.equal(v.line('  Nguyễn \t Văn\n A \u0007'), 'Nguyễn Văn A');
  assert.equal(v.line('x'.repeat(50), 10).length, 10);
});

test('intInRange: nhận cả kiểu gõ có dấu chấm ngăn cách hàng nghìn', () => {
  assert.equal(v.intInRange('1.290.000', 'giá', 0, 50000000).value, 1290000);
  assert.equal(v.intInRange('250', 'giá', 0, 1000).value, 250);
  assert.ok(v.intInRange('12.5', 'giá', 0, 100).error);
  assert.ok(v.intInRange('-1', 'giá', 0, 100).error);
  assert.ok(v.intInRange('101', 'giá', 0, 100).error);
  assert.ok(v.intInRange('abc', 'giá', 0, 100).error);
  assert.ok(v.intInRange('1e3', 'giá', 0, 100000).error);
});

test('id: chỉ nhận số nguyên dương hợp lệ', () => {
  assert.equal(v.id('42'), 42);
  for (const bad of ['0', '-1', '1.5', 'abc', '', '99999999999', "1; DROP TABLE Users", null, undefined]) {
    assert.equal(v.id(bad), null, JSON.stringify(bad));
  }
});

test('hexColor, size, slug', () => {
  assert.equal(v.hexColor('#1c1c1c').value, '#1C1C1C');
  assert.ok(v.hexColor('red').error);
  assert.ok(v.hexColor('#12345').error);
  assert.equal(v.size('xl').value, 'XL');
  assert.ok(v.size('XXL').error);
  assert.equal(v.slug('ao-so-mi').value, 'ao-so-mi');
  assert.ok(v.slug('Áo sơ mi').error);
  assert.ok(v.slug('a--b').error);
});

test('imageLines: nhận /images/... và https, từ chối còn lại', () => {
  const ok = v.imageLines('/images/products/P001.jpg\nhttps://cdn.example.com/a.png\n\n', 8);
  assert.deepEqual(ok.value, ['/images/products/P001.jpg', 'https://cdn.example.com/a.png']);
  for (const bad of ['javascript:alert(1)', '//evil.com/x.jpg', '/images/../etc/passwd.jpg', 'http://insecure.example.com/a.jpg', '/uploads/a.jpg', 'data:image/png;base64,AAAA']) {
    assert.ok(v.imageLines(bad, 8).error, bad);
  }
  assert.ok(v.imageLines(Array(9).fill('/images/a.jpg').join('\n'), 8).error);
});

test('dateOfBirth: ngày có thật, không ở tương lai', () => {
  assert.equal(v.dateOfBirth('1998-05-14').value, '1998-05-14');
  assert.equal(v.dateOfBirth('').value, null);
  assert.ok(v.dateOfBirth('2026-02-30').error);
  assert.ok(v.dateOfBirth('14/05/1998').error);
  assert.ok(v.dateOfBirth('2999-01-01').error);
  assert.ok(v.dateOfBirth('1800-01-01').error);
});

test('checked: ô tích chỉ đúng khi gửi "on"', () => {
  assert.equal(v.checked('on'), true);
  assert.equal(v.checked(undefined), false);
  assert.equal(v.checked(''), false);
  assert.equal(v.checked('off'), false);
});
