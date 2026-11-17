'use strict';
// [UC06] Kiểm thử ba cổng thanh toán (giả lập, payOS, VNPay): tạo link, kiểm tra chữ ký thông báo, phản hồi cho cổng.
process.env.LOG_LEVEL = 'error'; // không in cảnh báo trong lúc chạy test

const test = require('node:test');
const assert = require('node:assert/strict');
const sig = require('../utils/payment/signature');
const { createMockProvider } = require('../services/payment/providers/mock');
const { createPayosProvider } = require('../services/payment/providers/payos');
const { createVnpayProvider, normalizeIp } = require('../services/payment/providers/vnpay');

/* ------------------------------------------------------------------ mock */
test('mock: tạo link, thông báo thành công đã ký được chấp nhận', async () => {
  const p = createMockProvider({ secret: 's3cret' });
  assert.equal(p.isConfigured(), true);
  const co = await p.createCheckout({ paymentRef: '123' });
  assert.equal(co.url, '/payment/mock/123');

  const body = p.buildEvent({ paymentRef: '123', amount: 801000, action: 'success' });
  const r = p.parseWebhook({ body });
  assert.equal(r.signatureValid, true);
  assert.equal(r.paymentRef, '123');
  assert.equal(r.amount, 801000);
  assert.equal(r.success, true);
  assert.equal(r.txnNo, 'MOCK-123');
});

test('mock: thông báo thất bại hợp lệ nhưng success = false', () => {
  const p = createMockProvider({ secret: 's3cret' });
  const r = p.parseWebhook({ body: p.buildEvent({ paymentRef: '123', amount: 801000, action: 'fail' }) });
  assert.equal(r.signatureValid, true);
  assert.equal(r.success, false);
});

test('mock: sửa số tiền sau khi ký (tamper) bị từ chối chữ ký', () => {
  const p = createMockProvider({ secret: 's3cret' });
  const body = p.buildEvent({ paymentRef: '123', amount: 801000, action: 'tamper' });
  const r = p.parseWebhook({ body });
  assert.equal(r.signatureValid, false);
  assert.equal(r.paymentRef, '123');
});

test('mock: chữ ký đúng nhưng số tiền sai vẫn qua chữ ký (việc chặn nằm ở bước so số tiền)', () => {
  const p = createMockProvider({ secret: 's3cret' });
  const r = p.parseWebhook({ body: p.buildEvent({ paymentRef: '123', amount: 801000, action: 'wrongamount' }) });
  assert.equal(r.signatureValid, true);
  assert.equal(r.amount, 800000);
});

test('mock: khóa rỗng không bao giờ chấp nhận chữ ký (không thể giả mạo bằng khóa rỗng)', () => {
  const strong = createMockProvider({ secret: 's3cret' });
  const weak = createMockProvider({ secret: '' });
  assert.equal(weak.isConfigured(), false);
  const forged = { paymentRef: '123', amount: 1, status: 'SUCCESS', transactionNo: 'X', responseCode: '00' };
  forged.signature = sig.mockSign(forged, '');
  assert.equal(weak.parseWebhook({ body: forged }).signatureValid, false);
  assert.equal(strong.parseWebhook({ body: forged }).signatureValid, false);
});

test('mock: thân thông báo rỗng hoặc sai kiểu không làm chương trình lỗi', () => {
  const p = createMockProvider({ secret: 's3cret' });
  for (const body of [undefined, null, {}, [], 'abc', { paymentRef: 5 }]) {
    assert.equal(p.parseWebhook({ body }).signatureValid, false);
  }
});

test('mock: phản hồi cho cổng', () => {
  const p = createMockProvider({ secret: 's3cret' });
  assert.equal(p.ack({ signatureValid: true, outcome: 'PAID' }).status, 200);
  assert.equal(p.ack({ signatureValid: false, outcome: 'INVALID_SIGNATURE' }).status, 400);
});

/* ------------------------------------------------------------------ VNPay */
const VNP_CFG = { tmnCode: 'TMN001', hashSecret: 'hash-secret', url: 'https://sandbox.example/vpcpay.html' };

function paramsOf(url) {
  return Object.fromEntries(new URL(url).searchParams);
}

