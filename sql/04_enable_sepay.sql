-- ============================================================================
-- AURA MODA - Bật cổng thanh toán SePay cho database đã tạo từ schema cũ
-- Chạy SAU sql/01_schema.sql khi bảng Payments đã tồn tại.
--
-- Lý do cần file riêng: CREATE TABLE IF NOT EXISTS không cập nhật CHECK constraint
-- của bảng đã tồn tại, vì vậy chạy lại 01_schema.sql vẫn giữ constraint cũ.
--
-- Database hiện tại của dự án là MariaDB 10.4.x:
--   chạy nguyên file này bằng tài khoản có quyền ALTER (ví dụ root).
-- Với MySQL 8.x, thay câu DROP CONSTRAINT bằng:
--   ALTER TABLE Payments DROP CHECK CK_Payments_Provider;
-- ============================================================================

USE ivy_moda_shop;

ALTER TABLE Payments
  DROP CONSTRAINT CK_Payments_Provider;

ALTER TABLE Payments
  ADD CONSTRAINT CK_Payments_Provider
  CHECK (Provider IN ('COD', 'PAYOS', 'VNPAY', 'MOCK', 'SEPAY'));

-- Kiểm tra sau khi chạy:
-- SHOW CREATE TABLE Payments;
-- Phần CK_Payments_Provider phải có thêm 'SEPAY'.
