'use strict';
/**
 * [UC06] Ký và KIỂM TRA CHỮ KÝ (checksum) cho thông báo thanh toán IPN/webhook.
 * Toàn bộ là hàm thuần để kiểm thử bằng unit test.
 *
 *   - mock  : HMAC-SHA256 trên các trường sắp xếp theo tên (cổng giả lập nội bộ để demo).
 *   - payOS : HMAC-SHA256 với Checksum Key. Dữ liệu ký là chuỗi key=value nối bằng "&" theo thứ tự chữ cái.
 *   - VNPay : HMAC-SHA512 với Hash Secret trên các tham số vnp_* đã sắp xếp và mã hóa URL.
 *
 * LƯU Ý: cách ký của payOS và VNPay dưới đây được viết theo tài liệu/SDK mà tôi nắm được,
 * KHÔNG được đối chiếu lại với tài liệu hiện hành trong lúc viết (không truy cập được trang của họ).
 * Trước khi dùng với tài khoản thật, hãy đối chiếu với tài liệu mới nhất (xem README, mục "Cổng thanh toán").
 */
const crypto = require('crypto');

const hmacHex = (algo, key, data) => crypto.createHmac(algo, String(key)).update(String(data), 'utf8').digest('hex');

/** So sánh chuỗi hex không phân biệt hoa thường, trong thời gian không đổi. */
function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || '').toLowerCase(), 'utf8');
  const y = Buffer.from(String(b || '').toLowerCase(), 'utf8');
  if (x.length !== y.length || x.length === 0) return false;
  return crypto.timingSafeEqual(x, y);
}

/* ------------------------------------------------------------------ mock */

function mockCanonical(obj) {
  return Object.keys(obj)
    .filter((k) => k !== 'signature')
    .sort()
    .map((k) => `${k}=${obj[k] === null || obj[k] === undefined ? '' : obj[k]}`)
    .join('&');
}

function mockSign(obj, secret) {
  return hmacHex('sha256', secret, mockCanonical(obj));
}

function mockVerify(obj, secret) {
  if (!obj || typeof obj !== 'object' || typeof obj.signature !== 'string') return false;
  return safeEqualHex(mockSign(obj, secret), obj.signature);
}

/* ------------------------------------------------------------------ payOS */

function sortObjectByKey(o) {
  return Object.keys(o).sort().reduce((acc, k) => {
    acc[k] = o[k];
    return acc;
  }, {});
}

/** key=value nối bằng "&", khóa sắp theo chữ cái, null/undefined thành chuỗi rỗng. */
function payosQueryString(data) {
  return Object.keys(data)
    .sort()
    .filter((k) => data[k] !== undefined)
    .map((k) => {
      let v = data[k];
      if (Array.isArray(v)) {
        v = JSON.stringify(v.map((item) => (item && typeof item === 'object' ? sortObjectByKey(item) : item)));
      }
      if (v === null || v === undefined || v === 'null' || v === 'undefined') v = '';
      return `${k}=${v}`;
    })
    .join('&');
}

/** Chữ ký khi tạo link thanh toán: ký trên 5 trường cố định theo thứ tự chữ cái. */
function payosSignCreate({ amount, cancelUrl, description, orderCode, returnUrl }, checksumKey) {
  const data = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  return hmacHex('sha256', checksumKey, data);
}

/** Chữ ký của khối "data" trong webhook. */
function payosSignData(data, checksumKey) {
  return hmacHex('sha256', checksumKey, payosQueryString(data));
}

/** Kiểm tra webhook payOS: body = { code, desc, success, data, signature }. */
function payosVerifyWebhook(body, checksumKey) {
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object' || typeof body.signature !== 'string') {
    return false;
  }
  return safeEqualHex(payosSignData(body.data, checksumKey), body.signature);
}

/* ------------------------------------------------------------------ VNPay */

/** Mã hóa giá trị như ví dụ chính thức của VNPay: encodeURIComponent rồi đổi %20 thành "+". */
function vnpEncode(v) {
  return encodeURIComponent(String(v)).replace(/%20/g, '+');
}

/** Chuỗi dữ liệu để ký: các tham số đã sắp theo tên, dạng key=value mã hóa, nối bằng "&". */
function vnpSignData(params) {
  return Object.keys(params)
    .filter((k) => k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType')
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${vnpEncode(params[k])}`)
    .join('&');
}

function vnpSign(params, hashSecret) {
  return hmacHex('sha512', hashSecret, vnpSignData(params));
}

/** Kiểm tra tham số VNPay gửi về (query của return URL hoặc IPN). Giá trị lặp (mảng) bị từ chối. */
function vnpVerify(query, hashSecret) {
  if (!query || typeof query !== 'object') return false;
  const received = query.vnp_SecureHash;
  if (typeof received !== 'string' || received.length === 0) return false;
  const params = {};
  for (const [k, v] of Object.entries(query)) {
    if (!k.startsWith('vnp_')) continue;
    if (typeof v !== 'string') return false;
    params[k] = v;
  }
  return safeEqualHex(vnpSign(params, hashSecret), received);
}

module.exports = {
  safeEqualHex,
  mockCanonical, mockSign, mockVerify,
  payosQueryString, payosSignCreate, payosSignData, payosVerifyWebhook,
  vnpEncode, vnpSignData, vnpSign, vnpVerify,
};
