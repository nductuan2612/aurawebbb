'use strict';
/**
 * [UC06] Model thanh toán: truy vấn đọc và ghi nhật ký webhook.
 * Việc đổi trạng thái thanh toán (PENDING -> PAID...) nằm trong services/payment/apply.js
 * và services/orderService.js vì phải chạy chung giao dịch với đơn hàng.
 */
const db = require('../config/db');

async function listByOrder(orderId) {
  return (await db.query(
    `SELECT PaymentId AS id, Provider AS provider, PaymentRef AS paymentRef, Amount AS amount, Status AS status,
            GatewayTxnNo AS gatewayTxnNo, GatewayResponseCode AS gatewayResponseCode, CheckoutUrl AS checkoutUrl,
            ExpiresAt AS expiresAt, PaidAt AS paidAt, RefundedAt AS refundedAt, CreatedAt AS createdAt
       FROM Payments WHERE OrderId = :oid ORDER BY CreatedAt, PaymentId`, { oid: orderId })).rows;
}

/** Tìm thanh toán theo mã tham chiếu gửi sang cổng, kèm đơn hàng và chủ đơn. */
async function findByRef(provider, paymentRef) {
  return db.one(
    `SELECT p.PaymentId AS id, p.OrderId AS orderId, p.Provider AS provider, p.PaymentRef AS paymentRef,
            p.Amount AS amount, p.Status AS status, o.OrderCode AS orderCode, o.UserId AS userId, o.Status AS orderStatus
       FROM Payments p JOIN Orders o ON o.OrderId = p.OrderId
      WHERE p.Provider = :prov AND p.PaymentRef = :ref`, { prov: provider, ref: paymentRef });
}

/** Link thanh toán còn hiệu lực của đơn (để tiếp tục thanh toán mà không tạo lần thử mới). */
async function pendingCheckout(orderId, provider) {
  return db.one(
    `SELECT PaymentId AS id, PaymentRef AS paymentRef, CheckoutUrl AS url, ExpiresAt AS expiresAt
       FROM Payments
      WHERE OrderId = :oid AND Provider = :prov AND Status = 'PENDING' AND CheckoutUrl IS NOT NULL
        AND (ExpiresAt IS NULL OR ExpiresAt > UTC_TIMESTAMP())
      ORDER BY PaymentId DESC
      LIMIT 1`, { oid: orderId, prov: provider });
}

/** [UC06] Ghi nhật ký mọi lần cổng gọi IPN/webhook, kể cả sai chữ ký và gửi lặp. Lỗi ghi log không được làm hỏng luồng chính. */
/** Create or reuse a pending SePay QR payment. */
async function createSepayQr({ orderId, amount, orderCode, qrUrl, provider = 'SEPAY' }) {
  return db.tx(async (t) => {
    const existing = await t.one(
      `SELECT PaymentId AS id, PaymentRef AS paymentRef, CheckoutUrl AS checkoutUrl,
              Amount AS amount, Status AS status, CreatedAt AS createdAt
         FROM Payments
        WHERE OrderId = :oid AND Provider = :prov
        ORDER BY PaymentId DESC LIMIT 1`, { oid: orderId, prov: provider });
    if (existing && existing.status === 'PENDING') return existing;
    await t.query(
      `UPDATE Payments SET Status = 'CANCELLED', UpdatedAt = UTC_TIMESTAMP()
         WHERE OrderId = :oid AND Provider = :prov AND Status = 'PENDING'`, { oid: orderId, prov: provider });
    const paymentRef = `SEP${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const id = await t.insert(
      `INSERT INTO Payments (OrderId, Provider, PaymentRef, Amount, Status, CheckoutUrl)
       VALUES (:oid, :prov, :ref, :amount, 'PENDING', :url)`,
      { oid: orderId, prov: provider, ref: paymentRef, amount, url: qrUrl });
    return { id, paymentRef, checkoutUrl: qrUrl, amount, status: 'PENDING', orderCode };
  });
}

async function paymentStatusByOrder(orderId, provider) {
  return db.one(
    `SELECT PaymentId AS id, PaymentRef AS paymentRef, Status AS status, Amount AS amount,
            PaidAt AS paidAt, UpdatedAt AS updatedAt
       FROM Payments
      WHERE OrderId = :oid AND Provider = :prov
      ORDER BY PaymentId DESC
      LIMIT 1`, { oid: orderId, prov: provider });
}

async function logWebhook({ provider, paymentRef, gatewayTxnNo, signatureValid, outcome, rawPayload, sourceIp }) {
  await db.query(
    `INSERT INTO PaymentWebhookLogs (Provider, PaymentRef, GatewayTxnNo, SignatureValid, Outcome, RawPayload, SourceIp)
     VALUES (:prov, :ref, :txn, :sig, :out, :raw, :ip)`,
    {
      prov: String(provider).slice(0, 10),
      ref: paymentRef ? String(paymentRef).slice(0, 40) : null,
      txn: gatewayTxnNo ? String(gatewayTxnNo).slice(0, 64) : null,
      sig: signatureValid ? 1 : 0,
      out: String(outcome).slice(0, 30),
      raw: rawPayload ? String(rawPayload).slice(0, 4000) : null,
      ip: sourceIp ? String(sourceIp).slice(0, 64) : null,
    });
}

/** Nhật ký webhook của các lần thanh toán thuộc đơn (hiển thị cho admin). */
async function recentWebhookLogs(orderId) {
  return (await db.query(
    `SELECT w.LogId AS id, w.Provider AS provider, w.PaymentRef AS paymentRef, w.GatewayTxnNo AS txn,
            w.SignatureValid AS signatureValid, w.Outcome AS outcome, w.SourceIp AS ip, w.ReceivedAt AS receivedAt
       FROM PaymentWebhookLogs w
      WHERE EXISTS (SELECT 1 FROM Payments p
                     WHERE p.OrderId = :oid AND p.Provider = w.Provider AND p.PaymentRef = w.PaymentRef)
      ORDER BY w.ReceivedAt DESC, w.LogId DESC
      LIMIT 20`, { oid: orderId })).rows;
}

module.exports = { listByOrder, findByRef, pendingCheckout, createSepayQr, paymentStatusByOrder, logWebhook, recentWebhookLogs };
