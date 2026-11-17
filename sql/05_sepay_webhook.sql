-- ============================================================================
-- AURA MODA - T?o b?ng l?u giao d?ch webhook SePay
-- Ch?y b?ng t?i kho?n c? quy?n CREATE (v? d? root), sau sql/01_schema.sql.
-- ============================================================================
USE duytrans_ndt; -- ivy_moda_shop

CREATE TABLE IF NOT EXISTS SepayTransactions (
    SepayTransactionId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    Gateway            VARCHAR(100) NOT NULL,
    TransactionDate    VARCHAR(32)  NULL,
    AccountNumber      VARCHAR(100) NOT NULL,
    SubAccount         VARCHAR(250) NULL,
    PaymentCode        VARCHAR(250) NULL,
    Content            TEXT         NULL,
    TransferType       VARCHAR(10)  NOT NULL,
    TransferAmount     BIGINT       NOT NULL DEFAULT 0,
    Accumulated        BIGINT       NULL,
    Description        TEXT         NULL,
    ReferenceCode      VARCHAR(255) NULL,
    MatchedOrderCode   VARCHAR(30)  NULL,
    MatchedPaymentId   INT UNSIGNED NULL,
    ProcessingOutcome  VARCHAR(40)  NULL,
    RawPayload         MEDIUMTEXT   NOT NULL,
    ReceivedAt         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ProcessedAt        DATETIME     NULL,
    KEY IX_SepayTransactions_Code (PaymentCode),
    KEY IX_SepayTransactions_Reference (ReferenceCode),
    KEY IX_SepayTransactions_AccountDate (AccountNumber, TransactionDate),
    KEY IX_SepayTransactions_Payment (MatchedPaymentId)
) ENGINE=InnoDB;

SELECT '?? t?o b?ng SepayTransactions.' AS Thongbao;
