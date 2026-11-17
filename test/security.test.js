'use strict';
// Kiểm thử các hàm bảo mật: chống open redirect, XSS trong JSON nhúng, thoát LIKE, so sánh an toàn.
const test = require('node:test');
const assert = require('node:assert/strict');
const sec = require('../utils/security');

test('safeNextPath: chỉ nhận đường dẫn nội bộ', () => {
  assert.equal(sec.safeNextPath('/account/orders'), '/account/orders');
  assert.equal(sec.safeNextPath('/products?sort=newest&page=2'), '/products?sort=newest&page=2');
  assert.equal(sec.safeNextPath(undefined, '/x'), '/x');
});

test('safeNextPath: chặn open redirect', () => {
  for (const evil of ['//evil.com', '/\\evil.com', 'https://evil.com', 'http://evil.com/x', 'javascript:alert(1)', 'evil.com', '/\t/evil.com', '/a\nb', '/a\\b']) {
    assert.equal(sec.safeNextPath(evil, '/'), '/', JSON.stringify(evil));
  }
  assert.equal(sec.safeNextPath('/' + 'a'.repeat(400)), '/');
});

test('safeJson: không thể thoát khỏi thẻ script và vẫn đọc lại đúng dữ liệu', () => {
  const original = { name: '</script><script>alert(1)</script>', amp: 'a&b', sep: 'x' + String.fromCharCode(0x2028) + 'y' + String.fromCharCode(0x2029) };
  const out = sec.safeJson(original);
  assert.ok(!out.includes('<'));
  assert.ok(!out.includes('>'));
  assert.ok(!out.includes(String.fromCharCode(0x2028)));
  assert.ok(!out.includes(String.fromCharCode(0x2029)));
  assert.deepEqual(JSON.parse(out), original);
  assert.equal(sec.safeJson(undefined), 'null');
});

test('escapeLike: thoát % _ [ và \\', () => {
  assert.equal(sec.escapeLike('50%_off[x]\\'), '50\\%\\_off\\[x]\\\\');
  assert.equal(sec.escapeLike('ao thun'), 'ao thun');
});

test('safeEqual: so sánh đúng cả khi độ dài khác nhau', () => {
  assert.equal(sec.safeEqual('abc', 'abc'), true);
  assert.equal(sec.safeEqual('abc', 'abd'), false);
  assert.equal(sec.safeEqual('abc', 'abcd'), false);
  assert.equal(sec.safeEqual('', ''), true);
});

test('sha256Hex và randomToken', () => {
  assert.equal(sec.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const a = sec.randomToken();
  const b = sec.randomToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});
