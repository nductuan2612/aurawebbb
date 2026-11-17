'use strict';
/**
 * [UC06] payOS: nhận tiền chuyển khoản vào tài khoản ngân hàng đã liên kết trong payOS (ví dụ MB Bank).
 *
 * CẢNH BÁO: phần giao tiếp với payOS (địa chỉ API, tên trường, cách ký) được viết theo hiểu biết của tôi về
 * tài liệu payOS, KHÔNG được đối chiếu lại với tài liệu hiện hành khi viết (không truy cập được trang của họ).
 * Hãy đối chiếu với tài liệu payOS mới nhất trước khi dùng cho tài khoản thật. Mọi điểm cần kiểm tra nằm trong file này.
 *
 *   - Tạo link thanh toán : POST {apiUrl}/v2/payment-requests, header x-client-id và x-api-key,
 *                           chữ ký HMAC-SHA256 (Checksum Key) trên amount, cancelUrl, description, orderCode, returnUrl.
 *   - Webhook             : POST JSON { code, desc, success, data, signature }, signature = HMAC-SHA256 của khối data.
 *   - Trang quay về       : query KHÔNG có chữ ký, nên không tin; gọi lại API tra cứu trạng thái rồi mới ghi nhận.
 * Tôi chưa kiểm chứng payOS có môi trường thử nghiệm riêng hay không. Nếu không có, thanh toán là tiền thật, hãy thử với số tiền nhỏ.
 */
const { payosSignCreate, payosVerifyWebhook } = require('../../../utils/payment/signature');
const { BusinessError } = require('../../../utils/errors');
const logger = require('../../../utils/logger');

const TIMEOUT_MS = 15000;

function createPayosProvider(cfg, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;

  async function call(method, path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${cfg.apiUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-client-id': cfg.clientId, 'x-api-key': cfg.apiKey },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => null);
      return { httpOk: Boolean(res.ok), json };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Tra cứu trạng thái link thanh toán. Trả về null nếu không đọc được. */
  async function fetchStatus(paymentRef) {
    const { httpOk, json } = await call('GET', `/v2/payment-requests/${encodeURIComponent(paymentRef)}`);
    if (!httpOk || !json || json.code !== '00' || !json.data) return null;
    const d = json.data;
    const tx = Array.isArray(d.transactions) && d.transactions.length ? d.transactions[0] : null;
    return {
      status: String(d.status || ''),
      amount: Number(d.amount),
      txnNo: tx && tx.reference ? String(tx.reference) : (d.id ? String(d.id) : null),
    };
  }

  return {
    key: 'payos',
    dbKey: 'PAYOS',
    label: 'payOS (chuyển khoản ngân hàng)',

    isConfigured: () => Boolean(cfg.clientId && cfg.apiKey && cfg.checksumKey),

    async createCheckout({ paymentRef, amount, description, returnUrl, cancelUrl, expiresAt }) {
      const orderCode = Number(paymentRef);
      if (!Number.isSafeInteger(orderCode) || orderCode <= 0) throw new Error('paymentRef không phải số nguyên hợp lệ');
      const desc = String(description || '').slice(0, 25); // payOS giới hạn độ dài mô tả
      const body = {
        orderCode,
        amount,
        description: desc,
        items: [{ name: desc || 'Don hang', quantity: 1, price: amount }],
        cancelUrl,
        returnUrl,
        expiredAt: Math.floor(expiresAt.getTime() / 1000),
      };
      body.signature = payosSignCreate({ amount, cancelUrl, description: desc, orderCode, returnUrl }, cfg.checksumKey);

      const { httpOk, json } = await call('POST', '/v2/payment-requests', body);
      const url = json && json.data && json.data.checkoutUrl;
      if (!httpOk || !json || json.code !== '00' || typeof url !== 'string' || !url.startsWith('https://')) {
        logger.warn('payOS từ chối tạo link thanh toán:', json && json.code, json && json.desc);
        throw new BusinessError('Không tạo được link thanh toán payOS. Vui lòng thử lại sau hoặc chọn thanh toán khi nhận hàng.', { code: 'GATEWAY_ERROR' });
      }
      return { url, expiresAt };
    },

    /** body = JSON webhook. Hợp lệ khi chữ ký trên khối data khớp Checksum Key. */
    parseWebhook({ body }) {
      const ref = body && body.data && body.data.orderCode !== undefined && body.data.orderCode !== null
        ? String(body.data.orderCode).slice(0, 40) : null;
      if (!cfg.checksumKey || !payosVerifyWebhook(body, cfg.checksumKey)) return { signatureValid: false, paymentRef: ref };
      const d = body.data;
      return {
        signatureValid: true,
        paymentRef: String(d.orderCode),
        amount: Number(d.amount),
        success: body.code === '00' && d.code === '00',
        txnNo: d.reference ? String(d.reference) : (d.paymentLinkId ? String(d.paymentLinkId) : null),
        responseCode: d.code !== undefined ? String(d.code) : null,
      };
    },

    /** Trang quay về của payOS không có chữ ký, nên hỏi lại API (kết nối bảo mật bằng khóa của bạn) rồi mới tin. */
    async resolveReturn({ query }) {
      const ref = query && typeof query.orderCode === 'string' && /^\d{1,19}$/.test(query.orderCode) ? query.orderCode : null;
      if (!ref) return { signatureValid: false };
      let st = null;
      try {
        st = await fetchStatus(ref);
      } catch (err) {
        logger.warn('Không tra cứu được trạng thái payOS:', err.message);
      }
      if (st && st.status === 'PAID') {
        return {
          signatureValid: true, paymentRef: ref, cancelled: false,
          event: { signatureValid: true, paymentRef: ref, amount: st.amount, success: true, txnNo: st.txnNo, responseCode: '00' },
        };
      }
      const cancelled = query.cancel === 'true' || query.status === 'CANCELLED' || (st && (st.status === 'CANCELLED' || st.status === 'EXPIRED'));
      return { signatureValid: true, paymentRef: ref, cancelled: Boolean(cancelled), event: null };
    },

    ack({ signatureValid }) {
      return signatureValid
        ? { status: 200, json: { error: 0, message: 'ok', data: null, success: true } }
        : { status: 400, json: { error: 1, message: 'invalid signature', data: null, success: false } };
    },

    fetchStatus,
  };
}

module.exports = { createPayosProvider };
