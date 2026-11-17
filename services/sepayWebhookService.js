'use strict';

const db = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');
const paymentModel = require('../models/paymentModel');
const sepayTransactionModel = require('../models/sepayTransactionModel');
const { applyEventInTx } = require('./payment/apply');

const MAX_RAW_PAYLOAD = 128 * 1024;
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

function normalizeIp(ip) {
  const value = String(ip || '').trim();
  const match = value.match(IPV4_MAPPED);
  return match ? match[1] : value;
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length > 0 && left.length === right.length && require('crypto').timingSafeEqual(left, right);
}

function validId(value) {
  const text = String(value ?? '').trim();
  return /^\d{1,20}$/.test(text) && BigInt(text) > 0n;
}

function numberValue(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

function text(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function payloadValues(payload, rawPayload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'Payload must be a JSON object.' };
  const id = String(payload.id ?? '').trim();
  const transferAmount = numberValue(payload.transferAmount);
  const accumulated = payload.accumulated === undefined || payload.accumulated === null ? null : numberValue(payload.accumulated);
  const transferType = text(payload.transferType, 10).toLowerCase();
  const accountNumber = text(payload.accountNumber, 100);
  if (!validId(id)) return { error: 'Missing or invalid transaction id.' };
  if (!accountNumber) return { error: 'Missing accountNumber.' };
  if (transferAmount === null || transferAmount < 0) return { error: 'Missing or invalid transferAmount.' };
  if (accumulated !== null && accumulated < 0) return { error: 'Invalid accumulated amount.' };
  if (!['in', 'out'].includes(transferType)) return { error: 'Invalid transferType.' };
  if (Buffer.byteLength(rawPayload || '', 'utf8') > MAX_RAW_PAYLOAD) return { error: 'Payload is too large.' };
  return {
    id,
    gateway: text(payload.gateway, 100) || 'UNKNOWN',
    transactionDate: text(payload.transactionDate, 32),
    accountNumber,
    subAccount: text(payload.subAccount, 250),
    paymentCode: text(payload.code, 250),
    content: text(payload.content, 1000),
    transferType,
    transferAmount,
    accumulated,
    description: text(payload.description, 2000),
    referenceCode: text(payload.referenceCode, 255),
    rawPayload: rawPayload || JSON.stringify(payload),
  };
}

function authValid(authorization) {
  const match = String(authorization || '').match(/^Apikey\s+(.+)$/i);
  return Boolean(match && safeEqualText(match[1].trim(), env.payment.sepayApiKey));
}

function ipAllowed(ip) {
  const allowlist = env.payment.sepayWebhookIps;
  return allowlist.length === 0 && !env.isProd || allowlist.some((allowed) => normalizeIp(allowed) === normalizeIp(ip));
}

function codeCandidates(tx) {
  const out = [];
  const prefix = env.payment.sepayContentPrefix;
  const suffix = env.payment.sepayContentSuffix;
  for (const source of [tx.paymentCode, tx.content]) {
    if (!source) continue;
    const value = String(source).trim();
    out.push(value);
    if (prefix && value.startsWith(prefix)) {
      let orderCode = value.slice(prefix.length);
      if (suffix && orderCode.endsWith(suffix)) orderCode = orderCode.slice(0, -suffix.length);
      if (orderCode) out.push(orderCode);
    }
  }
  return [...new Set(out.filter(Boolean))];
}

function paymentProviderCandidates() {
  // Production ch? x? l? payment Provider=SEPAY. Development h? tr? th?m MOCK
  // ?? QR ?? t?o tr??c migration v?n c? th? ???c x?c nh?n.
  if (env.isProd) return ['SEPAY'];
  return [...new Set([env.payment.sepayDbKey, 'SEPAY', 'MOCK'])];
}

async function findOrderAndPayment(t, tx) {
  let orderWithoutPayment = null;
  for (const provider of paymentProviderCandidates()) {
    for (const candidate of codeCandidates(tx)) {
      const order = await t.one(
        `SELECT o.OrderId AS orderId, o.OrderCode AS orderCode, o.UserId AS userId,
                o.Status AS orderStatus, p.PaymentId AS paymentId, p.PaymentRef AS paymentRef,
                p.Amount AS amount, p.Status AS paymentStatus, p.Provider AS provider
           FROM Orders o
           LEFT JOIN Payments p ON p.OrderId = o.OrderId AND p.Provider = :provider
          WHERE o.OrderCode = :candidate
          ORDER BY p.PaymentId DESC LIMIT 1`,
        { candidate, provider });
      if (order && order.paymentId) return order;
      if (order) orderWithoutPayment = order;
    }
  }
  // Fallback for content such as "NDTAM123 chuyen tien" when SePay does not populate code.
  if (tx.content) {
    for (const provider of paymentProviderCandidates()) {
      const order = await t.one(
        `SELECT o.OrderId AS orderId, o.OrderCode AS orderCode, o.UserId AS userId,
                o.Status AS orderStatus, p.PaymentId AS paymentId, p.PaymentRef AS paymentRef,
                p.Amount AS amount, p.Status AS paymentStatus, p.Provider AS provider
           FROM Orders o
           LEFT JOIN Payments p ON p.OrderId = o.OrderId AND p.Provider = :provider
          WHERE LOCATE(o.OrderCode, :content) > 0
          ORDER BY p.PaymentId DESC LIMIT 1`,
        { content: tx.content, provider });
      if (order && order.paymentId) return order;
      if (order) orderWithoutPayment = order;
    }
  }
  return orderWithoutPayment;
}

function resultJson() { return { success: true, message: 'Payment successful' }; }

async function handleSepayWebhook({ payload, rawPayload, authorization, ip }) {
  if (!authValid(authorization)) return { status: 401, json: { success: false }, outcome: 'INVALID_API_KEY' };
  if (!ipAllowed(ip)) return { status: 403, json: { success: false }, outcome: 'IP_NOT_ALLOWED' };

  const tx = payloadValues(payload, rawPayload);
  if (tx.error) return { status: 400, json: { success: false, error: tx.error }, outcome: 'INVALID_PAYLOAD' };

  let outcome = 'IGNORED';
  let paymentId = null;
  let paymentRef = null;
  let orderCode = null;
  try {
    const processed = await db.tx(async (t) => {
      const existing = await sepayTransactionModel.findById(t, tx.id);
      if (existing) return { outcome: existing.processingOutcome || 'DUPLICATE', duplicate: true };
      await sepayTransactionModel.insert(t, tx);

      if (env.payment.sepayAccountNumber && tx.accountNumber !== env.payment.sepayAccountNumber) {
        await sepayTransactionModel.markProcessed(t, tx.id, { outcome: 'ACCOUNT_MISMATCH' });
        return { outcome: 'ACCOUNT_MISMATCH' };
      }
      if (tx.transferType !== 'in') {
        await sepayTransactionModel.markProcessed(t, tx.id, { outcome: 'IGNORED_OUTGOING' });
        return { outcome: 'IGNORED_OUTGOING' };
      }

      const match = await findOrderAndPayment(t, tx);
      if (!match || !match.paymentId || !match.paymentRef) {
        await sepayTransactionModel.markProcessed(t, tx.id, { orderCode: match && match.orderCode, outcome: 'PAYMENT_NOT_FOUND' });
        return { outcome: 'PAYMENT_NOT_FOUND', orderCode: match && match.orderCode };
      }
      orderCode = match.orderCode;
      paymentId = match.paymentId;
      paymentRef = match.paymentRef;
      if (tx.transferAmount !== Number(match.amount)) {
        await sepayTransactionModel.markProcessed(t, tx.id, {
          orderCode: match.orderCode,
          paymentId: match.paymentId,
          outcome: 'AMOUNT_MISMATCH',
        });
        return { outcome: 'AMOUNT_MISMATCH', paymentId: match.paymentId, paymentRef: match.paymentRef, orderCode: match.orderCode };
      }
      // applyEventInTx ki?m tra l?i s? ti?n trong c?ng transaction tr??c khi PAID.
      const result = await applyEventInTx(t, {
        provider: match.provider,
        paymentRef: match.paymentRef,
        success: true,
        amount: tx.transferAmount,
        txnNo: tx.referenceCode || tx.id,
        responseCode: 'SEPAY',
      });
      await sepayTransactionModel.markProcessed(t, tx.id, {
        orderCode: result.orderCode || match.orderCode,
        paymentId: result.paymentId || match.paymentId,
        outcome: result.outcome,
      });
      return { outcome: result.outcome, paymentId: result.paymentId || match.paymentId, paymentRef: match.paymentRef, orderCode: result.orderCode || match.orderCode };
    });
    outcome = processed.outcome;
    paymentId = processed.paymentId || null;
    paymentRef = processed.paymentRef || paymentRef || null;
    orderCode = processed.orderCode || null;
  } catch (err) {
    if (db.isUniqueViolation(err)) {
      outcome = 'DUPLICATE';
    } else {
      logger.error('Lỗi xử lý webhook SePay:', err.stack || err);
      throw err;
    }
  }

  await paymentModel.logWebhook({
    provider: 'SEPAY',
    paymentRef,
    gatewayTxnNo: tx.referenceCode || tx.id,
    signatureValid: true,
    outcome,
    rawPayload: tx.rawPayload,
    sourceIp: ip,
  }).catch((err) => logger.warn('Không ghi được nhật ký webhook SePay:', err.message));

  return { status: 200, json: resultJson(), outcome, paymentId, orderCode };
}

module.exports = {
  handleSepayWebhook,
  payloadValues,
  normalizeIp,
  ipAllowed,
  authValid,
};
