'use strict';
/**
 * [UC06] Service thanh toán: COD và cổng thanh toán online.
 *
 *   startOnlinePayment : tạo lần thanh toán mới (hoặc dùng lại link còn hạn) và trả về địa chỉ chuyển khách tới cổng.
 *   handleWebhook      : nhận IPN/webhook. KIỂM TRA CHỮ KÝ trước, sai chữ ký thì chỉ ghi nhật ký và từ chối.
 *                        Hợp lệ thì áp dụng sự kiện một cách IDEMPOTENT (gửi lặp không xử lý lại).
 *   handleReturn       : khách quay về từ cổng. Chỉ tin dữ liệu đã được xác thực (chữ ký hoặc gọi lại API cổng).
 * Số tiền luôn lấy từ đơn hàng trong CSDL, không nhận từ trình duyệt.
 */
const crypto = require('crypto');
const db = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');
const { BusinessError, NotFoundError } = require('../utils/errors');
const { safeNextPath } = require('../utils/security');
const paymentModel = require('../models/paymentModel');
const registry = require('./payment/registry');
const { applyEventInTx } = require('./payment/apply');

const CHECKOUT_TTL_MS = 15 * 60 * 1000;

/** Mã tham chiếu gửi sang cổng: 16 chữ số (mili giây + 3 số ngẫu nhiên), nhỏ hơn giới hạn số nguyên an toàn của JavaScript. */
function sepayQrUrl(amount, orderCode) {
  const missing = [
    ['SEPAY_ACCOUNT_NUMBER', env.payment.sepayAccountNumber],
    ['SEPAY_BANK_NAME', env.payment.sepayBankName],
    ['SEPAY_ACCOUNT_NAME', env.payment.sepayAccountName],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new BusinessError(`Ch?a c?u h?nh ${missing.join(', ')} trong file .env.`, { code: 'SEPAY_NOT_CONFIGURED' });
  let url;
  try { url = new URL(env.payment.sepayQrUrl); } catch (_) { throw new BusinessError('SEPAY_QR_URL is invalid.'); }
  const content = `${env.payment.sepayContentPrefix}${orderCode}${env.payment.sepayContentSuffix}`;
  url.searchParams.set('acc', env.payment.sepayAccountNumber);
  url.searchParams.set('bank', env.payment.sepayBankName);
  url.searchParams.set('amount', String(amount));
  url.searchParams.set('des', content);
  url.searchParams.set('template', 'compact');
  return url.toString();
}

async function startSepayQrPayment({ orderCode, userId }) {
  const order = await db.one(`SELECT OrderId AS id, UserId AS userId, TotalAmount AS total, PaymentMethod AS method, Status AS status, OrderCode AS code FROM Orders WHERE OrderCode = :code`, { code: orderCode });
  if (!order || Number(order.userId) !== Number(userId)) throw new NotFoundError('Order not found.');
  if (order.method !== 'ONLINE' || order.status !== 'PENDING') throw new BusinessError('Order is not awaiting payment.');
  const qrUrl = sepayQrUrl(order.total, order.code);
  const payment = await paymentModel.createSepayQr({ orderId: order.id, amount: order.total, orderCode: order.code, qrUrl, provider: registry.active().dbKey });
  return { ...payment, orderCode: order.code, qrUrl };
}

function newPaymentRef() {
  return `${Date.now()}${crypto.randomInt(100, 1000)}`;
}

/** Chỉ chuyển khách tới đường dẫn nội bộ an toàn hoặc địa chỉ https. Chặn javascript:, data:, ký tự lạ. */
function isSafeCheckoutUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 1000) return false;
  if (url.startsWith('/')) return safeNextPath(url, '') === url;
  if (!/^https:\/\/[^\s"'<>\\]+$/i.test(url)) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function activeProvider() {
  return registry.active();
}

// ------------------------------------------------------------------ bắt đầu thanh toán
async function startOnlinePayment({ orderCode, userId, ip }) {
  const provider = registry.active();
  if (!provider || !provider.isConfigured()) {
    throw new BusinessError('Cổng thanh toán online chưa được cấu hình. Vui lòng chọn thanh toán khi nhận hàng hoặc liên hệ cửa hàng.', { code: 'GATEWAY_NOT_CONFIGURED' });
  }

  const attempt = await db.tx(async (t) => {
    const order = await t.one(
      `SELECT OrderId AS id, UserId AS userId, Status AS status, PaymentMethod AS method, TotalAmount AS total, OrderCode AS code
         FROM Orders WHERE OrderCode = :code FOR UPDATE`, { code: orderCode });
    if (!order || order.userId !== userId) throw new NotFoundError('Không tìm thấy đơn hàng.');
    if (order.method !== 'ONLINE') throw new BusinessError('Đơn hàng này thanh toán khi nhận hàng nên không cần thanh toán online.');
    if (order.status !== 'PENDING') throw new BusinessError('Đơn hàng không còn ở trạng thái chờ thanh toán.');
    const paid = await t.scalar(
      "SELECT 1 AS x FROM Payments WHERE OrderId = :oid AND Status IN ('PAID', 'REFUNDED') LIMIT 1", { oid: order.id });
    if (paid) throw new BusinessError('Đơn hàng này đã được thanh toán.');

    // Còn link chưa hết hạn thì dùng lại, tránh sinh nhiều lần thử cho cùng một đơn.
    const reusable = await t.one(
      `SELECT PaymentId AS id, CheckoutUrl AS url FROM Payments
        WHERE OrderId = :oid AND Provider = :prov AND Status = 'PENDING' AND CheckoutUrl IS NOT NULL
          AND (ExpiresAt IS NULL OR ExpiresAt > UTC_TIMESTAMP())
        ORDER BY PaymentId DESC
        LIMIT 1`, { oid: order.id, prov: provider.dbKey });
    if (reusable && isSafeCheckoutUrl(reusable.url)) return { reuseUrl: reusable.url };

    await t.query(
      "UPDATE Payments SET Status = 'CANCELLED', UpdatedAt = UTC_TIMESTAMP() WHERE OrderId = :oid AND Status = 'PENDING'",
      { oid: order.id });
    const paymentRef = newPaymentRef();
    const paymentId = await t.insert(
      `INSERT INTO Payments (OrderId, Provider, PaymentRef, Amount, Status)
         VALUES (:oid, :prov, :ref, :amt, 'PENDING')`,
      { oid: order.id, prov: provider.dbKey, ref: paymentRef, amt: order.total });
    return { paymentId, paymentRef, amount: order.total, orderCode: order.code };
  });

  if (attempt.reuseUrl) return { url: attempt.reuseUrl, reused: true };

  // Gọi cổng NGOÀI giao dịch để không giữ khóa CSDL trong lúc chờ mạng.
  const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);
  let checkout;
  try {
    checkout = await provider.createCheckout({
      paymentRef: attempt.paymentRef,
      amount: attempt.amount,
      description: `Don ${attempt.orderCode}`,
      returnUrl: `${env.appBaseUrl}/payment/${provider.key}/return`,
      cancelUrl: `${env.appBaseUrl}/payment/${provider.key}/cancel`,
      ipAddr: ip,
      expiresAt,
    });
    if (!checkout || !isSafeCheckoutUrl(checkout.url)) throw new Error('Địa chỉ thanh toán từ cổng không hợp lệ');
  } catch (err) {
    await db.query(
      "UPDATE Payments SET Status = 'FAILED', UpdatedAt = UTC_TIMESTAMP() WHERE PaymentId = :id AND Status = 'PENDING'",
      { id: attempt.paymentId });
    if (err instanceof BusinessError) throw err;
    logger.error('Tạo thanh toán thất bại:', err.message);
    throw new BusinessError('Không kết nối được cổng thanh toán. Vui lòng thử lại sau hoặc chọn thanh toán khi nhận hàng.', { code: 'GATEWAY_ERROR' });
  }

  await db.query(
    'UPDATE Payments SET CheckoutUrl = :url, ExpiresAt = :exp, UpdatedAt = UTC_TIMESTAMP() WHERE PaymentId = :id',
    { id: attempt.paymentId, url: checkout.url, exp: checkout.expiresAt || expiresAt });
  return { url: checkout.url, reused: false };
}

