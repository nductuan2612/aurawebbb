'use strict';
// Guard /admin: tài khoản khách hàng bị chặn tuyệt đối, với mọi phương thức HTTP.
process.env.LOG_LEVEL = 'error';

const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');

// middleware/auth.js nạp config/db (kéo theo gói mysql2). Test này không cần CSDL nên thay bằng bản rỗng khi nạp.
const origLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === 'mysql2/promise' || request === 'mysql2') return {};
  if (request === 'dotenv') return { config() {} };
  return origLoad.call(this, request, ...rest);
};
const { requireAdmin, requireAuth, requireGuest } = require('../middleware/auth');
Module._load = origLoad;

function run(mw, { user = null, method = 'GET', url = '/admin/orders' } = {}) {
  const req = { user, method, originalUrl: url };
  const res = { redirected: null, redirect(u) { this.redirected = u; } };
  let nextArg;
  let nextCalled = false;
  mw(req, res, (arg) => { nextCalled = true; nextArg = arg; });
  return { res, nextCalled, err: nextArg };
}

const customer = { id: 2, role: 'CUSTOMER', email: 'c@example.com', fullName: 'Khách' };
const admin = { id: 1, role: 'ADMIN', email: 'a@example.com', fullName: 'Admin' };

test('quản trị viên đi qua guard', () => {
  const r = run(requireAdmin, { user: admin });
  assert.equal(r.nextCalled, true);
  assert.equal(r.err, undefined);
  assert.equal(r.res.redirected, null);
});

test('khách hàng bị chặn 403 với mọi phương thức HTTP và mọi đường dẫn con', () => {
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const url of ['/admin', '/admin/orders', '/admin/products/1/edit', '/admin/discounts/new']) {
      const r = run(requireAdmin, { user: customer, method, url });
      assert.equal(r.nextCalled, true, `${method} ${url}`);
      assert.ok(r.err, `${method} ${url} phải trả lỗi`);
      assert.equal(r.err.status, 403, `${method} ${url}`);
      assert.equal(r.res.redirected, null, 'không được chuyển hướng cho khách đã đăng nhập');
    }
  }
});

test('vai trò lạ hoặc rỗng cũng bị chặn (chỉ đúng chuỗi ADMIN mới qua)', () => {
  for (const role of ['', 'admin', 'Admin', 'ADMIN ', undefined, null, 'SUPERUSER']) {
    const r = run(requireAdmin, { user: { id: 3, role } });
    assert.equal(r.err && r.err.status, 403, JSON.stringify(role));
  }
});

test('chưa đăng nhập: GET chuyển tới trang đăng nhập kèm đường dẫn quay lại, POST trả 401', () => {
  const get = run(requireAdmin, { user: null, method: 'GET', url: '/admin/orders?status=PENDING' });
  assert.equal(get.nextCalled, false);
  assert.equal(get.res.redirected, `/login?next=${encodeURIComponent('/admin/orders?status=PENDING')}`);

  const post = run(requireAdmin, { user: null, method: 'POST', url: '/admin/orders/X/status' });
  assert.equal(post.err && post.err.status, 401);
});

test('requireAuth và requireGuest', () => {
  assert.equal(run(requireAuth, { user: customer, url: '/orders' }).err, undefined);
  assert.equal(run(requireAuth, { user: null, url: '/orders' }).res.redirected, '/login?next=%2Forders');
  assert.equal(run(requireGuest, { user: admin }).res.redirected, '/admin');
  assert.equal(run(requireGuest, { user: customer }).res.redirected, '/account');
  assert.equal(run(requireGuest, { user: null }).nextCalled, true);
});