function ipnFrom(url, secret, extra) {
  const params = paramsOf(url);
  delete params.vnp_SecureHash;
  Object.assign(params, extra);
  params.vnp_SecureHash = sig.vnpSign(params, secret);
  return params;
}

test('VNPay: URL thanh toán đúng tham số và tự kiểm tra được chữ ký', async () => {
  const p = createVnpayProvider(VNP_CFG);
  assert.equal(p.isConfigured(), true);
  const co = await p.createCheckout({
    paymentRef: '1730000000000123', amount: 801000, description: 'Don AM261104ABCDE',
    returnUrl: 'https://shop.example/payment/vnpay/return', ipAddr: '::ffff:203.0.113.5', expiresAt: new Date(Date.now() + 900000),
  });
  const q = paramsOf(co.url);
  assert.equal(q.vnp_TmnCode, 'TMN001');
  assert.equal(q.vnp_TxnRef, '1730000000000123');
  assert.equal(q.vnp_Amount, '80100000'); // nhân 100
  assert.equal(q.vnp_IpAddr, '203.0.113.5');
  assert.equal(q.vnp_ReturnUrl, 'https://shop.example/payment/vnpay/return');
  assert.match(q.vnp_CreateDate, /^\d{14}$/);
  assert.equal(q.vnp_SecureHash.length, 128);

  const parsed = p.parseWebhook({ query: q });
  assert.equal(parsed.signatureValid, true);
  assert.equal(parsed.amount, 801000);
  assert.equal(parsed.success, false, 'chưa có mã phản hồi thành công');
});

test('VNPay: IPN thành công đã ký được chấp nhận, sửa số tiền thì bị từ chối', async () => {
  const p = createVnpayProvider(VNP_CFG);
  const co = await p.createCheckout({
    paymentRef: '1730000000000123', amount: 801000, description: 'Don AM1', returnUrl: 'https://shop.example/r', ipAddr: '1.2.3.4', expiresAt: new Date(),
  });
  const ipn = ipnFrom(co.url, 'hash-secret', { vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: '14123456' });
  const r = p.parseWebhook({ query: ipn });
  assert.equal(r.signatureValid, true);
  assert.equal(r.success, true);
  assert.equal(r.paymentRef, '1730000000000123');
  assert.equal(r.amount, 801000);
  assert.equal(r.txnNo, '14123456');

  const tampered = { ...ipn, vnp_Amount: '100' };
  const t = p.parseWebhook({ query: tampered });
  assert.equal(t.signatureValid, false);
  assert.equal(t.paymentRef, '1730000000000123');
});

test('VNPay: khách hủy giao dịch (mã 24) hợp lệ nhưng không thành công', async () => {
  const p = createVnpayProvider(VNP_CFG);
  const co = await p.createCheckout({ paymentRef: '555', amount: 1000, description: 'x', returnUrl: 'https://shop.example/r', ipAddr: '1.2.3.4', expiresAt: new Date() });
  const ipn = ipnFrom(co.url, 'hash-secret', { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' });
  const r = p.parseWebhook({ query: ipn });
  assert.equal(r.signatureValid, true);
  assert.equal(r.success, false);
  assert.equal(r.cancelled, true);
  const ret = await p.resolveReturn({ query: ipn });
  assert.equal(ret.signatureValid, true);
  assert.equal(ret.cancelled, true);
});

test('VNPay: khóa rỗng không thể giả mạo chữ ký', () => {
  const weak = createVnpayProvider({ ...VNP_CFG, hashSecret: '' });
  assert.equal(weak.isConfigured(), false);
  const q = { vnp_TxnRef: '1', vnp_Amount: '100', vnp_ResponseCode: '00' };
  q.vnp_SecureHash = sig.vnpSign(q, '');
  assert.equal(weak.parseWebhook({ query: q }).signatureValid, false);
});

test('VNPay: mã phản hồi IPN theo quy ước', () => {
  const p = createVnpayProvider(VNP_CFG);
  const code = (signatureValid, outcome) => p.ack({ signatureValid, outcome }).json.RspCode;
  assert.equal(code(false, 'INVALID_SIGNATURE'), '97');
  assert.equal(code(true, 'PAID'), '00');
  assert.equal(code(true, 'FAILED'), '00');
  assert.equal(code(true, 'DUPLICATE'), '02');
  assert.equal(code(true, 'PAYMENT_NOT_FOUND'), '01');
  assert.equal(code(true, 'AMOUNT_MISMATCH'), '04');
  assert.equal(code(true, 'GI_DO'), '99');
  assert.equal(p.ack({ signatureValid: false, outcome: 'X' }).status, 200, 'VNPay luôn nhận HTTP 200');
});

test('VNPay: chuẩn hóa địa chỉ IP', () => {
  assert.equal(normalizeIp('::1'), '127.0.0.1');
  assert.equal(normalizeIp('::ffff:10.0.0.1'), '10.0.0.1');
  assert.equal(normalizeIp('8.8.8.8'), '8.8.8.8');
  assert.equal(normalizeIp('abc'), '127.0.0.1');
  assert.equal(normalizeIp(undefined), '127.0.0.1');
});

/* ------------------------------------------------------------------ payOS */
const PAYOS_CFG = { apiUrl: 'https://api.example', clientId: 'cid', apiKey: 'key', checksumKey: 'ck' };

function fakeFetch(queue) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return { ok: next.ok !== false, json: async () => next.body };
  };
  fn.calls = calls;
  return fn;
}