/** Link thanh toán còn hiệu lực của đơn (để mở lại trang chuyển tới cổng). */
async function pendingCheckoutUrl(orderId) {
  const provider = registry.active();
  if (!provider) return null;
  const p = await paymentModel.pendingCheckout(orderId, provider.dbKey);
  return p && isSafeCheckoutUrl(p.url) ? p.url : null;
}

// ------------------------------------------------------------------ áp dụng sự kiện từ cổng
/**
 * Áp dụng sự kiện đã qua kiểm tra chữ ký. Idempotent: gọi lại với cùng sự kiện trả outcome DUPLICATE.
 * Trả về { outcome, paymentId, orderId, orderCode, userId, needsRefund }.
 */
async function applyGatewayEvent(providerDbKey, event) {
  try {
    return await db.tx((t) => applyEventInTx(t, { ...event, provider: providerDbKey }));
  } catch (err) {
    if (db.isUniqueViolation(err)) {
      // Hai thông báo cùng lúc, thông báo sau đụng chỉ mục duy nhất ở CSDL (lớp bảo vệ cuối).
      const msg = String(err.message || '');
      const outcome = msg.includes('UX_Payments_OnePaidPerOrder') ? 'DOUBLE_PAYMENT' : 'DUPLICATE';
      return { outcome, paymentId: null, orderId: null, orderCode: null, userId: null, needsRefund: false };
    }
    throw err;
  }
}

