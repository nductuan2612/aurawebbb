-- ============================================================================
-- AURA MODA - Website bán quần áo thời trang (kiểu IVY moda)
-- File    : 01_schema.sql   (phiên bản MySQL)
-- Yêu cầu : MySQL 5.7 trở lên (bắt buộc cần cho CHECK constraint được THỰC SỰ áp dụng;
--           trước 8.0.16, MySQL chỉ phân tích cú pháp CHECK mà bỏ qua, không báo lỗi).
-- Chạy    : Dùng MySQL Workbench (mở file, nhấn biểu tượng tia sét để chạy cả file),
--           hoặc dòng lệnh:  mysql -u root -p < 01_schema.sql
-- Lưu ý   : Script KHÔNG xóa dữ liệu. Dùng CREATE TABLE IF NOT EXISTS nên chạy lại
--           nhiều lần vẫn an toàn.
-- Mã UC   : Mỗi bảng ghi rõ mã Use Case mà nó phục vụ.
--           [UC01] Tài khoản        [UC04] Đơn hàng + kho
--           [UC05] Mã giảm giá      [UC06] Thanh toán
--           [UC09] Đánh giá         [UC12] Quản lý mã giảm giá (Admin)
-- Mã hóa  : Lưu file ở dạng UTF-8 để MySQL đọc đúng tiếng Việt.
--
-- GHI CHÚ CHUYỂN ĐỔI TỪ SQL SERVER SANG MYSQL (để bạn đối chiếu khi kiểm tra):
--   - Không còn "chỉ mục duy nhất có điều kiện" (filtered unique index) như SQL Server.
--     MySQL thay bằng CỘT SINH (generated column): cột chỉ có giá trị khi điều kiện đúng,
--     NULL khi điều kiện sai, rồi đặt UNIQUE KEY trên cột đó. MySQL coi mỗi NULL là
--     khác biệt (không đụng nhau), nên hiệu quả giống hệt chỉ mục lọc của SQL Server.
--   - Một số chỉ mục duy nhất nhiều cột (ví dụ Provider + PaymentRef) không cần cột sinh,
--     vì MySQL vốn đã coi NULL trong CHỈ MỘT cột của khóa duy nhất là không xung đột.
--   - Trigger dùng SIGNAL SQLSTATE thay cho THROW của T-SQL.
--   - Cột sinh LineTotal dùng GENERATED ALWAYS AS (...) STORED thay cho "AS (...) PERSISTED".
-- ============================================================================

CREATE DATABASE IF NOT EXISTS duytrans_ndt  -- ivy_moda_shop
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; -- _ai_ci: không phân biệt hoa/thường và dấu, giúp tìm kiếm "ao so mi" ra "Áo sơ mi"
USE duytrans_ndt; -- ivy_moda_shop

-- ----------------------------------------------------------------------------
-- [UC01] Users: tài khoản và phân quyền (CUSTOMER = Khách hàng, ADMIN = Quản trị viên)
-- PasswordHash lưu chuỗi bcrypt (60 ký tự), không bao giờ lưu mật khẩu gốc.
-- ConsentGivenAt ghi lại thời điểm khách tích đồng ý xử lý dữ liệu cá nhân.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Users (
    UserId           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    Email            VARCHAR(255)  NOT NULL,
    PasswordHash     VARCHAR(100)  NOT NULL,
    FullName         VARCHAR(100)  NOT NULL,
    Phone            VARCHAR(20)   NULL,
    DateOfBirth      DATE          NULL,
    Role             VARCHAR(20)   NOT NULL DEFAULT 'CUSTOMER',
    IsActive         TINYINT(1)    NOT NULL DEFAULT 1,
    ConsentGivenAt   DATETIME      NULL,
    ConsentVersion   VARCHAR(20)   NULL,
    FailedLoginCount INT           NOT NULL DEFAULT 0,
    LockedUntil      DATETIME      NULL,
    LastLoginAt      DATETIME      NULL,
    CreatedAt        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UQ_Users_Email (Email),
    CONSTRAINT CK_Users_Role CHECK (Role IN ('CUSTOMER', 'ADMIN'))
) ENGINE=InnoDB;

-- Đảm bảo bảng cha và cột khóa có cùng engine/kiểu dữ liệu khi chạy lại
-- trên CSDL đã được tạo từ phiên bản cũ (tránh lỗi 1215 của khóa ngoại).
ALTER TABLE `Users` ENGINE = InnoDB;
ALTER TABLE `Users`
    MODIFY `UserId` INT UNSIGNED NOT NULL AUTO_INCREMENT;