const checkoutArgs = (over = {}) => ({
  paymentRef: '1730000000000123', amount: 2000, description: 'Don AM261104ABCDE',
  returnUrl: 'https://shop.example/payment/payos/return', cancelUrl: 'https://shop.example/payment/payos/cancel',
  expiresAt: new Date('2026-11-04T10:00:00Z'), ...over,
});

test('payOS: tạo link thanh toán gửi đúng tiêu đề, nội dung và chữ ký', async () => {
  const f = fakeFetch([{ body: { code: '00', desc: 'success', data: { checkoutUrl: 'https://pay.example/abc' } } }]);
  const p = createPayosProvider(PAYOS_CFG, { fetch: f });
  assert.equal(p.isConfigured(), true);
  const out = await p.createCheckout(checkoutArgs());
  assert.equal(out.url, 'https://pay.example/abc');

  const call = f.calls[0];
  assert.equal(call.url, 'https://api.example/v2/payment-requests');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers['x-client-id'], 'cid');
  assert.equal(call.options.headers['x-api-key'], 'key');
  const body = JSON.parse(call.options.body);
  assert.equal(body.orderCode, 1730000000000123);
  assert.equal(body.amount, 2000);
  assert.equal(body.expiredAt, Math.floor(new Date('2026-11-04T10:00:00Z').getTime() / 1000));
  assert.ok(body.description.length <= 25);
  assert.equal(
    body.signature,
    sig.payosSignCreate({ amount: body.amount, cancelUrl: body.cancelUrl, description: body.description, orderCode: body.orderCode, returnUrl: body.returnUrl }, 'ck'));
});

test('payOS: từ chối khi cổng báo lỗi, link không phải https hoặc mã tham chiếu không phải số', async () => {
  const isBusiness = (e) => e.name === 'BusinessError';
  const errCode = createPayosProvider(PAYOS_CFG, { fetch: fakeFetch([{ body: { code: '231', desc: 'loi' } }]) });
  await assert.rejects(errCode.createCheckout(checkoutArgs()), isBusiness);

  const httpLink = createPayosProvider(PAYOS_CFG, { fetch: fakeFetch([{ body: { code: '00', data: { checkoutUrl: 'http://pay.example/x' } } }]) });
  await assert.rejects(httpLink.createCheckout(checkoutArgs()), isBusiness);

  const jsLink = createPayosProvider(PAYOS_CFG, { fetch: fakeFetch([{ body: { code: '00', data: { checkoutUrl: 'javascript:alert(1)' } } }]) });
  await assert.rejects(jsLink.createCheckout(checkoutArgs()), isBusiness);

  const badRef = createPayosProvider(PAYOS_CFG, { fetch: fakeFetch([]) });
  await assert.rejects(badRef.createCheckout(checkoutArgs({ paymentRef: 'abc' })));
});

const hookData = () => ({
  orderCode: 1730000000000123, amount: 2000, description: 'Don AM1', reference: 'FT26001', paymentLinkId: 'pl1', code: '00', desc: 'Thanh cong',
});

