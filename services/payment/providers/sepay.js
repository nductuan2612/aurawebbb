'use strict';

/**
 * SePay trong b?n SQL Server tham chi?u d?ng VietQR th? c?ng:
 * website t?o ?nh QR ch?a s? ti?n v? n?i dung chuy?n kho?n;
 * tr?ng th?i thanh to?n ???c SePay/nh?n vi?n ??i so?t b?n ngo?i c?p nh?t.
 * B?n tham chi?u kh?ng c? webhook SePay n?n kh?ng t? ??nh d?u PAID t?i ??y.
 */
function createSepayProvider(cfg) {
  return {
    key: 'sepay',
    dbKey: cfg.dbKey || 'SEPAY',
    label: 'SePay VietQR',
    isConfigured: () => Boolean(cfg.qrUrl && cfg.accountNumber && cfg.bankName && cfg.accountName),
  };
}

module.exports = { createSepayProvider };