-- [UC01] Addresses: sổ địa chỉ giao hàng của khách.
-- District cho phép NULL vì nhiều địa phương đã bỏ cấp quận/huyện.
-- Chỉ có tối đa một địa chỉ mặc định cho mỗi khách (cột sinh + chỉ mục duy nhất).
CREATE TABLE IF NOT EXISTS Addresses (
    AddressId     INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    UserId        INT UNSIGNED  NOT NULL,
    RecipientName VARCHAR(100)  NOT NULL,
    Phone         VARCHAR(20)   NOT NULL,
    Province      VARCHAR(100)  NOT NULL,
    District      VARCHAR(100)  NULL,
    Ward          VARCHAR(100)  NOT NULL,
    StreetAddress VARCHAR(255)  NOT NULL,
    IsDefault     TINYINT(1)    NOT NULL DEFAULT 0,
    CreatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Chỉ NULL khi IsDefault = 0, nên mỗi UserId chỉ có tối đa một dòng IsDefault = 1.
    DefaultFlag   INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN IsDefault = 1 THEN UserId ELSE NULL END) STORED,
    CONSTRAINT FK_Addresses_Users FOREIGN KEY (`UserId`) REFERENCES `Users` (`UserId`) ON DELETE CASCADE,
    KEY IX_Addresses_User (UserId),
    UNIQUE KEY UX_Addresses_OneDefault (DefaultFlag)
) ENGINE=InnoDB;

-- Categories: danh mục, hỗ trợ cấp cha - con (ví dụ Nữ > Váy).
CREATE TABLE IF NOT EXISTS Categories (
    CategoryId  INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ParentId    INT UNSIGNED  NULL,
    Name        VARCHAR(100)  NOT NULL,
    Slug        VARCHAR(120)  NOT NULL,
    Description VARCHAR(500)  NULL,
    SortOrder   INT           NOT NULL DEFAULT 0,
    IsActive    TINYINT(1)    NOT NULL DEFAULT 1,
    CreatedAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UQ_Categories_Slug (Slug),
    CONSTRAINT FK_Categories_Parent FOREIGN KEY (ParentId) REFERENCES Categories(CategoryId),
    KEY IX_Categories_Parent (ParentId)
) ENGINE=InnoDB;

-- Products: thông tin chung của sản phẩm. Giá, size, màu, tồn kho nằm ở ProductVariants.
CREATE TABLE IF NOT EXISTS Products (
    ProductId   INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    CategoryId  INT UNSIGNED  NOT NULL,
    ProductCode VARCHAR(30)   NOT NULL,
    Name        VARCHAR(200)  NOT NULL,
    Slug        VARCHAR(220)  NOT NULL,
    Description TEXT          NULL,
    Material    VARCHAR(200)  NULL,
    IsFeatured  TINYINT(1)    NOT NULL DEFAULT 0,
    IsActive    TINYINT(1)    NOT NULL DEFAULT 1,
    CreatedAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UQ_Products_Code (ProductCode),
    UNIQUE KEY UQ_Products_Slug (Slug),
    CONSTRAINT FK_Products_Categories FOREIGN KEY (CategoryId) REFERENCES Categories(CategoryId),
    KEY IX_Products_Category (CategoryId, IsActive)
) ENGINE=InnoDB;

-- ProductImages: ảnh sản phẩm. Ảnh có SortOrder nhỏ nhất là ảnh chính, ảnh kế tiếp hiện khi rê chuột.
CREATE TABLE IF NOT EXISTS ProductImages (
    ImageId   INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ProductId INT UNSIGNED  NOT NULL,
    ImageUrl  VARCHAR(300)  NOT NULL,
    AltText   VARCHAR(200)  NULL,
    SortOrder INT           NOT NULL DEFAULT 0,
    CONSTRAINT FK_ProductImages_Products FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE CASCADE,
    KEY IX_ProductImages_Product (ProductId, SortOrder)
) ENGINE=InnoDB;