test('payOS: webhook ký đúng được chấp nhận, sửa dữ liệu bị từ chối', () => {
  const p = createPayosProvider(PAYOS_CFG);
  const data = hookData();
  const body = { code: '00', desc: 'success', success: true, data, signature: sig.payosSignData(data, 'ck') };
  const r = p.parseWebhook({ body });
  assert.equal(r.signatureValid, true);
  assert.equal(r.paymentRef, '1730000000000123');
  assert.equal(r.amount, 2000);
  assert.equal(r.success, true);
  assert.equal(r.txnNo, 'FT26001');

  const t = p.parseWebhook({ body: { ...body, data: { ...data, amount: 1 } } });
  assert.equal(t.signatureValid, false);
  assert.equal(t.paymentRef, '1730000000000123');
});

test('payOS: Checksum Key rỗng không thể giả mạo chữ ký', () => {
  const weak = createPayosProvider({ ...PAYOS_CFG, checksumKey: '' });
  assert.equal(weak.isConfigured(), false);
  const data = hookData();
  const forged = { code: '00', data, signature: sig.payosSignData(data, '') };
  assert.equal(weak.parseWebhook({ body: forged }).signatureValid, false);
  assert.equal(createPayosProvider(PAYOS_CFG).parseWebhook({ body: forged }).signatureValid, false);
});

test('payOS: webhook thiếu dữ liệu hoặc sai kiểu không làm chương trình lỗi', () => {
  const p = createPayosProvider(PAYOS_CFG);
  for (const body of [undefined, null, {}, { data: null }, { data: {}, signature: 5 }, 'abc']) {
    assert.equal(p.parseWebhook({ body }).signatureValid, false);
  }
});

test('payOS: phản hồi cho cổng', () => {
  const p = createPayosProvider(PAYOS_CFG);
  assert.equal(p.ack({ signatureValid: true, outcome: 'PAID' }).status, 200);
  assert.equal(p.ack({ signatureValid: true, outcome: 'PAYMENT_NOT_FOUND' }).status, 200, 'chữ ký đúng mà không thấy đơn vẫn trả 200');
  assert.equal(p.ack({ signatureValid: false, outcome: 'INVALID_SIGNATURE' }).status, 400);
});

test('payOS: trang quay về chỉ tin kết quả do API trả về, không tin tham số trên URL', async () => {
  const paid = createPayosProvider(PAYOS_CFG, {
    fetch: fakeFetch([{ body: { code: '00', data: { id: 'x', status: 'PAID', amount: 2000, transactions: [{ reference: 'FT9' }] } } }]),
  });
  const r = await paid.resolveReturn({ query: { orderCode: '123', status: 'PAID' } });
  assert.equal(r.signatureValid, true);
  assert.equal(r.event.success, true);
  assert.equal(r.event.amount, 2000);
  assert.equal(r.event.txnNo, 'FT9');
  assert.equal(r.event.paymentRef, '123');

  // URL ghi PAID nhưng API nói chưa trả: không được coi là đã thanh toán
  const unpaid = createPayosProvider(PAYOS_CFG, {
    fetch: fakeFetch([{ body: { code: '00', data: { id: 'x', status: 'PENDING', amount: 2000 } } }]),
  });
  const u = await unpaid.resolveReturn({ query: { orderCode: '123', status: 'PAID' } });
  assert.equal(u.event, null);

  const cancelled = createPayosProvider(PAYOS_CFG, {
    fetch: fakeFetch([{ body: { code: '00', data: { id: 'x', status: 'CANCELLED', amount: 2000 } } }]),
  });
  const c = await cancelled.resolveReturn({ query: { orderCode: '123' } });
  assert.equal(c.cancelled, true);
  assert.equal(c.event, null);
});

test('payOS: không gọi được API thì không ghi nhận đã trả; mã đơn sai định dạng bị từ chối', async () => {
  const down = createPayosProvider(PAYOS_CFG, { fetch: fakeFetch([new Error('mất mạng')]) });
  const r = await down.resolveReturn({ query: { orderCode: '123', cancel: 'true' } });
  assert.equal(r.event, null);
  assert.equal(r.cancelled, true);

  const invalid = createPayosProvider(PAYOS_CFG, { fetch: fakeFetch([]) });
  assert.equal((await invalid.resolveReturn({ query: { orderCode: 'abc' } })).signatureValid, false);
  assert.equal((await invalid.resolveReturn({ query: {} })).signatureValid, false);
});
