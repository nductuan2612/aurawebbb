'use strict';
/** Danh sĂ¡ch cá»•ng thanh toĂ¡n vĂ  cá»•ng Ä‘ang dĂ¹ng (chá»n báº±ng PAYMENT_PROVIDER trong .env). */
const env = require('../../config/env');
const { createMockProvider } = require('./providers/mock');
const { createPayosProvider } = require('./providers/payos');
const { createVnpayProvider } = require('./providers/vnpay');
const { createSepayProvider } = require('./providers/sepay');

const providers = Object.freeze({
  mock: createMockProvider({ secret: env.payment.mockSecret }),
  payos: createPayosProvider(env.payment.payos),
  vnpay: createVnpayProvider(env.payment.vnpay),
  sepay: createSepayProvider({
    qrUrl: env.payment.sepayQrUrl,
    accountNumber: env.payment.sepayAccountNumber,
    bankName: env.payment.sepayBankName,
    accountName: env.payment.sepayAccountName,
    dbKey: env.payment.sepayDbKey,
  }),
});

function active() {
  return providers[env.payment.provider];
}

function get(key) {
  return Object.prototype.hasOwnProperty.call(providers, key) ? providers[key] : null;
}

module.exports = { active, get };

