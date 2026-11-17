'use strict';

const db = require('../config/db');

function transactionColumns() {
  return `SepayTransactionId AS id, Gateway AS gateway, TransactionDate AS transactionDate,
          AccountNumber AS accountNumber, SubAccount AS subAccount, PaymentCode AS paymentCode,
          Content AS content, TransferType AS transferType, TransferAmount AS transferAmount,
          Accumulated AS accumulated, Description AS description, ReferenceCode AS referenceCode,
          MatchedOrderCode AS matchedOrderCode, MatchedPaymentId AS matchedPaymentId,
          ProcessingOutcome AS processingOutcome, RawPayload AS rawPayload,
          ReceivedAt AS receivedAt, ProcessedAt AS processedAt`;
}

async function findById(t, id) {
  return t.one(`SELECT ${transactionColumns()} FROM SepayTransactions WHERE SepayTransactionId = :id FOR UPDATE`, { id });
}

async function insert(t, tx) {
  await t.query(
    `INSERT INTO SepayTransactions
      (SepayTransactionId, Gateway, TransactionDate, AccountNumber, SubAccount,
       PaymentCode, Content, TransferType, TransferAmount, Accumulated, Description,
       ReferenceCode, RawPayload)
     VALUES
      (:id, :gateway, :transactionDate, :accountNumber, :subAccount,
       :paymentCode, :content, :transferType, :transferAmount, :accumulated, :description,
       :referenceCode, :rawPayload)`,
    {
      id: tx.id,
      gateway: tx.gateway,
      transactionDate: tx.transactionDate || null,
      accountNumber: tx.accountNumber,
      subAccount: tx.subAccount || null,
      paymentCode: tx.paymentCode || null,
      content: tx.content || null,
      transferType: tx.transferType,
      transferAmount: tx.transferAmount,
      accumulated: tx.accumulated === null || tx.accumulated === undefined ? null : tx.accumulated,
      description: tx.description || null,
      referenceCode: tx.referenceCode || null,
      rawPayload: tx.rawPayload,
    });
}

async function markProcessed(t, id, values) {
  await t.query(
    `UPDATE SepayTransactions
        SET MatchedOrderCode = :orderCode,
            MatchedPaymentId = :paymentId,
            ProcessingOutcome = :outcome,
            ProcessedAt = UTC_TIMESTAMP()
      WHERE SepayTransactionId = :id`,
    {
      id,
      orderCode: values.orderCode || null,
      paymentId: values.paymentId || null,
      outcome: String(values.outcome || 'IGNORED').slice(0, 40),
    });
}

async function recent(limit = 100) {
  return (await db.query(`SELECT ${transactionColumns()} FROM SepayTransactions ORDER BY ReceivedAt DESC, SepayTransactionId DESC LIMIT ${Math.max(1, Math.min(500, Number(limit) || 100))}`)).rows;
}

module.exports = { findById, insert, markProcessed, recent };
