'use strict';
/**
 * [UC06] VNPay sandbox.
 *   - Tạo URL thanh toán: các tham số vnp_* sắp theo tên, mã hóa URL, ký HMAC-SHA512 bằng Hash Secret.
 *   - IPN (GET) và trang quay về đều mang chữ ký vnp_SecureHash, kiểm tra bằng cách ký lại các tham số nhận được.
 *   - Mã phản hồi IPN theo quy ước VNPay: 00 thành công, 01 không thấy đơn, 02 đã xác nhận trước đó,
 *     04 sai số tiền, 97 sai chữ ký, 99 lỗi khác.
 * Cách ký được viết theo tài liệu VNPay mà tôi nắm được, chưa đối chiếu lại tài liệu hiện hành (xem utils/payment/signature.js).
 * IPN của VNPay chỉ gọi được địa chỉ công khai. Chạy trên localhost cần ngrok hoặc dùng scripts/simulate-ipn.js.
 */
const { vnpSignData, vnpSign, vnpVerify } = require('../../../utils/payment/signature');
const { vnTimestamp14 } = require('../../../utils/time');

/** VNPay cần IPv4. Địa chỉ IPv6 hoặc ::1 (localhost) đổi thành 127.0.0.1. */
function normalizeIp(ip) {
  let v = String(ip || '').trim();
  if (v.startsWith('::ffff:')) v = v.slice(7);
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(v) ? v : '127.0.0.1';
}

function createVnpayProvider(cfg) {
  return {
    key: 'vnpay',
    dbKey: 'VNPAY',
    label: 'VNPay (sandbox)',

    isConfigured: () => Boolean(cfg.tmnCode && cfg.hashSecret && cfg.url),

    async createCheckout({ paymentRef, amount, description, returnUrl, ipAddr, expiresAt }) {
      const now = new Date();
      const params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: cfg.tmnCode,
        vnp_Amount: String(amount * 100), // VNPay tính theo đơn vị nhỏ nhất, nhân 100
        vnp_CreateDate: vnTimestamp14(now),
        vnp_CurrCode: 'VND',
        vnp_IpAddr: normalizeIp(ipAddr),
        vnp_Locale: 'vn',
        vnp_OrderInfo: String(description || 'Thanh toan don hang').replace(/[^A-Za-z0-9 .:_-]/g, '').slice(0, 255),
        vnp_OrderType: 'other',
        vnp_ReturnUrl: returnUrl,
        vnp_TxnRef: String(paymentRef),
        vnp_ExpireDate: vnTimestamp14(expiresAt),
      };
      const url = `${cfg.url}?${vnpSignData(params)}&vnp_SecureHash=${vnpSign(params, cfg.hashSecret)}`;
      return { url, expiresAt };
    },

    /** query = tham số GET của IPN hoặc của trang quay về. */
    parseWebhook({ query }) {
      const q = query || {};
      const ref = typeof q.vnp_TxnRef === 'string' ? q.vnp_TxnRef.slice(0, 40) : null;
      if (!cfg.hashSecret || !vnpVerify(q, cfg.hashSecret)) return { signatureValid: false, paymentRef: ref };
      return {
        signatureValid: true,
        paymentRef: q.vnp_TxnRef,
        amount: Number(q.vnp_Amount) / 100,
        success: q.vnp_ResponseCode === '00' && q.vnp_TransactionStatus === '00',
        txnNo: q.vnp_TransactionNo ? String(q.vnp_TransactionNo) : null,
        responseCode: q.vnp_ResponseCode ? String(q.vnp_ResponseCode) : null,
        cancelled: q.vnp_ResponseCode === '24', // 24 = khách tự hủy giao dịch tại cổng
      };
    },

    /** Trang quay về của VNPay cũng có chữ ký nên dùng chung cách kiểm tra với IPN. */
    async resolveReturn({ query }) {
      const parsed = this.parseWebhook({ query });
      if (!parsed.signatureValid) return { signatureValid: false, paymentRef: parsed.paymentRef };
      return { signatureValid: true, paymentRef: parsed.paymentRef, cancelled: Boolean(parsed.cancelled), event: parsed };
    },

    ack({ signatureValid, outcome }) {
      const reply = (RspCode, Message) => ({ status: 200, json: { RspCode, Message } });
      if (!signatureValid) return reply('97', 'Invalid signature');
      switch (outcome) {
        case 'PAID':
        case 'PAID_ORDER_CLOSED':
        case 'FAILED':
        case 'IGNORED':
          return reply('00', 'Confirm Success');
        case 'DUPLICATE':
        case 'DUPLICATE_OTHER_TXN':
        case 'DOUBLE_PAYMENT':
          return reply('02', 'Order already confirmed');
        case 'PAYMENT_NOT_FOUND':
          return reply('01', 'Order not found');
        case 'AMOUNT_MISMATCH':
          return reply('04', 'Invalid amount');
        default:
          return reply('99', 'Unknown error');
      }
    },
  };
}

module.exports = { createVnpayProvider, normalizeIp };
