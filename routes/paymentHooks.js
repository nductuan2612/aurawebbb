'use strict';
/**
 * Endpoint IPN/webhook của các cổng thanh toán. Webhook SePay được đặt trước
 * session/CSRF và nhận raw body để lưu audit payload nguyên gốc.
 */
const express = require('express');
const querystring = require('node:querystring');
const ah = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const paymentSvc = require('../services/paymentService');
const sepayWebhookSvc = require('../services/sepayWebhookService');
const env = require('../config/env');

const router = express.Router();
const jsonBody = express.json({ type: () => true, limit: '64kb' });
const sepayRawBody = express.raw({ type: '*/*', limit: '128kb' });

function send(res, result) {
  res.status(result.status).json(result.json);
}

function parseSepayBody(req) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('', 'utf8');
  const text = raw.toString('utf8');
  const type = String(req.get('content-type') || '').toLowerCase();
  if (!text) return { payload: {}, rawPayload: text };
  if (type.includes('application/x-www-form-urlencoded')) return { payload: querystring.parse(text), rawPayload: text };
  try { return { payload: JSON.parse(text), rawPayload: text }; } catch (_) { return { payload: null, rawPayload: text }; }
}

/** SePay y?u c?u tr? HTTP 200/201 v? JSON khi ?? nh?n webhook. */
async function receiveSepayWebhook(req, res) {
  res.set('X-Aura-Webhook', 'sepay-v4');
  const parsed = parseSepayBody(req);
  const result = await sepayWebhookSvc.handleSepayWebhook({
    payload: parsed.payload,
    rawPayload: parsed.rawPayload,
    authorization: req.get('authorization'),
    ip: req.ip,
  });
  send(res, result);
}

// URL khuy?n ngh?: /webhook/sepay. Gi? th?m POST / ?? t??ng th?ch c?u h?nh
// SePay/ngrok hi?n t?i c?a d? ?n ?ang tr? v?o domain root.
router.post([env.payment.sepayWebhookPath, '/', ''], sepayRawBody, ah(receiveSepayWebhook));

/** payOS và cổng giả lập gọi bằng POST JSON. */
router.post('/payment/:provider/ipn', jsonBody, ah(async (req, res) => {
  const provider = String(req.params.provider).slice(0, 20);
  send(res, await paymentSvc.handleWebhook(provider, { body: req.body, query: req.query, ip: req.ip }));
}));

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  const status = err && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) logger.error('Lỗi khi xử lý webhook thanh toán:', err && err.stack ? err.stack : err);
  res.status(status).json({ ok: false });
});

module.exports = router;