function safeStringify(v) {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? null : s;
  } catch (_) {
    return null;
  }
}

async function logSafe(entry) {
  try {
    await paymentModel.logWebhook(entry);
  } catch (err) {
    logger.warn('Không ghi được nhật ký webhook:', err.message);
  }
}

/**
 * Xử lý IPN/webhook từ cổng. Trả về { status, json, outcome } để route phản hồi đúng định dạng của cổng.
 * Lỗi hệ thống (ví dụ CSDL tạm thời không truy cập được) được ném tiếp để route trả 500 và cổng gửi lại sau.
 */
async function handleWebhook(providerKey, { body, query, ip }) {
  const provider = registry.get(providerKey);
  if (!provider || registry.active() !== provider) return { status: 404, json: { ok: false }, outcome: 'PROVIDER_INACTIVE' };

  let parsed;
  try {
    parsed = provider.parseWebhook({ body, query });
  } catch (err) {
    logger.warn('Thông báo thanh toán không đọc được:', err.message);
    parsed = { signatureValid: false };
  }
  const raw = safeStringify(providerKey === 'vnpay' ? query : body);

  if (!parsed.signatureValid) {
    await logSafe({ provider: provider.dbKey, paymentRef: parsed.paymentRef, signatureValid: false, outcome: 'INVALID_SIGNATURE', rawPayload: raw, sourceIp: ip });
    return { ...provider.ack({ signatureValid: false, outcome: 'INVALID_SIGNATURE' }), outcome: 'INVALID_SIGNATURE' };
  }

  const result = await applyGatewayEvent(provider.dbKey, parsed);
  await logSafe({
    provider: provider.dbKey, paymentRef: parsed.paymentRef, gatewayTxnNo: parsed.txnNo,
    signatureValid: true, outcome: result.outcome, rawPayload: raw, sourceIp: ip,
  });
  return { ...provider.ack({ signatureValid: true, outcome: result.outcome }), outcome: result.outcome };
}

/**
 * Khách quay về từ cổng. Trả về { state, orderCode } với state: PAID | PENDING | FAILED | CANCELLED | INVALID.
 * Chỉ chủ đơn mới xem được kết quả; không đủ điều kiện thì INVALID.
 */
async function handleReturn(providerKey, { query, userId }) {
  const provider = registry.get(providerKey);
  if (!provider || registry.active() !== provider) throw new NotFoundError();

  let r;
  try {
    r = await provider.resolveReturn({ query });
  } catch (err) {
    logger.warn('Không xử lý được trang quay về:', err.message);
    r = { signatureValid: false };
  }
  if (!r || !r.paymentRef) return { state: 'INVALID', orderCode: null };

  const pay = await paymentModel.findByRef(provider.dbKey, r.paymentRef);
  if (!pay || pay.userId !== userId) return { state: 'INVALID', orderCode: null };
  if (!r.signatureValid) return { state: 'INVALID', orderCode: pay.orderCode };

  if (r.event) await applyGatewayEvent(provider.dbKey, r.event);

  const fresh = await paymentModel.findByRef(provider.dbKey, r.paymentRef);
  let state = 'PENDING';
  if (fresh && fresh.status === 'PAID') state = 'PAID';
  else if (r.cancelled) state = 'CANCELLED';
  else if (fresh && fresh.status === 'FAILED') state = 'FAILED';
  return { state, orderCode: pay.orderCode };
}

/** Dành cho trang cổng giả lập: tạo thông báo đã ký theo kịch bản chọn. */
function buildMockEvent({ paymentRef, amount, action }) {
  const mock = registry.get('mock');
  return mock.buildEvent({ paymentRef, amount, action });
}

module.exports = {
  startOnlinePayment, startSepayQrPayment, sepayQrUrl, pendingCheckoutUrl, applyGatewayEvent, handleWebhook, handleReturn,
  buildMockEvent, isSafeCheckoutUrl, activeProvider,
};
