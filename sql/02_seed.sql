-- ============================================================================
-- AURA MODA - Dữ liệu mẫu (Tương thích MySQL 5.7+ & MariaDB / XAMPP / Laragon)
-- File    : 02_seed.sql   (chạy SAU 01_schema.sql)
-- ============================================================================
USE duytrans_ndt; -- ivy_moda_shop

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_seed_demo_data$$

CREATE PROCEDURE sp_seed_demo_data()
BEGIN
    DECLARE v_admin_exists INT DEFAULT 0;
    DECLARE v_admin_id INT UNSIGNED;
    DECLARE v_now DATETIME DEFAULT UTC_TIMESTAMP();

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SELECT COUNT(*) INTO v_admin_exists FROM Users WHERE Email = 'admin@example.com';

    IF v_admin_exists > 0 THEN
        SELECT 'Dữ liệu mẫu đã tồn tại (có tài khoản admin@example.com). Bỏ qua, không nạp lại.' AS Thongbao;
    ELSE
        START TRANSACTION;

        -- 1. [UC01] Tài khoản
        INSERT INTO Users (Email, PasswordHash, FullName, Phone, DateOfBirth, Role, IsActive, ConsentGivenAt, ConsentVersion)
        VALUES
          ('admin@example.com', '$2b$12$fCeO1jG8FdRFicnEu0pS2u2/Zfg6nhIYygpsy6CiiK.YC3fmQFpHO', 'Quản trị viên', '0900000001', NULL, 'ADMIN', 1, v_now, 'v1'),
          ('ha.nguyen@example.com', '$2b$12$0HfJoaEbEDb9.jyE5E61VO6ItTUFa53ZwfxPW44K.vM4accB96f6W', 'Nguyễn Thu Hà', '0912345678', '1998-05-14', 'CUSTOMER', 1, v_now, 'v1'),
          ('an.tran@example.com', '$2b$12$YNkhQ5nMwnaU.JOLnpMcR.nLXlcuuTTtzz9M9SEC/yWoez.d1pvey', 'Trần Minh An', '0987654321', '1996-11-02', 'CUSTOMER', 1, v_now, 'v1'),
          ('mai.le@example.com', '$2b$12$4.ghBpjb9rCAdICOFLnqtulTHARPsumX4PWimrxcAS5fWI4JMzt2e', 'Lê Ngọc Mai', '0933333333', NULL, 'CUSTOMER', 1, v_now, 'v1');

        SELECT UserId INTO v_admin_id FROM Users WHERE Email = 'admin@example.com';

        -- 2. [UC01] Sổ địa chỉ giao hàng
        INSERT INTO Addresses (UserId, RecipientName, Phone, Province, District, Ward, StreetAddress, IsDefault)
        VALUES
          ((SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Mẫu', 'Số 12 ngõ 34 đường Mẫu', 1),
          ((SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Ví Dụ', 'Tầng 5 tòa nhà Ví Dụ, đường Mẫu', 0),
          ((SELECT UserId FROM Users WHERE Email = 'an.tran@example.com'), 'Trần Minh An', '0987654321', 'TP. Hồ Chí Minh', NULL, 'Phường Mẫu', '45 đường Ví Dụ', 1);

        -- 3. Danh mục gốc
        INSERT INTO Categories (ParentId, Name, Slug, Description, SortOrder)
        VALUES
          (NULL, 'Nữ', 'nu', 'Thời trang nữ', 1),
          (NULL, 'Nam', 'nam', 'Thời trang nam', 2);

        -- Danh mục con (Dùng biến để tránh lỗi tự tham chiếu bảng Categories trên MySQL 5.7)
        SET @cat_nu = (SELECT CategoryId FROM Categories WHERE Slug = 'nu');
        SET @cat_nam = (SELECT CategoryId FROM Categories WHERE Slug = 'nam');

        INSERT INTO Categories (ParentId, Name, Slug, Description, SortOrder)
        VALUES
          (@cat_nu, 'Áo', 'ao-nu', 'Áo thun, sơ mi, áo kiểu và áo len nữ', 1),
          (@cat_nu, 'Quần', 'quan-nu', 'Quần dài và quần short nữ', 2),
          (@cat_nu, 'Chân váy', 'chan-vay', 'Chân váy dài, ngắn, xếp ly', 3),
          (@cat_nu, 'Đầm', 'dam', 'Đầm công sở, đầm dự tiệc, đầm dạo phố', 4),
          (@cat_nu, 'Áo khoác', 'ao-khoac-nu', 'Blazer, áo khoác dạ, cardigan', 5),
          (@cat_nam, 'Áo sơ mi', 'so-mi-nam', 'Sơ mi dài tay và ngắn tay', 1),
          (@cat_nam, 'Áo thun & polo', 'thun-polo-nam', 'Áo thun và polo nam', 2),
          (@cat_nam, 'Quần', 'quan-nam', 'Quần kaki, jeans, short nam', 3),
          (@cat_nam, 'Áo khoác', 'ao-khoac-nam', 'Bomber, áo khoác gió, denim', 4);

        -- 4. Sản phẩm
        INSERT INTO Products (CategoryId, ProductCode, Name, Slug, Description, Material, IsFeatured, CreatedAt, UpdatedAt)
        VALUES
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-nu'), 'P001', 'Áo sơ mi lụa cổ nơ', 'ao-so-mi-lua-co-no', 'Chất lụa mềm rủ, cổ nơ thắt tự do, tay dài bo măng. Mặc đi làm hoặc đi chơi đều gọn dáng.', 'Lụa tơ tằm nhân tạo', 1, DATE_SUB(v_now, INTERVAL 257 HOUR), DATE_SUB(v_now, INTERVAL 257 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-nu'), 'P002', 'Áo thun cotton cổ tròn', 'ao-thun-cotton-co-tron', 'Cotton dày vừa, bề mặt mềm. Form suông nhẹ, dễ phối với quần jeans hoặc chân váy.', 'Cotton 100%', 0, DATE_SUB(v_now, INTERVAL 702 HOUR), DATE_SUB(v_now, INTERVAL 702 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-nu'), 'P003', 'Áo kiểu voan tay phồng', 'ao-kieu-voan-tay-phong', 'Voan hai lớp nhẹ, tay phồng, cổ tròn có nút lưng. Hợp đi làm và dự tiệc nhẹ.', 'Voan chiffon hai lớp', 0, DATE_SUB(v_now, INTERVAL 1042 HOUR), DATE_SUB(v_now, INTERVAL 1042 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-nu'), 'P004', 'Áo len mỏng cổ V', 'ao-len-mong-co-v', 'Len mỏng, cổ V. Mặc riêng hoặc làm lớp lót dưới áo khoác.', 'Len acrylic pha cotton', 0, DATE_SUB(v_now, INTERVAL 750 HOUR), DATE_SUB(v_now, INTERVAL 750 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-nu'), 'P005', 'Áo croptop thun gân', 'ao-croptop-thun-gan', 'Thun gân ôm vừa, độ dài ngang eo. Chất vải co giãn, dễ vận động.', 'Thun gân cotton co giãn', 0, DATE_SUB(v_now, INTERVAL 1932 HOUR), DATE_SUB(v_now, INTERVAL 1932 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'quan-nu'), 'P006', 'Quần ống rộng linen', 'quan-ong-rong-linen', 'Linen pha cotton, cạp cao, ống rộng. Có túi chéo hai bên.', 'Linen pha cotton', 1, DATE_SUB(v_now, INTERVAL 2690 HOUR), DATE_SUB(v_now, INTERVAL 2690 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'quan-nu'), 'P007', 'Quần jeans ống đứng', 'quan-jeans-ong-dung', 'Denim dày vừa, cạp cao, ống đứng. Có túi trước và túi sau.', 'Denim cotton', 0, DATE_SUB(v_now, INTERVAL 217 HOUR), DATE_SUB(v_now, INTERVAL 217 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'quan-nu'), 'P008', 'Quần tây ống suông', 'quan-tay-ong-suong', 'Vải tuyết mưa đứng dáng, cạp cao, khóa kéo bên hông. Hợp môi trường công sở.', 'Tuyết mưa', 0, DATE_SUB(v_now, INTERVAL 2548 HOUR), DATE_SUB(v_now, INTERVAL 2548 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'quan-nu'), 'P009', 'Quần short kaki', 'quan-short-kaki', 'Kaki cotton, cạp vừa, dài ngang đùi. Mặc đi chơi hoặc đi biển.', 'Kaki cotton', 0, DATE_SUB(v_now, INTERVAL 1418 HOUR), DATE_SUB(v_now, INTERVAL 1418 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'chan-vay'), 'P010', 'Chân váy chữ A', 'chan-vay-chu-a', 'Chân váy chữ A dài ngang gối, cạp cao, khóa kéo sau. Dễ phối với áo thun hoặc sơ mi.', 'Tuyết mưa', 0, DATE_SUB(v_now, INTERVAL 1648 HOUR), DATE_SUB(v_now, INTERVAL 1648 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'chan-vay'), 'P011', 'Chân váy xếp ly dài', 'chan-vay-xep-ly-dai', 'Xếp ly đều, rủ nhẹ khi di chuyển, có lớp lót bên trong. Cạp chun phía sau.', 'Voan lụa', 1, DATE_SUB(v_now, INTERVAL 25 HOUR), DATE_SUB(v_now, INTERVAL 25 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'chan-vay'), 'P012', 'Chân váy jeans', 'chan-vay-jeans', 'Chân váy jeans dáng ngắn, túi thật hai bên, cúc bấm phía trước.', 'Denim', 0, DATE_SUB(v_now, INTERVAL 318 HOUR), DATE_SUB(v_now, INTERVAL 318 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'chan-vay'), 'P013', 'Chân váy bút chì', 'chan-vay-but-chi', 'Dáng bút chì ôm vừa, xẻ sau, dài qua gối. Dành cho đi làm.', 'Vải tuyết mưa co giãn', 0, DATE_SUB(v_now, INTERVAL 948 HOUR), DATE_SUB(v_now, INTERVAL 948 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'dam'), 'P014', 'Đầm sơ mi thắt eo', 'dam-so-mi-that-eo', 'Đầm sơ mi cài cúc phía trước, kèm đai thắt eo rời. Dài đến gối.', 'Cotton lụa', 1, DATE_SUB(v_now, INTERVAL 1976 HOUR), DATE_SUB(v_now, INTERVAL 1976 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'dam'), 'P015', 'Đầm xòe hoa nhí', 'dam-xoe-hoa-nhi', 'Voan hoa nhí hai lớp, cổ vuông, chân váy xòe. Hợp đi chơi và chụp ảnh.', 'Voan hoa', 0, DATE_SUB(v_now, INTERVAL 1044 HOUR), DATE_SUB(v_now, INTERVAL 1044 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'dam'), 'P016', 'Đầm ôm dệt kim', 'dam-om-det-kim', 'Dệt kim co giãn, ôm nhẹ theo dáng người, dài đến gối.', 'Dệt kim co giãn', 0, DATE_SUB(v_now, INTERVAL 1218 HOUR), DATE_SUB(v_now, INTERVAL 1218 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'dam'), 'P017', 'Đầm maxi lụa', 'dam-maxi-lua', 'Satin rủ dài đến mắt cá, cổ yếm, dây buộc sau lưng. Dành cho tiệc tối và du lịch.', 'Satin', 1, DATE_SUB(v_now, INTERVAL 2767 HOUR), DATE_SUB(v_now, INTERVAL 2767 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-khoac-nu'), 'P018', 'Blazer dáng rộng', 'blazer-dang-rong', 'Blazer dáng rộng, vai độn nhẹ, hai túi hộp. Phối được với áo thun hoặc sơ mi.', 'Tuyết mưa dày', 1, DATE_SUB(v_now, INTERVAL 1929 HOUR), DATE_SUB(v_now, INTERVAL 1929 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-khoac-nu'), 'P019', 'Áo khoác dạ lửng', 'ao-khoac-da-lung', 'Dạ dày, dài ngang đùi, cổ bẻ lớn, hai hàng cúc. Có lót satin bên trong.', 'Dạ dày', 0, DATE_SUB(v_now, INTERVAL 206 HOUR), DATE_SUB(v_now, INTERVAL 206 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-khoac-nu'), 'P020', 'Cardigan len dáng dài', 'cardigan-len-dang-dai', 'Len dệt dáng dài, cài cúc gỗ phía trước, hai túi bên.', 'Len dệt', 0, DATE_SUB(v_now, INTERVAL 2621 HOUR), DATE_SUB(v_now, INTERVAL 2621 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'so-mi-nam'), 'P021', 'Sơ mi Oxford tay dài', 'so-mi-oxford-tay-dai', 'Oxford dày dặn, cổ button-down, form regular. Mặc đi làm hoặc đi chơi.', 'Cotton Oxford', 1, DATE_SUB(v_now, INTERVAL 2007 HOUR), DATE_SUB(v_now, INTERVAL 2007 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'so-mi-nam'), 'P022', 'Sơ mi linen ngắn tay', 'so-mi-linen-ngan-tay', 'Linen pha cotton, tay ngắn, form rộng vừa. Phù hợp thời tiết nóng.', 'Linen pha cotton', 0, DATE_SUB(v_now, INTERVAL 1293 HOUR), DATE_SUB(v_now, INTERVAL 1293 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'so-mi-nam'), 'P023', 'Sơ mi kẻ sọc', 'so-mi-ke-soc', 'Poplin mịn, kẻ sọc nhỏ, cổ đứng, túi ngực bên trái.', 'Cotton poplin', 0, DATE_SUB(v_now, INTERVAL 1556 HOUR), DATE_SUB(v_now, INTERVAL 1556 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'thun-polo-nam'), 'P024', 'Polo pique', 'polo-pique', 'Pique dệt nổi, cổ bẻ bo gân, cài cúc ba nút.', 'Cotton pique', 1, DATE_SUB(v_now, INTERVAL 1037 HOUR), DATE_SUB(v_now, INTERVAL 1037 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'thun-polo-nam'), 'P025', 'Áo thun basic cổ tròn', 'ao-thun-basic-co-tron', 'Cotton 100%, cổ tròn bo gân, form regular. Dễ phối đồ hằng ngày.', 'Cotton 100%', 0, DATE_SUB(v_now, INTERVAL 2458 HOUR), DATE_SUB(v_now, INTERVAL 2458 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'thun-polo-nam'), 'P026', 'Áo thun in họa tiết', 'ao-thun-in-hoa-tiet', 'Cotton compact đứng dáng, họa tiết in nhỏ ở ngực. Form rộng vừa.', 'Cotton compact', 0, DATE_SUB(v_now, INTERVAL 1535 HOUR), DATE_SUB(v_now, INTERVAL 1535 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'quan-nam'), 'P027', 'Quần kaki slimfit', 'quan-kaki-slimfit', 'Kaki co giãn nhẹ, ống slimfit, cạp có passant. Mặc đi làm hoặc đi chơi.', 'Kaki co giãn', 0, DATE_SUB(v_now, INTERVAL 2797 HOUR), DATE_SUB(v_now, INTERVAL 2797 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'quan-nam'), 'P028', 'Quần jeans xanh đậm', 'quan-jeans-xanh-dam', 'Denim co giãn nhẹ, ống đứng, cạp vừa. Màu xanh đậm dễ phối.', 'Denim co giãn nhẹ', 1, DATE_SUB(v_now, INTERVAL 1823 HOUR), DATE_SUB(v_now, INTERVAL 1823 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'quan-nam'), 'P029', 'Quần short thể thao', 'quan-short-the-thao', 'Vải dù nhẹ, cạp chun có dây rút, túi khóa kéo.', 'Vải dù', 0, DATE_SUB(v_now, INTERVAL 1653 HOUR), DATE_SUB(v_now, INTERVAL 1653 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-khoac-nam'), 'P030', 'Áo khoác bomber', 'ao-khoac-bomber', 'Bomber dù phối bo, khóa kéo phía trước, hai túi chéo, lót mỏng.', 'Dù phối bo', 1, DATE_SUB(v_now, INTERVAL 1952 HOUR), DATE_SUB(v_now, INTERVAL 1952 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-khoac-nam'), 'P031', 'Áo khoác gió', 'ao-khoac-gio', 'Vải dù chống gió nhẹ, mũ liền có dây rút, hai túi khóa kéo. Gấp gọn được.', 'Vải dù chống gió', 0, DATE_SUB(v_now, INTERVAL 164 HOUR), DATE_SUB(v_now, INTERVAL 164 HOUR)),
          ((SELECT CategoryId FROM Categories WHERE Slug = 'ao-khoac-nam'), 'P032', 'Áo khoác denim', 'ao-khoac-denim', 'Denim dày vừa, cổ bẻ, cúc kim loại, hai túi ngực. Form regular.', 'Denim', 0, DATE_SUB(v_now, INTERVAL 1092 HOUR), DATE_SUB(v_now, INTERVAL 1092 HOUR));

        -- 5. Ảnh sản phẩm: tự động sinh ảnh chính (SortOrder = 0) và ảnh phụ (SortOrder = 1) cho cả 32 sản phẩm
        INSERT INTO ProductImages (ProductId, ImageUrl, AltText, SortOrder)
        SELECT ProductId, CONCAT('/images/products/', ProductCode, '.jpg'), Name, 0 FROM Products
        UNION ALL
        SELECT ProductId, CONCAT('/images/products/', ProductCode, '_2.jpg'), Name, 1 FROM Products;

        -- 6. Biến thể sản phẩm (276 dòng)
        INSERT INTO ProductVariants (ProductId, Sku, Size, ColorName, ColorHex, Price, CompareAtPrice, StockQuantity)
        VALUES
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-TRG-S', 'S', 'Trắng', '#F5F5F2', 690000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-TRG-M', 'M', 'Trắng', '#F5F5F2', 690000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-TRG-L', 'L', 'Trắng', '#F5F5F2', 690000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 690000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-BE-S', 'S', 'Be', '#D9C8AE', 690000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-BE-M', 'M', 'Be', '#D9C8AE', 690000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-BE-L', 'L', 'Be', '#D9C8AE', 690000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-BE-XL', 'XL', 'Be', '#D9C8AE', 690000, NULL, 2),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-DEN-S', 'S', 'Đen', '#1C1C1C', 690000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-DEN-M', 'M', 'Đen', '#1C1C1C', 690000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-DEN-L', 'L', 'Đen', '#1C1C1C', 690000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P001'), 'P001-DEN-XL', 'XL', 'Đen', '#1C1C1C', 690000, NULL, 0),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-TRG-S', 'S', 'Trắng', '#F5F5F2', 290000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-TRG-M', 'M', 'Trắng', '#F5F5F2', 290000, NULL, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-TRG-L', 'L', 'Trắng', '#F5F5F2', 290000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 290000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-DEN-S', 'S', 'Đen', '#1C1C1C', 290000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-DEN-M', 'M', 'Đen', '#1C1C1C', 290000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-DEN-L', 'L', 'Đen', '#1C1C1C', 290000, NULL, 2),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-DEN-XL', 'XL', 'Đen', '#1C1C1C', 290000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-HPH-S', 'S', 'Hồng phấn', '#E8B4BC', 290000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-HPH-M', 'M', 'Hồng phấn', '#E8B4BC', 290000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-HPH-L', 'L', 'Hồng phấn', '#E8B4BC', 290000, NULL, 18),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P002'), 'P002-HPH-XL', 'XL', 'Hồng phấn', '#E8B4BC', 290000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P003'), 'P003-TRG-S', 'S', 'Trắng', '#F5F5F2', 450000, 590000, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P003'), 'P003-TRG-M', 'M', 'Trắng', '#F5F5F2', 450000, 590000, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P003'), 'P003-TRG-L', 'L', 'Trắng', '#F5F5F2', 450000, 590000, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P003'), 'P003-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 450000, 590000, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P003'), 'P003-HPH-S', 'S', 'Hồng phấn', '#E8B4BC', 450000, 590000, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P003'), 'P003-HPH-M', 'M', 'Hồng phấn', '#E8B4BC', 450000, 590000, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P003'), 'P003-HPH-L', 'L', 'Hồng phấn', '#E8B4BC', 450000, 590000, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P003'), 'P003-HPH-XL', 'XL', 'Hồng phấn', '#E8B4BC', 450000, 590000, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-BE-S', 'S', 'Be', '#D9C8AE', 520000, NULL, 4),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-BE-M', 'M', 'Be', '#D9C8AE', 520000, NULL, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-BE-L', 'L', 'Be', '#D9C8AE', 520000, NULL, 15),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-BE-XL', 'XL', 'Be', '#D9C8AE', 520000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-XAM-S', 'S', 'Xám', '#8E8E8E', 520000, NULL, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-XAM-M', 'M', 'Xám', '#8E8E8E', 520000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-XAM-L', 'L', 'Xám', '#8E8E8E', 520000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-XAM-XL', 'XL', 'Xám', '#8E8E8E', 520000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-DOD-S', 'S', 'Đỏ đô', '#7B1E2B', 520000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-DOD-M', 'M', 'Đỏ đô', '#7B1E2B', 520000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-DOD-L', 'L', 'Đỏ đô', '#7B1E2B', 520000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P004'), 'P004-DOD-XL', 'XL', 'Đỏ đô', '#7B1E2B', 520000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P005'), 'P005-DEN-S', 'S', 'Đen', '#1C1C1C', 250000, 320000, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P005'), 'P005-DEN-M', 'M', 'Đen', '#1C1C1C', 250000, 320000, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P005'), 'P005-DEN-L', 'L', 'Đen', '#1C1C1C', 250000, 320000, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P005'), 'P005-DEN-XL', 'XL', 'Đen', '#1C1C1C', 250000, 320000, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P005'), 'P005-TRG-S', 'S', 'Trắng', '#F5F5F2', 250000, 320000, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P005'), 'P005-TRG-M', 'M', 'Trắng', '#F5F5F2', 250000, 320000, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P005'), 'P005-TRG-L', 'L', 'Trắng', '#F5F5F2', 250000, 320000, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P005'), 'P005-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 250000, 320000, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-BE-S', 'S', 'Be', '#D9C8AE', 590000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-BE-M', 'M', 'Be', '#D9C8AE', 590000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-BE-L', 'L', 'Be', '#D9C8AE', 590000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-BE-XL', 'XL', 'Be', '#D9C8AE', 590000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-DEN-S', 'S', 'Đen', '#1C1C1C', 590000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-DEN-M', 'M', 'Đen', '#1C1C1C', 590000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-DEN-L', 'L', 'Đen', '#1C1C1C', 590000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-DEN-XL', 'XL', 'Đen', '#1C1C1C', 590000, NULL, 2),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-REU-S', 'S', 'Xanh rêu', '#5B6B4A', 590000, NULL, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-REU-M', 'M', 'Xanh rêu', '#5B6B4A', 590000, NULL, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-REU-L', 'L', 'Xanh rêu', '#5B6B4A', 590000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P006'), 'P006-REU-XL', 'XL', 'Xanh rêu', '#5B6B4A', 590000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P007'), 'P007-JEA-S', 'S', 'Xanh jeans', '#4A6FA5', 640000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P007'), 'P007-JEA-M', 'M', 'Xanh jeans', '#4A6FA5', 640000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P007'), 'P007-JEA-L', 'L', 'Xanh jeans', '#4A6FA5', 640000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P007'), 'P007-JEA-XL', 'XL', 'Xanh jeans', '#4A6FA5', 670000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P007'), 'P007-DEN-S', 'S', 'Đen', '#1C1C1C', 640000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P007'), 'P007-DEN-M', 'M', 'Đen', '#1C1C1C', 640000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P007'), 'P007-DEN-L', 'L', 'Đen', '#1C1C1C', 640000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P007'), 'P007-DEN-XL', 'XL', 'Đen', '#1C1C1C', 670000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P008'), 'P008-DEN-S', 'S', 'Đen', '#1C1C1C', 620000, NULL, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P008'), 'P008-DEN-M', 'M', 'Đen', '#1C1C1C', 620000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P008'), 'P008-DEN-L', 'L', 'Đen', '#1C1C1C', 620000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P008'), 'P008-DEN-XL', 'XL', 'Đen', '#1C1C1C', 620000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P008'), 'P008-XAM-S', 'S', 'Xám', '#8E8E8E', 620000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P008'), 'P008-XAM-M', 'M', 'Xám', '#8E8E8E', 620000, NULL, 20),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P008'), 'P008-XAM-L', 'L', 'Xám', '#8E8E8E', 620000, NULL, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P008'), 'P008-XAM-XL', 'XL', 'Xám', '#8E8E8E', 620000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P009'), 'P009-BE-S', 'S', 'Be', '#D9C8AE', 380000, 450000, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P009'), 'P009-BE-M', 'M', 'Be', '#D9C8AE', 380000, 450000, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P009'), 'P009-BE-L', 'L', 'Be', '#D9C8AE', 380000, 450000, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P009'), 'P009-BE-XL', 'XL', 'Be', '#D9C8AE', 380000, 450000, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P009'), 'P009-NAV-S', 'S', 'Xanh navy', '#1F2A44', 380000, 450000, 4),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P009'), 'P009-NAV-M', 'M', 'Xanh navy', '#1F2A44', 380000, 450000, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P009'), 'P009-NAV-L', 'L', 'Xanh navy', '#1F2A44', 380000, 450000, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P009'), 'P009-NAV-XL', 'XL', 'Xanh navy', '#1F2A44', 380000, 450000, 4),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P010'), 'P010-DEN-S', 'S', 'Đen', '#1C1C1C', 520000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P010'), 'P010-DEN-M', 'M', 'Đen', '#1C1C1C', 520000, NULL, 19),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P010'), 'P010-DEN-L', 'L', 'Đen', '#1C1C1C', 520000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P010'), 'P010-DEN-XL', 'XL', 'Đen', '#1C1C1C', 520000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P010'), 'P010-BE-S', 'S', 'Be', '#D9C8AE', 520000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P010'), 'P010-BE-M', 'M', 'Be', '#D9C8AE', 520000, NULL, 19),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P010'), 'P010-BE-L', 'L', 'Be', '#D9C8AE', 520000, NULL, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P010'), 'P010-BE-XL', 'XL', 'Be', '#D9C8AE', 520000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P011'), 'P011-KEM-S', 'S', 'Kem', '#EFE6D2', 580000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P011'), 'P011-KEM-M', 'M', 'Kem', '#EFE6D2', 580000, NULL, 20),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P011'), 'P011-KEM-L', 'L', 'Kem', '#EFE6D2', 580000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P011'), 'P011-KEM-XL', 'XL', 'Kem', '#EFE6D2', 580000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P011'), 'P011-DEN-S', 'S', 'Đen', '#1C1C1C', 580000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P011'), 'P011-DEN-M', 'M', 'Đen', '#1C1C1C', 580000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P011'), 'P011-DEN-L', 'L', 'Đen', '#1C1C1C', 580000, NULL, 18),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P011'), 'P011-DEN-XL', 'XL', 'Đen', '#1C1C1C', 580000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P012'), 'P012-JEA-S', 'S', 'Xanh jeans', '#4A6FA5', 480000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P012'), 'P012-JEA-M', 'M', 'Xanh jeans', '#4A6FA5', 480000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P012'), 'P012-JEA-L', 'L', 'Xanh jeans', '#4A6FA5', 480000, NULL, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P012'), 'P012-JEA-XL', 'XL', 'Xanh jeans', '#4A6FA5', 480000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P013'), 'P013-DEN-S', 'S', 'Đen', '#1C1C1C', 490000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P013'), 'P013-DEN-M', 'M', 'Đen', '#1C1C1C', 490000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P013'), 'P013-DEN-L', 'L', 'Đen', '#1C1C1C', 490000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P013'), 'P013-DEN-XL', 'XL', 'Đen', '#1C1C1C', 490000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P013'), 'P013-XAM-S', 'S', 'Xám', '#8E8E8E', 490000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P013'), 'P013-XAM-M', 'M', 'Xám', '#8E8E8E', 490000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P013'), 'P013-XAM-L', 'L', 'Xám', '#8E8E8E', 490000, NULL, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P013'), 'P013-XAM-XL', 'XL', 'Xám', '#8E8E8E', 490000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P014'), 'P014-TRG-S', 'S', 'Trắng', '#F5F5F2', 890000, 1090000, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P014'), 'P014-TRG-M', 'M', 'Trắng', '#F5F5F2', 890000, 1090000, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P014'), 'P014-TRG-L', 'L', 'Trắng', '#F5F5F2', 890000, 1090000, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P014'), 'P014-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 890000, 1090000, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P014'), 'P014-NAV-S', 'S', 'Xanh navy', '#1F2A44', 890000, 1090000, 4),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P014'), 'P014-NAV-M', 'M', 'Xanh navy', '#1F2A44', 890000, 1090000, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P014'), 'P014-NAV-L', 'L', 'Xanh navy', '#1F2A44', 890000, 1090000, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P014'), 'P014-NAV-XL', 'XL', 'Xanh navy', '#1F2A44', 890000, 1090000, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P015'), 'P015-HPH-S', 'S', 'Hồng phấn', '#E8B4BC', 790000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P015'), 'P015-HPH-M', 'M', 'Hồng phấn', '#E8B4BC', 790000, NULL, 18),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P015'), 'P015-HPH-L', 'L', 'Hồng phấn', '#E8B4BC', 790000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P015'), 'P015-HPH-XL', 'XL', 'Hồng phấn', '#E8B4BC', 790000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P015'), 'P015-KEM-S', 'S', 'Kem', '#EFE6D2', 790000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P015'), 'P015-KEM-M', 'M', 'Kem', '#EFE6D2', 790000, NULL, 15),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P015'), 'P015-KEM-L', 'L', 'Kem', '#EFE6D2', 790000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P015'), 'P015-KEM-XL', 'XL', 'Kem', '#EFE6D2', 790000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P016'), 'P016-DEN-S', 'S', 'Đen', '#1C1C1C', 690000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P016'), 'P016-DEN-M', 'M', 'Đen', '#1C1C1C', 690000, NULL, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P016'), 'P016-DEN-L', 'L', 'Đen', '#1C1C1C', 690000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P016'), 'P016-DEN-XL', 'XL', 'Đen', '#1C1C1C', 690000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P016'), 'P016-DOD-S', 'S', 'Đỏ đô', '#7B1E2B', 690000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P016'), 'P016-DOD-M', 'M', 'Đỏ đô', '#7B1E2B', 690000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P016'), 'P016-DOD-L', 'L', 'Đỏ đô', '#7B1E2B', 690000, NULL, 15),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P016'), 'P016-DOD-XL', 'XL', 'Đỏ đô', '#7B1E2B', 690000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P017'), 'P017-DOD-S', 'S', 'Đỏ đô', '#7B1E2B', 1190000, NULL, 0),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P017'), 'P017-DOD-M', 'M', 'Đỏ đô', '#7B1E2B', 1190000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P017'), 'P017-DOD-L', 'L', 'Đỏ đô', '#7B1E2B', 1190000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P017'), 'P017-DOD-XL', 'XL', 'Đỏ đô', '#7B1E2B', 1190000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P017'), 'P017-DEN-S', 'S', 'Đen', '#1C1C1C', 1190000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P017'), 'P017-DEN-M', 'M', 'Đen', '#1C1C1C', 1190000, NULL, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P017'), 'P017-DEN-L', 'L', 'Đen', '#1C1C1C', 1190000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P017'), 'P017-DEN-XL', 'XL', 'Đen', '#1C1C1C', 1190000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P018'), 'P018-DEN-S', 'S', 'Đen', '#1C1C1C', 1290000, 1590000, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P018'), 'P018-DEN-M', 'M', 'Đen', '#1C1C1C', 1290000, 1590000, 1),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P018'), 'P018-DEN-L', 'L', 'Đen', '#1C1C1C', 1290000, 1590000, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P018'), 'P018-DEN-XL', 'XL', 'Đen', '#1C1C1C', 1340000, 1640000, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P018'), 'P018-BE-S', 'S', 'Be', '#D9C8AE', 1290000, 1590000, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P018'), 'P018-BE-M', 'M', 'Be', '#D9C8AE', 1290000, 1590000, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P018'), 'P018-BE-L', 'L', 'Be', '#D9C8AE', 1290000, 1590000, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P018'), 'P018-BE-XL', 'XL', 'Be', '#D9C8AE', 1340000, 1640000, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P019'), 'P019-XAM-S', 'S', 'Xám', '#8E8E8E', 1890000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P019'), 'P019-XAM-M', 'M', 'Xám', '#8E8E8E', 1890000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P019'), 'P019-XAM-L', 'L', 'Xám', '#8E8E8E', 1890000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P019'), 'P019-XAM-XL', 'XL', 'Xám', '#8E8E8E', 1940000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P019'), 'P019-NAU-S', 'S', 'Nâu', '#7A5A3A', 1890000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P019'), 'P019-NAU-M', 'M', 'Nâu', '#7A5A3A', 1890000, NULL, 20),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P019'), 'P019-NAU-L', 'L', 'Nâu', '#7A5A3A', 1890000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P019'), 'P019-NAU-XL', 'XL', 'Nâu', '#7A5A3A', 1940000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P020'), 'P020-KEM-S', 'S', 'Kem', '#EFE6D2', 790000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P020'), 'P020-KEM-M', 'M', 'Kem', '#EFE6D2', 790000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P020'), 'P020-KEM-L', 'L', 'Kem', '#EFE6D2', 790000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P020'), 'P020-KEM-XL', 'XL', 'Kem', '#EFE6D2', 820000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P020'), 'P020-XAM-S', 'S', 'Xám', '#8E8E8E', 790000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P020'), 'P020-XAM-M', 'M', 'Xám', '#8E8E8E', 790000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P020'), 'P020-XAM-L', 'L', 'Xám', '#8E8E8E', 790000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P020'), 'P020-XAM-XL', 'XL', 'Xám', '#8E8E8E', 820000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P021'), 'P021-TRG-S', 'S', 'Trắng', '#F5F5F2', 590000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P021'), 'P021-TRG-M', 'M', 'Trắng', '#F5F5F2', 590000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P021'), 'P021-TRG-L', 'L', 'Trắng', '#F5F5F2', 590000, NULL, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P021'), 'P021-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 590000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P021'), 'P021-XNH-S', 'S', 'Xanh nhạt', '#A9C4DE', 590000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P021'), 'P021-XNH-M', 'M', 'Xanh nhạt', '#A9C4DE', 590000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P021'), 'P021-XNH-L', 'L', 'Xanh nhạt', '#A9C4DE', 590000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P021'), 'P021-XNH-XL', 'XL', 'Xanh nhạt', '#A9C4DE', 590000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P022'), 'P022-BE-S', 'S', 'Be', '#D9C8AE', 540000, 650000, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P022'), 'P022-BE-M', 'M', 'Be', '#D9C8AE', 540000, 650000, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P022'), 'P022-BE-L', 'L', 'Be', '#D9C8AE', 540000, 650000, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P022'), 'P022-BE-XL', 'XL', 'Be', '#D9C8AE', 540000, 650000, 4),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P022'), 'P022-TRG-S', 'S', 'Trắng', '#F5F5F2', 540000, 650000, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P022'), 'P022-TRG-M', 'M', 'Trắng', '#F5F5F2', 540000, 650000, 19),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P022'), 'P022-TRG-L', 'L', 'Trắng', '#F5F5F2', 540000, 650000, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P022'), 'P022-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 540000, 650000, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P023'), 'P023-XNH-S', 'S', 'Xanh nhạt', '#A9C4DE', 560000, NULL, 4),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P023'), 'P023-XNH-M', 'M', 'Xanh nhạt', '#A9C4DE', 560000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P023'), 'P023-XNH-L', 'L', 'Xanh nhạt', '#A9C4DE', 560000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P023'), 'P023-XNH-XL', 'XL', 'Xanh nhạt', '#A9C4DE', 560000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P023'), 'P023-TRG-S', 'S', 'Trắng', '#F5F5F2', 560000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P023'), 'P023-TRG-M', 'M', 'Trắng', '#F5F5F2', 560000, NULL, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P023'), 'P023-TRG-L', 'L', 'Trắng', '#F5F5F2', 560000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P023'), 'P023-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 560000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-NAV-S', 'S', 'Xanh navy', '#1F2A44', 420000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-NAV-M', 'M', 'Xanh navy', '#1F2A44', 420000, NULL, 19),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-NAV-L', 'L', 'Xanh navy', '#1F2A44', 420000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-NAV-XL', 'XL', 'Xanh navy', '#1F2A44', 420000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-TRG-S', 'S', 'Trắng', '#F5F5F2', 420000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-TRG-M', 'M', 'Trắng', '#F5F5F2', 420000, NULL, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-TRG-L', 'L', 'Trắng', '#F5F5F2', 420000, NULL, 14),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 420000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-DEN-S', 'S', 'Đen', '#1C1C1C', 420000, NULL, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-DEN-M', 'M', 'Đen', '#1C1C1C', 420000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-DEN-L', 'L', 'Đen', '#1C1C1C', 420000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P024'), 'P024-DEN-XL', 'XL', 'Đen', '#1C1C1C', 420000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-DEN-S', 'S', 'Đen', '#1C1C1C', 260000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-DEN-M', 'M', 'Đen', '#1C1C1C', 260000, NULL, 18),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-DEN-L', 'L', 'Đen', '#1C1C1C', 260000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-DEN-XL', 'XL', 'Đen', '#1C1C1C', 260000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-TRG-S', 'S', 'Trắng', '#F5F5F2', 260000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-TRG-M', 'M', 'Trắng', '#F5F5F2', 260000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-TRG-L', 'L', 'Trắng', '#F5F5F2', 260000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 260000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-XAM-S', 'S', 'Xám', '#8E8E8E', 260000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-XAM-M', 'M', 'Xám', '#8E8E8E', 260000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-XAM-L', 'L', 'Xám', '#8E8E8E', 260000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P025'), 'P025-XAM-XL', 'XL', 'Xám', '#8E8E8E', 260000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P026'), 'P026-TRG-S', 'S', 'Trắng', '#F5F5F2', 320000, 390000, 4),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P026'), 'P026-TRG-M', 'M', 'Trắng', '#F5F5F2', 320000, 390000, 20),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P026'), 'P026-TRG-L', 'L', 'Trắng', '#F5F5F2', 320000, 390000, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P026'), 'P026-TRG-XL', 'XL', 'Trắng', '#F5F5F2', 320000, 390000, 4),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P026'), 'P026-DEN-S', 'S', 'Đen', '#1C1C1C', 320000, 390000, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P026'), 'P026-DEN-M', 'M', 'Đen', '#1C1C1C', 320000, 390000, 18),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P026'), 'P026-DEN-L', 'L', 'Đen', '#1C1C1C', 320000, 390000, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P026'), 'P026-DEN-XL', 'XL', 'Đen', '#1C1C1C', 320000, 390000, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-BE-S', 'S', 'Be', '#D9C8AE', 560000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-BE-M', 'M', 'Be', '#D9C8AE', 560000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-BE-L', 'L', 'Be', '#D9C8AE', 560000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-BE-XL', 'XL', 'Be', '#D9C8AE', 590000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-NAV-S', 'S', 'Xanh navy', '#1F2A44', 560000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-NAV-M', 'M', 'Xanh navy', '#1F2A44', 560000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-NAV-L', 'L', 'Xanh navy', '#1F2A44', 560000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-NAV-XL', 'XL', 'Xanh navy', '#1F2A44', 590000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-DEN-S', 'S', 'Đen', '#1C1C1C', 560000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-DEN-M', 'M', 'Đen', '#1C1C1C', 560000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-DEN-L', 'L', 'Đen', '#1C1C1C', 560000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P027'), 'P027-DEN-XL', 'XL', 'Đen', '#1C1C1C', 590000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P028'), 'P028-JEA-S', 'S', 'Xanh jeans', '#4A6FA5', 690000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P028'), 'P028-JEA-M', 'M', 'Xanh jeans', '#4A6FA5', 690000, NULL, 15),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P028'), 'P028-JEA-L', 'L', 'Xanh jeans', '#4A6FA5', 690000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P028'), 'P028-JEA-XL', 'XL', 'Xanh jeans', '#4A6FA5', 720000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P028'), 'P028-DEN-S', 'S', 'Đen', '#1C1C1C', 690000, NULL, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P028'), 'P028-DEN-M', 'M', 'Đen', '#1C1C1C', 690000, NULL, 6),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P028'), 'P028-DEN-L', 'L', 'Đen', '#1C1C1C', 690000, NULL, 12),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P028'), 'P028-DEN-XL', 'XL', 'Đen', '#1C1C1C', 720000, NULL, 2),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P029'), 'P029-DEN-S', 'S', 'Đen', '#1C1C1C', 290000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P029'), 'P029-DEN-M', 'M', 'Đen', '#1C1C1C', 290000, NULL, 17),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P029'), 'P029-DEN-L', 'L', 'Đen', '#1C1C1C', 290000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P029'), 'P029-DEN-XL', 'XL', 'Đen', '#1C1C1C', 290000, NULL, 2),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P029'), 'P029-XAM-S', 'S', 'Xám', '#8E8E8E', 290000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P029'), 'P029-XAM-M', 'M', 'Xám', '#8E8E8E', 290000, NULL, 10),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P029'), 'P029-XAM-L', 'L', 'Xám', '#8E8E8E', 290000, NULL, 18),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P029'), 'P029-XAM-XL', 'XL', 'Xám', '#8E8E8E', 290000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P030'), 'P030-REU-S', 'S', 'Xanh rêu', '#5B6B4A', 890000, 1090000, 13),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P030'), 'P030-REU-M', 'M', 'Xanh rêu', '#5B6B4A', 890000, 1090000, 18),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P030'), 'P030-REU-L', 'L', 'Xanh rêu', '#5B6B4A', 890000, 1090000, 9),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P030'), 'P030-REU-XL', 'XL', 'Xanh rêu', '#5B6B4A', 940000, 1140000, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P030'), 'P030-DEN-S', 'S', 'Đen', '#1C1C1C', 890000, 1090000, 3),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P030'), 'P030-DEN-M', 'M', 'Đen', '#1C1C1C', 890000, 1090000, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P030'), 'P030-DEN-L', 'L', 'Đen', '#1C1C1C', 890000, 1090000, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P030'), 'P030-DEN-XL', 'XL', 'Đen', '#1C1C1C', 940000, 1140000, 2),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P031'), 'P031-DEN-S', 'S', 'Đen', '#1C1C1C', 750000, NULL, 11),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P031'), 'P031-DEN-M', 'M', 'Đen', '#1C1C1C', 750000, NULL, 8),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P031'), 'P031-DEN-L', 'L', 'Đen', '#1C1C1C', 750000, NULL, 18),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P031'), 'P031-DEN-XL', 'XL', 'Đen', '#1C1C1C', 780000, NULL, 2),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P031'), 'P031-NAV-S', 'S', 'Xanh navy', '#1F2A44', 750000, NULL, 5),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P031'), 'P031-NAV-M', 'M', 'Xanh navy', '#1F2A44', 750000, NULL, 18),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P031'), 'P031-NAV-L', 'L', 'Xanh navy', '#1F2A44', 750000, NULL, 16),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P031'), 'P031-NAV-XL', 'XL', 'Xanh navy', '#1F2A44', 780000, NULL, 7),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P032'), 'P032-JEA-S', 'S', 'Xanh jeans', '#4A6FA5', 850000, NULL, 0),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P032'), 'P032-JEA-M', 'M', 'Xanh jeans', '#4A6FA5', 850000, NULL, 0),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P032'), 'P032-JEA-L', 'L', 'Xanh jeans', '#4A6FA5', 850000, NULL, 0),
          ((SELECT ProductId FROM Products WHERE ProductCode = 'P032'), 'P032-JEA-XL', 'XL', 'Xanh jeans', '#4A6FA5', 850000, NULL, 0);

        -- 7. [UC05][UC12] Mã giảm giá
        INSERT INTO Discounts (Code, Description, DiscountType, DiscountValue, MaxDiscountAmount, MinOrderValue, StartsAt, EndsAt, UsageLimit, UsedCount)
        VALUES
          ('WELCOME10', 'Giảm 10% cho đơn từ 300.000đ, tối đa 100.000đ', 'PERCENT', 10, 100000, 300000, DATE_ADD(v_now, INTERVAL -90 DAY), DATE_ADD(v_now, INTERVAL 180 DAY), 500, 1),
          ('GIAM50K', 'Giảm 50.000đ cho đơn từ 500.000đ', 'FIXED', 50000, NULL, 500000, DATE_ADD(v_now, INTERVAL -90 DAY), DATE_ADD(v_now, INTERVAL 180 DAY), 200, 1),
          ('SALE20', 'Giảm 20% tối đa 200.000đ cho đơn từ 1.000.000đ', 'PERCENT', 20, 200000, 1000000, DATE_ADD(v_now, INTERVAL -60 DAY), DATE_ADD(v_now, INTERVAL 30 DAY), 100, 1),
          ('HETLUOT', 'Mã mẫu đã dùng hết lượt, dùng để kiểm thử', 'FIXED', 30000, NULL, 0, DATE_ADD(v_now, INTERVAL -60 DAY), DATE_ADD(v_now, INTERVAL 60 DAY), 1, 1),
          ('HETHAN', 'Mã mẫu đã hết hạn, dùng để kiểm thử', 'PERCENT', 15, 150000, 0, DATE_ADD(v_now, INTERVAL -120 DAY), DATE_ADD(v_now, INTERVAL -30 DAY), 100, 0),
          ('SAPDIENRA', 'Mã mẫu chưa đến ngày áp dụng, dùng để kiểm thử', 'PERCENT', 25, 250000, 0, DATE_ADD(v_now, INTERVAL 30 DAY), DATE_ADD(v_now, INTERVAL 60 DAY), 100, 0);

        -- 8. [UC04] Đơn hàng mẫu
        INSERT INTO Orders (OrderCode, UserId, Status, ShipRecipientName, ShipPhone, ShipProvince, ShipDistrict, ShipWard, ShipStreet, Note,
                           Subtotal, DiscountId, DiscountCode, DiscountAmount, ShippingFee, TotalAmount, PaymentMethod, StockDeducted,
                           ConsentGivenAt, CancelReason, PlacedAt, ConfirmedAt, DeliveredAt, CancelledAt, UpdatedAt)
        VALUES
          ('AMDEMO0001', (SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'DELIVERED', 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Mẫu', 'Số 12 ngõ 34 đường Mẫu', NULL, 1220000, NULL, NULL, 0, 0, 1220000, 'COD', 1, DATE_SUB(v_now, INTERVAL 720 HOUR), NULL, DATE_SUB(v_now, INTERVAL 720 HOUR), DATE_SUB(v_now, INTERVAL 718 HOUR), DATE_SUB(v_now, INTERVAL 660 HOUR), NULL, DATE_SUB(v_now, INTERVAL 660 HOUR)),
          ('AMDEMO0002', (SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'DELIVERED', 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Mẫu', 'Số 12 ngõ 34 đường Mẫu', NULL, 890000, (SELECT DiscountId FROM Discounts WHERE Code = 'WELCOME10'), 'WELCOME10', 89000, 0, 801000, 'ONLINE', 1, DATE_SUB(v_now, INTERVAL 600 HOUR), NULL, DATE_SUB(v_now, INTERVAL 600 HOUR), DATE_SUB(v_now, INTERVAL 599 HOUR), DATE_SUB(v_now, INTERVAL 560 HOUR), NULL, DATE_SUB(v_now, INTERVAL 560 HOUR)),
          ('AMDEMO0003', (SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'DELIVERED', 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Mẫu', 'Số 12 ngõ 34 đường Mẫu', NULL, 1040000, NULL, NULL, 0, 0, 1040000, 'COD', 1, DATE_SUB(v_now, INTERVAL 480 HOUR), NULL, DATE_SUB(v_now, INTERVAL 480 HOUR), DATE_SUB(v_now, INTERVAL 478 HOUR), DATE_SUB(v_now, INTERVAL 420 HOUR), NULL, DATE_SUB(v_now, INTERVAL 420 HOUR)),
          ('AMDEMO0004', (SELECT UserId FROM Users WHERE Email = 'an.tran@example.com'), 'DELIVERED', 'Trần Minh An', '0987654321', 'TP. Hồ Chí Minh', NULL, 'Phường Mẫu', '45 đường Ví Dụ', NULL, 1400000, (SELECT DiscountId FROM Discounts WHERE Code = 'GIAM50K'), 'GIAM50K', 50000, 0, 1350000, 'COD', 1, DATE_SUB(v_now, INTERVAL 450 HOUR), NULL, DATE_SUB(v_now, INTERVAL 450 HOUR), DATE_SUB(v_now, INTERVAL 448 HOUR), DATE_SUB(v_now, INTERVAL 390 HOUR), NULL, DATE_SUB(v_now, INTERVAL 390 HOUR)),
          ('AMDEMO0005', (SELECT UserId FROM Users WHERE Email = 'an.tran@example.com'), 'DELIVERED', 'Trần Minh An', '0987654321', 'TP. Hồ Chí Minh', NULL, 'Phường Mẫu', '45 đường Ví Dụ', NULL, 590000, (SELECT DiscountId FROM Discounts WHERE Code = 'HETLUOT'), 'HETLUOT', 30000, 0, 560000, 'ONLINE', 1, DATE_SUB(v_now, INTERVAL 400 HOUR), NULL, DATE_SUB(v_now, INTERVAL 400 HOUR), DATE_SUB(v_now, INTERVAL 399 HOUR), DATE_SUB(v_now, INTERVAL 350 HOUR), NULL, DATE_SUB(v_now, INTERVAL 350 HOUR)),
          ('AMDEMO0006', (SELECT UserId FROM Users WHERE Email = 'an.tran@example.com'), 'RETURNED', 'Trần Minh An', '0987654321', 'TP. Hồ Chí Minh', NULL, 'Phường Mẫu', '45 đường Ví Dụ', NULL, 520000, NULL, NULL, 0, 0, 520000, 'COD', 0, DATE_SUB(v_now, INTERVAL 350 HOUR), 'Khách trả hàng vì không vừa size, shop đã nhận lại hàng và hoàn tiền', DATE_SUB(v_now, INTERVAL 350 HOUR), DATE_SUB(v_now, INTERVAL 349 HOUR), DATE_SUB(v_now, INTERVAL 300 HOUR), NULL, DATE_SUB(v_now, INTERVAL 250 HOUR)),
          ('AMDEMO0007', (SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'DELIVERED', 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Mẫu', 'Số 12 ngõ 34 đường Mẫu', NULL, 1290000, (SELECT DiscountId FROM Discounts WHERE Code = 'SALE20'), 'SALE20', 200000, 0, 1090000, 'ONLINE', 1, DATE_SUB(v_now, INTERVAL 300 HOUR), NULL, DATE_SUB(v_now, INTERVAL 300 HOUR), DATE_SUB(v_now, INTERVAL 299 HOUR), DATE_SUB(v_now, INTERVAL 250 HOUR), NULL, DATE_SUB(v_now, INTERVAL 250 HOUR)),
          ('AMDEMO0008', (SELECT UserId FROM Users WHERE Email = 'an.tran@example.com'), 'CANCELLED', 'Trần Minh An', '0987654321', 'TP. Hồ Chí Minh', NULL, 'Phường Mẫu', '45 đường Ví Dụ', NULL, 890000, NULL, NULL, 0, 0, 890000, 'ONLINE', 0, DATE_SUB(v_now, INTERVAL 250 HOUR), 'Khách đổi ý, yêu cầu hủy sau khi đã thanh toán. Cần hoàn tiền cho khách', DATE_SUB(v_now, INTERVAL 250 HOUR), DATE_SUB(v_now, INTERVAL 249 HOUR), NULL, DATE_SUB(v_now, INTERVAL 230 HOUR), DATE_SUB(v_now, INTERVAL 230 HOUR)),
          ('AMDEMO0009', (SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'CANCELLED', 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Mẫu', 'Số 12 ngõ 34 đường Mẫu', NULL, 480000, (SELECT DiscountId FROM Discounts WHERE Code = 'WELCOME10'), 'WELCOME10', 48000, 30000, 462000, 'COD', 0, DATE_SUB(v_now, INTERVAL 200 HOUR), 'Khách tự hủy khi đơn chưa được xác nhận', DATE_SUB(v_now, INTERVAL 200 HOUR), NULL, NULL, DATE_SUB(v_now, INTERVAL 190 HOUR), DATE_SUB(v_now, INTERVAL 190 HOUR)),
          ('AMDEMO0010', (SELECT UserId FROM Users WHERE Email = 'an.tran@example.com'), 'DELIVERED', 'Trần Minh An', '0987654321', 'TP. Hồ Chí Minh', NULL, 'Phường Mẫu', '45 đường Ví Dụ', NULL, 1040000, NULL, NULL, 0, 0, 1040000, 'COD', 1, DATE_SUB(v_now, INTERVAL 150 HOUR), NULL, DATE_SUB(v_now, INTERVAL 150 HOUR), DATE_SUB(v_now, INTERVAL 148 HOUR), DATE_SUB(v_now, INTERVAL 90 HOUR), NULL, DATE_SUB(v_now, INTERVAL 90 HOUR)),
          ('AMDEMO0011', (SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'SHIPPING', 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Mẫu', 'Số 12 ngõ 34 đường Mẫu', NULL, 1890000, NULL, NULL, 0, 0, 1890000, 'COD', 1, DATE_SUB(v_now, INTERVAL 60 HOUR), NULL, DATE_SUB(v_now, INTERVAL 60 HOUR), DATE_SUB(v_now, INTERVAL 58 HOUR), NULL, NULL, DATE_SUB(v_now, INTERVAL 30 HOUR)),
          ('AMDEMO0012', (SELECT UserId FROM Users WHERE Email = 'an.tran@example.com'), 'SHIPPING', 'Trần Minh An', '0987654321', 'TP. Hồ Chí Minh', NULL, 'Phường Mẫu', '45 đường Ví Dụ', NULL, 970000, NULL, NULL, 0, 0, 970000, 'ONLINE', 1, DATE_SUB(v_now, INTERVAL 48 HOUR), NULL, DATE_SUB(v_now, INTERVAL 48 HOUR), DATE_SUB(v_now, INTERVAL 47 HOUR), NULL, NULL, DATE_SUB(v_now, INTERVAL 24 HOUR)),
          ('AMDEMO0013', (SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'CONFIRMED', 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Mẫu', 'Số 12 ngõ 34 đường Mẫu', NULL, 790000, NULL, NULL, 0, 0, 790000, 'ONLINE', 1, DATE_SUB(v_now, INTERVAL 20 HOUR), NULL, DATE_SUB(v_now, INTERVAL 20 HOUR), DATE_SUB(v_now, INTERVAL 19 HOUR), NULL, NULL, DATE_SUB(v_now, INTERVAL 19 HOUR)),
          ('AMDEMO0014', (SELECT UserId FROM Users WHERE Email = 'an.tran@example.com'), 'CONFIRMED', 'Trần Minh An', '0987654321', 'TP. Hồ Chí Minh', NULL, 'Phường Mẫu', '45 đường Ví Dụ', NULL, 1080000, NULL, NULL, 0, 0, 1080000, 'COD', 1, DATE_SUB(v_now, INTERVAL 12 HOUR), NULL, DATE_SUB(v_now, INTERVAL 12 HOUR), DATE_SUB(v_now, INTERVAL 10 HOUR), NULL, NULL, DATE_SUB(v_now, INTERVAL 10 HOUR)),
          ('AMDEMO0015', (SELECT UserId FROM Users WHERE Email = 'ha.nguyen@example.com'), 'PENDING', 'Nguyễn Thu Hà', '0912345678', 'Hà Nội', NULL, 'Phường Mẫu', 'Số 12 ngõ 34 đường Mẫu', 'Gọi trước khi giao giúp mình', 260000, NULL, NULL, 0, 30000, 290000, 'COD', 0, DATE_SUB(v_now, INTERVAL 5 HOUR), NULL, DATE_SUB(v_now, INTERVAL 5 HOUR), NULL, NULL, NULL, DATE_SUB(v_now, INTERVAL 5 HOUR)),
          ('AMDEMO0016', (SELECT UserId FROM Users WHERE Email = 'an.tran@example.com'), 'PENDING', 'Trần Minh An', '0987654321', 'TP. Hồ Chí Minh', NULL, 'Phường Mẫu', '45 đường Ví Dụ', NULL, 540000, NULL, NULL, 0, 0, 540000, 'ONLINE', 0, DATE_SUB(v_now, INTERVAL 2 HOUR), NULL, DATE_SUB(v_now, INTERVAL 2 HOUR), NULL, NULL, NULL, DATE_SUB(v_now, INTERVAL 2 HOUR));

        -- 9. [UC04] Dòng hàng (OrderItems) - Đã bỏ LATERAL để tương thích MySQL 5.7 / MariaDB
        INSERT INTO OrderItems (OrderId, VariantId, ProductId, ProductName, Sku, Size, ColorName, ImageUrl, UnitPrice, Quantity)
        SELECT o.OrderId, pv.VariantId, pv.ProductId, p.Name, pv.Sku, pv.Size, pv.ColorName,
               (SELECT i.ImageUrl FROM ProductImages AS i WHERE i.ProductId = p.ProductId ORDER BY i.SortOrder LIMIT 1),
               v.UnitPrice, v.Quantity
        FROM (
            SELECT 'AMDEMO0001' AS OrderCode, 'P002-TRG-M' AS Sku, 290000 AS UnitPrice, 2 AS Quantity
            UNION ALL SELECT 'AMDEMO0001', 'P007-JEA-L', 640000, 1
            UNION ALL SELECT 'AMDEMO0002', 'P014-TRG-S', 890000, 1
            UNION ALL SELECT 'AMDEMO0003', 'P010-DEN-M', 520000, 1
            UNION ALL SELECT 'AMDEMO0003', 'P004-BE-M', 520000, 1
            UNION ALL SELECT 'AMDEMO0004', 'P024-NAV-L', 420000, 2
            UNION ALL SELECT 'AMDEMO0004', 'P027-BE-L', 560000, 1
            UNION ALL SELECT 'AMDEMO0005', 'P021-TRG-L', 590000, 1
            UNION ALL SELECT 'AMDEMO0006', 'P025-DEN-M', 260000, 2
            UNION ALL SELECT 'AMDEMO0007', 'P018-DEN-S', 1290000, 1
            UNION ALL SELECT 'AMDEMO0008', 'P030-DEN-M', 890000, 1
            UNION ALL SELECT 'AMDEMO0009', 'P012-JEA-M', 480000, 1
            UNION ALL SELECT 'AMDEMO0010', 'P031-NAV-L', 750000, 1
            UNION ALL SELECT 'AMDEMO0010', 'P029-DEN-L', 290000, 1
            UNION ALL SELECT 'AMDEMO0011', 'P019-XAM-M', 1890000, 1
            UNION ALL SELECT 'AMDEMO0012', 'P006-BE-M', 590000, 1
            UNION ALL SELECT 'AMDEMO0012', 'P009-BE-M', 380000, 1
            UNION ALL SELECT 'AMDEMO0013', 'P015-HPH-S', 790000, 1
            UNION ALL SELECT 'AMDEMO0014', 'P022-BE-M', 540000, 2
            UNION ALL SELECT 'AMDEMO0015', 'P025-XAM-M', 260000, 1
            UNION ALL SELECT 'AMDEMO0016', 'P005-DEN-S', 250000, 1
            UNION ALL SELECT 'AMDEMO0016', 'P002-HPH-M', 290000, 1
        ) AS v
        JOIN Orders AS o ON o.OrderCode = v.OrderCode
        JOIN ProductVariants AS pv ON pv.Sku = v.Sku
        JOIN Products AS p ON p.ProductId = pv.ProductId;

        -- 10. [UC04] Lịch sử chuyển trạng thái
        INSERT INTO OrderStatusHistory (OrderId, FromStatus, ToStatus, ChangedByUserId, Note, ChangedAt)
        SELECT o.OrderId, v.FromStatus, v.ToStatus,
               CASE v.Actor WHEN 'admin' THEN v_admin_id ELSE o.UserId END, v.Note, DATE_SUB(v_now, INTERVAL v.H HOUR)
        FROM (
            SELECT 'AMDEMO0001' AS OrderCode, NULL AS FromStatus, 'PENDING' AS ToStatus, 'customer' AS Actor, 'Khách đặt hàng' AS Note, 720 AS H
            UNION ALL SELECT 'AMDEMO0001', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 718
            UNION ALL SELECT 'AMDEMO0001', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 700
            UNION ALL SELECT 'AMDEMO0001', 'SHIPPING', 'DELIVERED', 'admin', 'Giao hàng thành công', 660
            UNION ALL SELECT 'AMDEMO0002', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 600
            UNION ALL SELECT 'AMDEMO0002', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 599
            UNION ALL SELECT 'AMDEMO0002', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 590
            UNION ALL SELECT 'AMDEMO0002', 'SHIPPING', 'DELIVERED', 'admin', 'Giao hàng thành công', 560
            UNION ALL SELECT 'AMDEMO0003', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 480
            UNION ALL SELECT 'AMDEMO0003', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 478
            UNION ALL SELECT 'AMDEMO0003', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 460
            UNION ALL SELECT 'AMDEMO0003', 'SHIPPING', 'DELIVERED', 'admin', 'Giao hàng thành công', 420
            UNION ALL SELECT 'AMDEMO0004', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 450
            UNION ALL SELECT 'AMDEMO0004', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 448
            UNION ALL SELECT 'AMDEMO0004', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 430
            UNION ALL SELECT 'AMDEMO0004', 'SHIPPING', 'DELIVERED', 'admin', 'Giao hàng thành công', 390
            UNION ALL SELECT 'AMDEMO0005', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 400
            UNION ALL SELECT 'AMDEMO0005', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 399
            UNION ALL SELECT 'AMDEMO0005', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 390
            UNION ALL SELECT 'AMDEMO0005', 'SHIPPING', 'DELIVERED', 'admin', 'Giao hàng thành công', 350
            UNION ALL SELECT 'AMDEMO0006', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 350
            UNION ALL SELECT 'AMDEMO0006', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 349
            UNION ALL SELECT 'AMDEMO0006', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 340
            UNION ALL SELECT 'AMDEMO0006', 'SHIPPING', 'DELIVERED', 'admin', 'Giao hàng thành công', 300
            UNION ALL SELECT 'AMDEMO0006', 'DELIVERED', 'RETURNED', 'admin', 'Khách trả hàng vì không vừa size, shop đã nhận lại hàng và hoàn tiền', 250
            UNION ALL SELECT 'AMDEMO0007', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 300
            UNION ALL SELECT 'AMDEMO0007', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 299
            UNION ALL SELECT 'AMDEMO0007', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 290
            UNION ALL SELECT 'AMDEMO0007', 'SHIPPING', 'DELIVERED', 'admin', 'Giao hàng thành công', 250
            UNION ALL SELECT 'AMDEMO0008', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 250
            UNION ALL SELECT 'AMDEMO0008', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 249
            UNION ALL SELECT 'AMDEMO0008', 'CONFIRMED', 'CANCELLED', 'admin', 'Khách đổi ý, yêu cầu hủy sau khi đã thanh toán. Cần hoàn tiền cho khách', 230
            UNION ALL SELECT 'AMDEMO0009', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 200
            UNION ALL SELECT 'AMDEMO0009', 'PENDING', 'CANCELLED', 'customer', 'Khách tự hủy khi đơn chưa được xác nhận', 190
            UNION ALL SELECT 'AMDEMO0010', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 150
            UNION ALL SELECT 'AMDEMO0010', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 148
            UNION ALL SELECT 'AMDEMO0010', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 130
            UNION ALL SELECT 'AMDEMO0010', 'SHIPPING', 'DELIVERED', 'admin', 'Giao hàng thành công', 90
            UNION ALL SELECT 'AMDEMO0011', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 60
            UNION ALL SELECT 'AMDEMO0011', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 58
            UNION ALL SELECT 'AMDEMO0011', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 30
            UNION ALL SELECT 'AMDEMO0012', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 48
            UNION ALL SELECT 'AMDEMO0012', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 47
            UNION ALL SELECT 'AMDEMO0012', 'CONFIRMED', 'SHIPPING', 'admin', 'Đã tạo vận đơn, bàn giao đơn vị vận chuyển', 24
            UNION ALL SELECT 'AMDEMO0013', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 20
            UNION ALL SELECT 'AMDEMO0013', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 19
            UNION ALL SELECT 'AMDEMO0014', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 12
            UNION ALL SELECT 'AMDEMO0014', 'PENDING', 'CONFIRMED', 'admin', 'Admin xác nhận đơn, trừ tồn kho', 10
            UNION ALL SELECT 'AMDEMO0015', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 5
            UNION ALL SELECT 'AMDEMO0016', NULL, 'PENDING', 'customer', 'Khách đặt hàng', 2
        ) AS v
        JOIN Orders AS o ON o.OrderCode = v.OrderCode;

        -- 11. [UC06] Thanh toán
        INSERT INTO Payments (OrderId, Provider, PaymentRef, Amount, Status, GatewayTxnNo, GatewayResponseCode, PaidAt, RefundedAt, CreatedAt, UpdatedAt)
        SELECT o.OrderId, v.Provider, v.PaymentRef, o.TotalAmount, v.Status, v.GatewayTxnNo, v.RespCode,
               DATE_SUB(v_now, INTERVAL v.PaidH HOUR), DATE_SUB(v_now, INTERVAL v.RefundH HOUR), DATE_SUB(v_now, INTERVAL v.CreatedH HOUR), DATE_SUB(v_now, INTERVAL v.UpdatedH HOUR)
        FROM (
            SELECT 'AMDEMO0001' AS OrderCode, 'COD' AS Provider, NULL AS PaymentRef, 'PAID' AS Status, NULL AS GatewayTxnNo, NULL AS RespCode, 660 AS PaidH, NULL AS RefundH, 720 AS CreatedH, 660 AS UpdatedH
            UNION ALL SELECT 'AMDEMO0002', 'MOCK', '2610000002', 'PAID', 'MOCK37941493', '00', 600, NULL, 600, 560
            UNION ALL SELECT 'AMDEMO0003', 'COD', NULL, 'PAID', NULL, NULL, 420, NULL, 480, 420
            UNION ALL SELECT 'AMDEMO0004', 'COD', NULL, 'PAID', NULL, NULL, 390, NULL, 450, 390
            UNION ALL SELECT 'AMDEMO0005', 'MOCK', '2610000005', 'PAID', 'MOCK41963428', '00', 400, NULL, 400, 350
            UNION ALL SELECT 'AMDEMO0006', 'COD', NULL, 'REFUNDED', NULL, NULL, 300, 240, 350, 250
            UNION ALL SELECT 'AMDEMO0007', 'MOCK', '2610000007', 'PAID', 'MOCK10618785', '00', 300, NULL, 300, 250
            UNION ALL SELECT 'AMDEMO0008', 'MOCK', '2610000008', 'PAID', 'MOCK94538503', '00', 250, NULL, 250, 230
            UNION ALL SELECT 'AMDEMO0009', 'COD', NULL, 'CANCELLED', NULL, NULL, NULL, NULL, 200, 190
            UNION ALL SELECT 'AMDEMO0010', 'COD', NULL, 'PAID', NULL, NULL, 90, NULL, 150, 90
            UNION ALL SELECT 'AMDEMO0011', 'COD', NULL, 'PENDING', NULL, NULL, NULL, NULL, 60, 30
            UNION ALL SELECT 'AMDEMO0012', 'MOCK', '2610000012', 'PAID', 'MOCK17089988', '00', 48, NULL, 48, 24
            UNION ALL SELECT 'AMDEMO0013', 'MOCK', '2610000013', 'PAID', 'MOCK37068859', '00', 20, NULL, 20, 19
            UNION ALL SELECT 'AMDEMO0014', 'COD', NULL, 'PENDING', NULL, NULL, NULL, NULL, 12, 10
            UNION ALL SELECT 'AMDEMO0015', 'COD', NULL, 'PENDING', NULL, NULL, NULL, NULL, 5, 5
            UNION ALL SELECT 'AMDEMO0016', 'MOCK', '2610000016', 'PENDING', NULL, NULL, NULL, NULL, 2, 2
        ) AS v
        JOIN Orders AS o ON o.OrderCode = v.OrderCode;

        -- 12. Vận đơn
        INSERT INTO Shippings (OrderId, Carrier, TrackingCode, Status, CreatedByUserId, ShippedAt, DeliveredAt)
        SELECT o.OrderId, v.Carrier, v.TrackingCode, v.Status, v_admin_id, DATE_SUB(v_now, INTERVAL v.ShippedH HOUR), DATE_SUB(v_now, INTERVAL v.DeliveredH HOUR)
        FROM (
            SELECT 'AMDEMO0001' AS OrderCode, 'Viettel Post' AS Carrier, 'VTP260000137' AS TrackingCode, 'DELIVERED' AS Status, 700 AS ShippedH, 660 AS DeliveredH
            UNION ALL SELECT 'AMDEMO0002', 'J&T Express', 'JT260000274', 'DELIVERED', 590, 560
            UNION ALL SELECT 'AMDEMO0003', 'Giao Hàng Tiết Kiệm', 'GHTK260000411', 'DELIVERED', 460, 420
            UNION ALL SELECT 'AMDEMO0004', 'Giao Hàng Nhanh', 'GHN260000548', 'DELIVERED', 430, 390
            UNION ALL SELECT 'AMDEMO0005', 'Viettel Post', 'VTP260000685', 'DELIVERED', 390, 350
            UNION ALL SELECT 'AMDEMO0006', 'J&T Express', 'JT260000822', 'RETURNED', 340, 300
            UNION ALL SELECT 'AMDEMO0007', 'Giao Hàng Tiết Kiệm', 'GHTK260000959', 'DELIVERED', 290, 250
            UNION ALL SELECT 'AMDEMO0010', 'J&T Express', 'JT260001370', 'DELIVERED', 130, 90
            UNION ALL SELECT 'AMDEMO0011', 'Giao Hàng Tiết Kiệm', 'GHTK260001507', 'SHIPPING', 30, NULL
            UNION ALL SELECT 'AMDEMO0012', 'Giao Hàng Nhanh', 'GHN260001644', 'SHIPPING', 24, NULL
        ) AS v
        JOIN Orders AS o ON o.OrderCode = v.OrderCode;

        -- 13. [UC04] Nhật ký kho
        INSERT INTO InventoryLogs (VariantId, OrderId, Delta, StockAfter, Reason, CreatedByUserId, CreatedAt)
        SELECT pv.VariantId, o.OrderId, v.Delta, v.StockAfter, v.Reason, v_admin_id, DATE_SUB(v_now, INTERVAL v.H HOUR)
        FROM (
            SELECT 'P002-TRG-M' AS Sku, 'AMDEMO0001' AS OrderCode, -2 AS Delta, 17 AS StockAfter, 'ORDER_CONFIRM' AS Reason, 718 AS H
            UNION ALL SELECT 'P007-JEA-L', 'AMDEMO0001', -1, 7, 'ORDER_CONFIRM', 718
            UNION ALL SELECT 'P014-TRG-S', 'AMDEMO0002', -1, 12, 'ORDER_CONFIRM', 599
            UNION ALL SELECT 'P004-BE-M', 'AMDEMO0003', -1, 17, 'ORDER_CONFIRM', 478
            UNION ALL SELECT 'P010-DEN-M', 'AMDEMO0003', -1, 19, 'ORDER_CONFIRM', 478
            UNION ALL SELECT 'P024-NAV-L', 'AMDEMO0004', -2, 10, 'ORDER_CONFIRM', 448
            UNION ALL SELECT 'P027-BE-L', 'AMDEMO0004', -1, 12, 'ORDER_CONFIRM', 448
            UNION ALL SELECT 'P021-TRG-L', 'AMDEMO0005', -1, 17, 'ORDER_CONFIRM', 399
            UNION ALL SELECT 'P025-DEN-M', 'AMDEMO0006', -2, 16, 'ORDER_CONFIRM', 349
            UNION ALL SELECT 'P018-DEN-S', 'AMDEMO0007', -1, 10, 'ORDER_CONFIRM', 299
            UNION ALL SELECT 'P025-DEN-M', 'AMDEMO0006', 2, 18, 'ORDER_RETURN', 250
            UNION ALL SELECT 'P030-DEN-M', 'AMDEMO0008', -1, 10, 'ORDER_CONFIRM', 249
            UNION ALL SELECT 'P030-DEN-M', 'AMDEMO0008', 1, 11, 'ORDER_CANCEL', 230
            UNION ALL SELECT 'P029-DEN-L', 'AMDEMO0010', -1, 16, 'ORDER_CONFIRM', 148
            UNION ALL SELECT 'P031-NAV-L', 'AMDEMO0010', -1, 16, 'ORDER_CONFIRM', 148
            UNION ALL SELECT 'P019-XAM-M', 'AMDEMO0011', -1, 12, 'ORDER_CONFIRM', 58
            UNION ALL SELECT 'P006-BE-M', 'AMDEMO0012', -1, 5, 'ORDER_CONFIRM', 47
            UNION ALL SELECT 'P009-BE-M', 'AMDEMO0012', -1, 5, 'ORDER_CONFIRM', 47
            UNION ALL SELECT 'P015-HPH-S', 'AMDEMO0013', -1, 8, 'ORDER_CONFIRM', 19
            UNION ALL SELECT 'P022-BE-M', 'AMDEMO0014', -2, 10, 'ORDER_CONFIRM', 10
        ) AS v
        JOIN ProductVariants AS pv ON pv.Sku = v.Sku
        JOIN Orders AS o ON o.OrderCode = v.OrderCode;

        -- 14. [UC09] Đánh giá sản phẩm
        INSERT INTO Reviews (ProductId, UserId, OrderItemId, Rating, Title, Comment, CreatedAt)
        SELECT oi.ProductId, o.UserId, oi.OrderItemId, v.Rating, v.Title, v.Comment, DATE_SUB(v_now, INTERVAL v.H HOUR)
        FROM (
            SELECT 'AMDEMO0001' AS OrderCode, 'P002-TRG-M' AS Sku, 5 AS Rating, 'Vải mềm, mặc thoải mái' AS Title, 'Cotton dày vừa, form suông đúng như mô tả. Mình cao 1m60 mặc size M vừa vặn.' AS Comment, 640 AS H
            UNION ALL SELECT 'AMDEMO0001', 'P007-JEA-L', 4, 'Quần đẹp nhưng hơi dài', 'Ống đứng, lên dáng đẹp. Mình thấp nên phải lên gấu thêm.', 640
            UNION ALL SELECT 'AMDEMO0003', 'P010-DEN-M', 5, 'Chân váy dễ phối', 'Dài ngang gối, khóa kéo êm. Phối với áo sơ mi rất hợp.', 400
            UNION ALL SELECT 'AMDEMO0007', 'P018-DEN-S', 5, 'Blazer đứng dáng', 'Vải dày vừa, vai độn nhẹ nên đứng form. Mặc đi làm rất ổn.', 230
            UNION ALL SELECT 'AMDEMO0004', 'P024-NAV-L', 4, 'Polo đúng size', 'Cổ bo gân gọn, màu navy đậm giống ảnh. Giao hàng nhanh.', 370
            UNION ALL SELECT 'AMDEMO0005', 'P021-TRG-L', 5, 'Sơ mi mặc đi làm ổn', 'Vải Oxford dày, ủi phẳng dễ. Cổ button-down gọn.', 330
        ) AS v
        JOIN Orders AS o ON o.OrderCode = v.OrderCode
        JOIN OrderItems AS oi ON oi.OrderId = o.OrderId AND oi.Sku = v.Sku;

        COMMIT;

        SELECT
            (SELECT COUNT(*) FROM Users)           AS Users,
            (SELECT COUNT(*) FROM Categories)      AS Categories,
            (SELECT COUNT(*) FROM Products)        AS Products,
            (SELECT COUNT(*) FROM ProductImages)   AS ProductImages,
            (SELECT COUNT(*) FROM ProductVariants) AS ProductVariants,
            (SELECT COUNT(*) FROM Discounts)       AS Discounts,
            (SELECT COUNT(*) FROM Orders)          AS Orders,
            (SELECT COUNT(*) FROM Reviews)         AS Reviews;
    END IF;
END$$

DELIMITER ;

CALL sp_seed_demo_data();
DROP PROCEDURE sp_seed_demo_data;