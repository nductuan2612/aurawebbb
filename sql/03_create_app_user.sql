-- ============================================================================
-- AURA MODA - Tạo tài khoản MySQL riêng cho ứng dụng (khuyến nghị)
-- File    : 03_create_app_user.sql   (chạy SAU 01_schema.sql)
-- Mục đích: ứng dụng chỉ cần đọc và ghi dữ liệu, không cần quyền root hay quyền sửa cấu trúc bảng.
--           Tài khoản ivy_app chỉ có quyền SELECT, INSERT, UPDATE, DELETE trên CSDL ivy_moda_shop.
-- Cách dùng: 1) Đổi giá trị mật khẩu bên dưới (chữ 'DAT_MAT_KHAU_MANH_O_DAY') thành mật khẩu
--               mạnh của riêng bạn (tối thiểu 12 ký tự).
--            2) Chạy file này bằng MySQL Workbench hoặc dòng lệnh:
--               mysql -u root -p < 03_create_app_user.sql
--            3) Điền DB_USER=ivy_app và DB_PASSWORD=<mật khẩu đó> vào file .env.
-- Lưu ý   : 'ivy_app'@'%' cho phép kết nối từ mọi địa chỉ (phù hợp khi ứng dụng và MySQL
--           chạy trên cùng máy, hoặc trong môi trường học tập). Nếu muốn chặt chẽ hơn, đổi
--           '%' thành 'localhost' khi ứng dụng luôn chạy cùng máy với MySQL.
-- ============================================================================

CREATE USER IF NOT EXISTS 'ivy_app'@'%' IDENTIFIED BY 'DAT_MAT_KHAU_MANH_O_DAY';

GRANT SELECT, INSERT, UPDATE, DELETE ON ivy_moda_shop.* TO 'ivy_app'@'%';

-- EXECUTE cần cho trigger TR_Reviews_OnlyDeliveredOrders (trigger chạy với quyền của người tạo bảng,
-- nhưng một số bản MySQL/MariaDB vẫn yêu cầu EXECUTE trên CSDL để trigger kích hoạt được qua tài khoản này).
GRANT EXECUTE ON ivy_moda_shop.* TO 'ivy_app'@'%';

FLUSH PRIVILEGES;

SELECT 'Hoàn tất: ivy_app có quyền đọc và ghi dữ liệu trên ivy_moda_shop.' AS Thongbao;
