'use strict';
/**
 * Äá»c vĂ  kiá»ƒm tra biáº¿n mĂ´i trÆ°á»ng (file .env). Má»i cáº¥u hĂ¬nh cá»§a á»©ng dá»¥ng Ä‘i qua file nĂ y.
 * Thiáº¿u cáº¥u hĂ¬nh báº¯t buá»™c khi cháº¡y production sáº½ dá»«ng á»©ng dá»¥ng ngay, khĂ´ng cháº¡y vá»›i giĂ¡ trá»‹ yáº¿u.
 */
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const warnings = [];

function str(name, def = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? def : String(v).trim();
}

function bool(name, def = false) {
  const v = str(name, '');
  if (v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(name, def) {
  const v = str(name, '');
  if (v === '') return def;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) {
    warnings.push(`Biáº¿n ${name} pháº£i lĂ  sá»‘ nguyĂªn, Ä‘ang dĂ¹ng giĂ¡ trá»‹ máº·c Ä‘á»‹nh ${def}.`);
    return def;
  }
  return n;
}

const nodeEnv = str('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';

let sessionSecret = str('SESSION_SECRET');
if (sessionSecret.length < 32) {
  if (isProd) throw new Error('SESSION_SECRET pháº£i cĂ³ Ă­t nháº¥t 32 kĂ½ tá»± khi cháº¡y production.');
  warnings.push('SESSION_SECRET chÆ°a Ä‘áº·t hoáº·c quĂ¡ ngáº¯n. Äang dĂ¹ng khĂ³a táº¡m ngáº«u nhiĂªn, phiĂªn Ä‘Äƒng nháº­p sáº½ máº¥t má»—i khi khá»Ÿi Ä‘á»™ng láº¡i server.');
  sessionSecret = crypto.randomBytes(32).toString('hex');
}

const provider = str('PAYMENT_PROVIDER', 'mock').toLowerCase();
if (!['mock', 'payos', 'vnpay', 'sepay'].includes(provider)) {
  throw new Error(`PAYMENT_PROVIDER="${provider}" khĂ´ng há»£p lá»‡. Chá»n má»™t trong: mock, payos, vnpay, sepay.`);
}
if (isProd && provider === 'mock') {
  throw new Error('KhĂ´ng Ä‘Æ°á»£c dĂ¹ng cá»•ng thanh toĂ¡n giáº£ láº­p (PAYMENT_PROVIDER=mock) khi cháº¡y production.');
}

const sepayApiKey = str('SEPAY_API_KEY');
const sepayWebhookIps = str('SEPAY_WEBHOOK_IPS')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
if (provider === 'sepay' && isProd) {
  if (!sepayApiKey) throw new Error('SEPAY_API_KEY is required when PAYMENT_PROVIDER=sepay in production.');
  if (!sepayWebhookIps.length) warnings.push('SEPAY_WEBHOOK_IPS is empty in production; webhook requests will be rejected.');
}

let mockSecret = str('MOCK_GATEWAY_SECRET');
if (!mockSecret) mockSecret = 'dev-only-mock-secret-khong-dung-o-production';

const port = int('PORT', 3000);
const appBaseUrl = str('APP_BASE_URL', `http://localhost:${port}`).replace(/\/+$/, '');

module.exports = Object.freeze({
  nodeEnv,
  isProd,
  port,
  appBaseUrl,
  sessionSecret,
  cookieSecure: bool('COOKIE_SECURE', false),
  trustProxy: int('TRUST_PROXY', 0),
  // MySQL khĂ´ng cĂ³ khĂ¡i niá»‡m "named instance" hay Windows Authentication nhÆ° SQL Server:
  // luĂ´n káº¿t ná»‘i báº±ng host:port vĂ  tĂ i khoáº£n ngÆ°á»i dĂ¹ng MySQL.
  db: Object.freeze({
    host: str('DB_HOST', 'localhost'),
    port: int('DB_PORT', 3306),
    name: str('DB_NAME', 'ivy_moda_shop'),
    user: str('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    ssl: bool('DB_SSL', false),
  }),
  payment: Object.freeze({
    provider,
    mockSecret,
    sepayQrUrl: str('SEPAY_QR_URL', 'https://qr.sepay.vn/img'),
    sepayAccountNumber: str('SEPAY_ACCOUNT_NUMBER'),
    sepayBankName: str('SEPAY_BANK_NAME'),
    sepayAccountName: str('SEPAY_ACCOUNT_NAME'),
    sepayContentPrefix: str('SEPAY_CONTENT_PREFIX', 'HD36-'),
    sepayContentSuffix: str('SEPAY_CONTENT_SUFFIX'),
    sepayApiKey,
    sepayWebhookPath: str('SEPAY_WEBHOOK_PATH', '/webhook/sepay'),
    sepayWebhookIps,
    // Tạo QR SePay thật, nhưng ở development có thể lưu giao dịch bằng provider MOCK
    // để test ngay cả khi database cũ chưa được ALTER thêm SEPAY.
    sepayDbKey: str('SEPAY_DB_PROVIDER', isProd ? 'SEPAY' : 'MOCK').toUpperCase(),
    payos: Object.freeze({
      apiUrl: str('PAYOS_API_URL', 'https://api-merchant.payos.vn').replace(/\/+$/, ''),
      clientId: str('PAYOS_CLIENT_ID'),
      apiKey: str('PAYOS_API_KEY'),
      checksumKey: str('PAYOS_CHECKSUM_KEY'),
    }),
    vnpay: Object.freeze({
      url: str('VNP_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
      tmnCode: str('VNP_TMN_CODE'),
      hashSecret: str('VNP_HASH_SECRET'),
    }),
  }),
  warnings,
});