-- ProductVariants: biến thể theo (size, màu). Mỗi biến thể có SKU, giá và tồn kho riêng.
-- CK_Variants_Stock chặn tồn kho âm ngay ở tầng CSDL, làm lớp bảo vệ cuối cùng chống bán quá số lượng.
CREATE TABLE IF NOT EXISTS ProductVariants (
    VariantId      INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ProductId      INT UNSIGNED  NOT NULL,
    Sku            VARCHAR(50)   NOT NULL,
    Size           VARCHAR(5)    NOT NULL,
    ColorName      VARCHAR(50)   NOT NULL,
    ColorHex       CHAR(7)       NOT NULL,
    Price          INT           NOT NULL,
    CompareAtPrice INT           NULL,
    StockQuantity  INT           NOT NULL DEFAULT 0,
    IsActive       TINYINT(1)    NOT NULL DEFAULT 1,
    CreatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UQ_Variants_Sku (Sku),
    UNIQUE KEY UQ_Variants_Combo (ProductId, Size, ColorName),
    CONSTRAINT FK_Variants_Products FOREIGN KEY (ProductId) REFERENCES Products(ProductId) ON DELETE CASCADE,
    CONSTRAINT CK_Variants_Size    CHECK (Size IN ('S', 'M', 'L', 'XL')),
    CONSTRAINT CK_Variants_Hex     CHECK (ColorHex REGEXP '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT CK_Variants_Price   CHECK (Price BETWEEN 0 AND 50000000),
    CONSTRAINT CK_Variants_Compare CHECK (CompareAtPrice IS NULL OR CompareAtPrice > Price),
    CONSTRAINT CK_Variants_Stock   CHECK (StockQuantity >= 0),
    KEY IX_Variants_Product (ProductId, IsActive, Size, ColorName, ColorHex, Price, StockQuantity)
) ENGINE=InnoDB;

-- [UC01] Carts: giỏ hàng. Khách vãng lai dùng GuestTokenHash (băm SHA-256 của cookie),
-- khách đã đăng nhập dùng UserId. Khi đăng nhập, giỏ vãng lai được gộp vào giỏ của tài khoản.
-- Mỗi giỏ thuộc đúng một chủ: hoặc UserId, hoặc GuestTokenHash (CHECK bên dưới).
-- UNIQUE KEY trên cột cho phép NULL: MySQL coi nhiều dòng NULL là không trùng nhau,
-- nên mỗi UserId (hay GuestTokenHash) khác NULL chỉ xuất hiện được đúng một lần.
CREATE TABLE IF NOT EXISTS Carts (
    CartId         INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    UserId         INT UNSIGNED  NULL,
    GuestTokenHash VARCHAR(64)   NULL,
    CreatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_Carts_Users FOREIGN KEY (UserId) REFERENCES Users(UserId) ON DELETE CASCADE,
    CONSTRAINT CK_Carts_Owner CHECK (
        (UserId IS NOT NULL AND GuestTokenHash IS NULL) OR
        (UserId IS NULL AND GuestTokenHash IS NOT NULL)),
    UNIQUE KEY UX_Carts_User (UserId),
    UNIQUE KEY UX_Carts_Guest (GuestTokenHash)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS CartItems (
    CartItemId INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    CartId     INT UNSIGNED  NOT NULL,
    VariantId  INT UNSIGNED  NOT NULL,
    Quantity   INT           NOT NULL,
    AddedAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UQ_CartItems_Variant (CartId, VariantId),
    CONSTRAINT FK_CartItems_Carts FOREIGN KEY (CartId) REFERENCES Carts(CartId) ON DELETE CASCADE,
    CONSTRAINT FK_CartItems_Variants FOREIGN KEY (VariantId) REFERENCES ProductVariants(VariantId),
    CONSTRAINT CK_CartItems_Qty CHECK (Quantity BETWEEN 1 AND 20)
) ENGINE=InnoDB;

-- [UC05][UC12] Discounts: mã giảm giá.
-- Điều kiện áp dụng: giá trị đơn tối thiểu (MinOrderValue), thời hạn (StartsAt - EndsAt),
-- số lượt dùng (UsageLimit, UsedCount). NULL ở UsageLimit nghĩa là không giới hạn lượt.
CREATE TABLE IF NOT EXISTS Discounts (
    DiscountId        INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    Code              VARCHAR(30)   NOT NULL,
    Description       VARCHAR(255)  NULL,
    DiscountType      VARCHAR(10)   NOT NULL,
    DiscountValue     INT           NOT NULL,
    MaxDiscountAmount INT           NULL,
    MinOrderValue     INT           NOT NULL DEFAULT 0,
    StartsAt          DATETIME      NOT NULL,
    EndsAt            DATETIME      NOT NULL,
    UsageLimit        INT           NULL,
    UsedCount         INT           NOT NULL DEFAULT 0,
    IsActive          TINYINT(1)    NOT NULL DEFAULT 1,
    CreatedAt         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UQ_Discounts_Code (Code),
    CONSTRAINT CK_Discounts_Type   CHECK (DiscountType IN ('PERCENT', 'FIXED')),
    CONSTRAINT CK_Discounts_Value  CHECK (DiscountValue > 0 AND (DiscountType <> 'PERCENT' OR DiscountValue <= 100)),
    CONSTRAINT CK_Discounts_Max    CHECK (MaxDiscountAmount IS NULL OR MaxDiscountAmount > 0),
    CONSTRAINT CK_Discounts_Min    CHECK (MinOrderValue >= 0),
    CONSTRAINT CK_Discounts_Period CHECK (EndsAt > StartsAt),
    CONSTRAINT CK_Discounts_Usage  CHECK (UsedCount >= 0 AND (UsageLimit IS NULL OR (UsageLimit > 0 AND UsedCount <= UsageLimit)))
) ENGINE=InnoDB;

-- [UC04] OrderStatuses: 6 trạng thái đơn hàng theo đề bài.
CREATE TABLE IF NOT EXISTS OrderStatuses (
    StatusCode VARCHAR(20) NOT NULL PRIMARY KEY,
    StatusName VARCHAR(50) NOT NULL,
    SortOrder  INT         NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO OrderStatuses (StatusCode, StatusName, SortOrder) VALUES
    ('PENDING',   'Chờ xác nhận',      1),
    ('CONFIRMED', 'Đã xác nhận',       2),
    ('SHIPPING',  'Đang giao',         3),
    ('DELIVERED', 'Đã giao',           4),
    ('CANCELLED', 'Đã hủy',            5),
    ('RETURNED',  'Trả hàng/Hoàn tiền', 6);

-- [UC04] Orders: đơn hàng.
-- Ship* là BẢN SAO địa chỉ giao hàng tại thời điểm đặt, nên sửa hoặc xóa địa chỉ trong sổ
-- địa chỉ sau này không làm thay đổi đơn cũ.
-- StockDeducted = 1 khi tồn kho đã bị trừ (lúc xác nhận), dùng để hoàn kho đúng một lần khi hủy.
-- ConsentGivenAt ghi lại việc khách đã tích đồng ý xử lý dữ liệu cá nhân khi đặt hàng.
CREATE TABLE IF NOT EXISTS Orders (
    OrderId           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    OrderCode         VARCHAR(30)   NOT NULL,
    UserId            INT UNSIGNED  NOT NULL,
    Status            VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    ShipRecipientName VARCHAR(100)  NOT NULL,
    ShipPhone         VARCHAR(20)   NOT NULL,
    ShipProvince      VARCHAR(100)  NOT NULL,
    ShipDistrict      VARCHAR(100)  NULL,
    ShipWard          VARCHAR(100)  NOT NULL,
    ShipStreet        VARCHAR(255)  NOT NULL,
    Note              VARCHAR(500)  NULL,
    Subtotal          INT           NOT NULL,
    DiscountId        INT UNSIGNED  NULL,
    DiscountCode      VARCHAR(30)   NULL,
    DiscountAmount    INT           NOT NULL DEFAULT 0,
    ShippingFee       INT           NOT NULL DEFAULT 0,
    TotalAmount       INT           NOT NULL,
    PaymentMethod     VARCHAR(10)   NOT NULL,
    StockDeducted     TINYINT(1)    NOT NULL DEFAULT 0,
    ConsentGivenAt    DATETIME      NOT NULL,
    CancelReason      VARCHAR(255)  NULL,
    PlacedAt          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ConfirmedAt       DATETIME      NULL,
    DeliveredAt       DATETIME      NULL,
    CancelledAt       DATETIME      NULL,
    UpdatedAt         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UX_Orders_Code (OrderCode),
    CONSTRAINT FK_Orders_Users     FOREIGN KEY (UserId) REFERENCES Users(UserId),
    CONSTRAINT FK_Orders_Status    FOREIGN KEY (Status) REFERENCES OrderStatuses(StatusCode),
    CONSTRAINT FK_Orders_Discounts FOREIGN KEY (DiscountId) REFERENCES Discounts(DiscountId),
    CONSTRAINT CK_Orders_Code    CHECK (CHAR_LENGTH(OrderCode) > 0),
    CONSTRAINT CK_Orders_Method  CHECK (PaymentMethod IN ('COD', 'ONLINE')),
    CONSTRAINT CK_Orders_Amounts CHECK (
        Subtotal >= 0 AND ShippingFee >= 0 AND DiscountAmount >= 0
        AND DiscountAmount <= Subtotal
        AND TotalAmount = Subtotal - DiscountAmount + ShippingFee),
    KEY IX_Orders_User (UserId, PlacedAt),
    KEY IX_Orders_Status (Status, PlacedAt),
    KEY IX_Orders_Delivered (DeliveredAt)
) ENGINE=InnoDB;

-- [UC04] OrderItems: dòng hàng của đơn.
-- UnitPrice là ĐƠN GIÁ TẠI THỜI ĐIỂM ĐẶT. Tên sản phẩm, SKU, size, màu cũng được sao chép sang,
-- vì vậy đổi giá hay sửa sản phẩm về sau không làm sai lệch đơn cũ.
CREATE TABLE IF NOT EXISTS OrderItems (
    OrderItemId INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    OrderId     INT UNSIGNED  NOT NULL,
    VariantId   INT UNSIGNED  NOT NULL,
    ProductId   INT UNSIGNED  NOT NULL,
    ProductName VARCHAR(200)  NOT NULL,
    Sku         VARCHAR(50)   NOT NULL,
    Size        VARCHAR(5)    NOT NULL,
    ColorName   VARCHAR(50)   NOT NULL,
    ImageUrl    VARCHAR(300)  NULL,
    UnitPrice   INT           NOT NULL,
    Quantity    INT           NOT NULL,
    LineTotal   INT GENERATED ALWAYS AS (UnitPrice * Quantity) STORED,
    CONSTRAINT FK_OrderItems_Orders   FOREIGN KEY (OrderId) REFERENCES Orders(OrderId),
    CONSTRAINT FK_OrderItems_Variants FOREIGN KEY (VariantId) REFERENCES ProductVariants(VariantId),
    CONSTRAINT FK_OrderItems_Products FOREIGN KEY (ProductId) REFERENCES Products(ProductId),
    CONSTRAINT CK_OrderItems_Qty   CHECK (Quantity > 0),
    CONSTRAINT CK_OrderItems_Price CHECK (UnitPrice >= 0),
    KEY IX_OrderItems_Order (OrderId),
    KEY IX_OrderItems_Variant (VariantId),
    KEY IX_OrderItems_Product (ProductId)
) ENGINE=InnoDB;

-- [UC04] OrderStatusHistory: lịch sử chuyển trạng thái. Mỗi lần đổi trạng thái thêm một dòng.
-- FromStatus = NULL ở dòng đầu tiên (lúc tạo đơn).
CREATE TABLE IF NOT EXISTS OrderStatusHistory (
    HistoryId       INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    OrderId         INT UNSIGNED  NOT NULL,
    FromStatus      VARCHAR(20)   NULL,
    ToStatus        VARCHAR(20)   NOT NULL,
    ChangedByUserId INT UNSIGNED  NULL,
    Note            VARCHAR(255)  NULL,
    ChangedAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_OSH_Orders FOREIGN KEY (OrderId) REFERENCES Orders(OrderId),
    CONSTRAINT FK_OSH_From   FOREIGN KEY (FromStatus) REFERENCES OrderStatuses(StatusCode),
    CONSTRAINT FK_OSH_To     FOREIGN KEY (ToStatus) REFERENCES OrderStatuses(StatusCode),
    CONSTRAINT FK_OSH_Users  FOREIGN KEY (ChangedByUserId) REFERENCES Users(UserId),
    KEY IX_OSH_Order (OrderId, ChangedAt)
) ENGINE=InnoDB;

-- [UC04] InventoryLogs: sổ nhật ký kho. Ghi mỗi lần trừ tồn (xác nhận đơn) hoặc hoàn tồn (hủy, trả hàng).
CREATE TABLE IF NOT EXISTS InventoryLogs (
    LogId           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    VariantId       INT UNSIGNED  NOT NULL,
    OrderId         INT UNSIGNED  NULL,
    Delta           INT           NOT NULL,
    StockAfter      INT           NOT NULL,
    Reason          VARCHAR(30)   NOT NULL,
    CreatedByUserId INT UNSIGNED  NULL,
    CreatedAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_InvLogs_Variants FOREIGN KEY (VariantId) REFERENCES ProductVariants(VariantId),
    CONSTRAINT FK_InvLogs_Orders   FOREIGN KEY (OrderId) REFERENCES Orders(OrderId),
    CONSTRAINT FK_InvLogs_Users    FOREIGN KEY (CreatedByUserId) REFERENCES Users(UserId),
    CONSTRAINT CK_InvLogs_Reason CHECK (Reason IN ('ORDER_CONFIRM', 'ORDER_CANCEL', 'ORDER_RETURN', 'ADMIN_ADJUST')),
    KEY IX_InvLogs_Variant (VariantId, CreatedAt)
) ENGINE=InnoDB;

-- [UC06] Payments: mỗi lần thanh toán là một dòng (một đơn có thể có nhiều lần thử).
-- PaymentRef là mã tham chiếu gửi sang cổng thanh toán (payOS orderCode hoặc vnp_TxnRef).
-- Idempotency: chỉ một dòng PAID cho mỗi đơn (UX_Payments_OnePaidPerOrder, qua cột sinh PaidOrderKey),
-- và một mã giao dịch của cổng chỉ gắn được vào một dòng (UX_Payments_GatewayTxn).
CREATE TABLE IF NOT EXISTS Payments (
    PaymentId           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    OrderId             INT UNSIGNED  NOT NULL,
    Provider            VARCHAR(10)   NOT NULL,
    PaymentRef          VARCHAR(40)   NULL,
    Amount              INT           NOT NULL,
    Status              VARCHAR(12)   NOT NULL DEFAULT 'PENDING',
    GatewayTxnNo        VARCHAR(64)   NULL,
    GatewayResponseCode VARCHAR(20)   NULL,
    CheckoutUrl         VARCHAR(1000) NULL,
    ExpiresAt           DATETIME      NULL,
    PaidAt              DATETIME      NULL,
    RefundedAt          DATETIME      NULL,
    CreatedAt           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Chỉ NULL khi Status <> 'PAID', nên mỗi OrderId chỉ có tối đa một dòng PAID.
    PaidOrderKey INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN Status = 'PAID' THEN OrderId END) STORED,
    CONSTRAINT FK_Payments_Orders FOREIGN KEY (OrderId) REFERENCES Orders(OrderId),
    CONSTRAINT CK_Payments_Provider CHECK (Provider IN ('COD', 'PAYOS', 'VNPAY', 'MOCK', 'SEPAY')),
    CONSTRAINT CK_Payments_Status   CHECK (Status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
    CONSTRAINT CK_Payments_Amount   CHECK (Amount >= 0),
    KEY IX_Payments_Order (OrderId),
    UNIQUE KEY UX_Payments_Ref (Provider, PaymentRef),
    UNIQUE KEY UX_Payments_GatewayTxn (Provider, GatewayTxnNo),
    UNIQUE KEY UX_Payments_OnePaidPerOrder (PaidOrderKey)
) ENGINE=InnoDB;

-- [UC06] PaymentWebhookLogs: nhật ký mọi lần cổng thanh toán gọi IPN/webhook, kể cả lần sai chữ ký
-- và lần gửi lặp. Outcome cho biết kết quả xử lý, ví dụ DUPLICATE là thông báo lặp đã được bỏ qua.
CREATE TABLE IF NOT EXISTS PaymentWebhookLogs (
    LogId          INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    Provider       VARCHAR(10)   NOT NULL,
    PaymentRef     VARCHAR(40)   NULL,
    GatewayTxnNo   VARCHAR(64)   NULL,
    SignatureValid TINYINT(1)    NOT NULL,
    Outcome        VARCHAR(30)   NOT NULL,
    RawPayload     TEXT          NULL,
    SourceIp       VARCHAR(64)   NULL,
    ReceivedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY IX_PWL_Ref (Provider, PaymentRef, ReceivedAt)
) ENGINE=InnoDB;

-- Shippings: vận đơn do Admin tạo cho đơn đã xác nhận. Mỗi đơn có tối đa một vận đơn.
-- [UC06] SepayTransactions: giao d?ch ng?n h?ng g?c do SePay g?i qua webhook.
-- SepayTransactionId l? kh?a duy nh?t ?? ch?ng x? l? l?p khi SePay retry webhook.
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

CREATE TABLE IF NOT EXISTS Shippings (
    ShippingId      INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    OrderId         INT UNSIGNED  NOT NULL,
    Carrier         VARCHAR(50)   NOT NULL,
    TrackingCode    VARCHAR(50)   NOT NULL,
    Status          VARCHAR(12)   NOT NULL DEFAULT 'SHIPPING',
    Note            VARCHAR(255)  NULL,
    CreatedByUserId INT UNSIGNED  NULL,
    ShippedAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    DeliveredAt     DATETIME      NULL,
    UNIQUE KEY UQ_Shippings_Order (OrderId),
    CONSTRAINT FK_Shippings_Orders FOREIGN KEY (OrderId) REFERENCES Orders(OrderId),
    CONSTRAINT FK_Shippings_Users  FOREIGN KEY (CreatedByUserId) REFERENCES Users(UserId),
    CONSTRAINT CK_Shippings_Status CHECK (Status IN ('SHIPPING', 'DELIVERED', 'RETURNED'))
) ENGINE=InnoDB;

-- [UC09] Reviews: đánh giá sản phẩm. OrderItemId là dòng hàng đã mua, duy nhất cho mỗi đánh giá,
-- nên một dòng hàng chỉ được đánh giá một lần.
-- Trigger bên dưới là lớp bảo vệ ở CSDL: chỉ chấp nhận khi đơn chứa dòng hàng đó thuộc về
-- chính người đánh giá và đang ở trạng thái "Đã giao" (DELIVERED).
CREATE TABLE IF NOT EXISTS Reviews (
    ReviewId    INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ProductId   INT UNSIGNED   NOT NULL,
    UserId      INT UNSIGNED   NOT NULL,
    OrderItemId INT UNSIGNED   NOT NULL,
    Rating      TINYINT UNSIGNED NOT NULL,
    Title       VARCHAR(100)   NULL,
    Comment     VARCHAR(1000)  NOT NULL,
    IsVisible   TINYINT(1)     NOT NULL DEFAULT 1,
    CreatedAt   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY UQ_Reviews_OrderItem (OrderItemId),
    CONSTRAINT FK_Reviews_Products   FOREIGN KEY (ProductId) REFERENCES Products(ProductId),
    CONSTRAINT FK_Reviews_Users      FOREIGN KEY (UserId) REFERENCES Users(UserId),
    CONSTRAINT FK_Reviews_OrderItems FOREIGN KEY (OrderItemId) REFERENCES OrderItems(OrderItemId),
    CONSTRAINT CK_Reviews_Rating CHECK (Rating BETWEEN 1 AND 5),
    KEY IX_Reviews_Product (ProductId, IsVisible, CreatedAt)
) ENGINE=InnoDB;

DROP TRIGGER IF EXISTS TR_Reviews_OnlyDeliveredOrders;

DELIMITER $$
CREATE TRIGGER TR_Reviews_OnlyDeliveredOrders
BEFORE INSERT ON Reviews
FOR EACH ROW
BEGIN
    -- [UC09] Từ chối nếu dòng hàng không tồn tại, không thuộc người đánh giá,
    -- không đúng sản phẩm, hoặc đơn chưa ở trạng thái "Đã giao".
    DECLARE v_status VARCHAR(20);
    DECLARE v_userId INT UNSIGNED;
    DECLARE v_productId INT UNSIGNED;

    SELECT o.Status, o.UserId, oi.ProductId
      INTO v_status, v_userId, v_productId
      FROM OrderItems oi
      JOIN Orders o ON o.OrderId = oi.OrderId
     WHERE oi.OrderItemId = NEW.OrderItemId;

    IF v_status IS NULL OR v_status <> 'DELIVERED' OR v_userId <> NEW.UserId OR v_productId <> NEW.ProductId THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '[UC09] Chỉ khách hàng có đơn ở trạng thái Đã giao mới được đánh giá sản phẩm này.';
    END IF;
END$$
DELIMITER ;

SELECT 'Hoàn tất: đã tạo CSDL ivy_moda_shop và các bảng. Chạy tiếp 02_seed.sql để nạp dữ liệu mẫu.' AS Thongbao;
