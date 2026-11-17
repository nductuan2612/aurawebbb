'use strict';
/**
 * [UC06] Cổng thanh toán GIẢ LẬP dùng để demo và kiểm thử khi chưa có tài khoản cổng thật.
 * Vẫn đi qua đúng quy trình của cổng thật: thông báo được KÝ (HMAC-SHA256), server KIỂM TRA CHỮ KÝ,
 * rồi mới xử lý, và xử lý thông báo lặp (idempotency). Bị chặn khi NODE_ENV=production (xem config/env.js).
 */
const { mockSign, mockVerify } = require('../../../utils/payment/signature');

const TTL_MS = 15 * 60 * 1000;

function createMockProvider(cfg) {
  const secret = cfg.secret;
  return {
    key: 'mock',
    dbKey: 'MOCK',
    label: 'Cổng giả lập (chỉ để demo)',

    isConfigured: () => Boolean(secret),

    async createCheckout({ paymentRef }) {
      return { url: `/payment/mock/${encodeURIComponent(paymentRef)}`, expiresAt: new Date(Date.now() + TTL_MS) };
    },

    /**
     * Tạo thông báo (đã ký) mô phỏng cổng gửi về.
     *   success     : thanh toán thành công
     *   fail        : thanh toán thất bại
     *   wrongamount : chữ ký đúng nhưng số tiền sai
     *   tamper      : sửa số tiền SAU khi ký, nên chữ ký không còn khớp
     */
    buildEvent({ paymentRef, amount, action }) {
      const ok = action !== 'fail';
      const payload = {
        paymentRef: String(paymentRef),
        amount: action === 'wrongamount' ? Number(amount) - 1000 : Number(amount),
        status: ok ? 'SUCCESS' : 'FAILED',
        transactionNo: `MOCK-${paymentRef}`,
        responseCode: ok ? '00' : '51',
      };
      payload.signature = mockSign(payload, secret);
      if (action === 'tamper') payload.amount = 1;
      return payload;
    },

    /** body là JSON đã parse. Chỉ coi là hợp lệ khi chữ ký khớp. */
    parseWebhook({ body }) {
      const ref = body && typeof body.paymentRef === 'string' ? body.paymentRef.slice(0, 40) : null;
      if (!secret || !mockVerify(body, secret)) return { signatureValid: false, paymentRef: ref };
      return {
        signatureValid: true,
        paymentRef: String(body.paymentRef),
        amount: Number(body.amount),
        success: body.status === 'SUCCESS' && String(body.responseCode) === '00',
        txnNo: body.transactionNo ? String(body.transactionNo) : null,
        responseCode: body.responseCode !== undefined ? String(body.responseCode) : null,
      };
    },

    async resolveReturn() {
      return { signatureValid: false }; // cổng giả lập hoàn tất ngay trên trang giả lập, không có trang quay về riêng
    },

    ack({ signatureValid, outcome }) {
      return { status: signatureValid ? 200 : 400, json: { ok: Boolean(signatureValid), outcome } };
    },
  };
}

module.exports = { createMockProvider };
