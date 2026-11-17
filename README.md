# AURA moda: website bán quần áo thời trang (kiểu IVY moda)

Đồ án Thương mại điện tử, Học viện Ngân hàng. Công nghệ: Node.js, Express, EJS, **MySQL 5.7+**, bcrypt.

## 1. Cài đặt

Yêu cầu: Node.js 18 trở lên, **MySQL 5.7 trở lên** (bản cộng đồng Community Server là đủ; các bản 5.7 trở xuống sẽ bỏ qua CHECK constraint hoặc không có LATERAL JOIN), MySQL Workbench hoặc dòng lệnh `mysql`, VS Code.

> Lưu ý: bản gốc của đồ án viết cho SQL Server (SSMS 22). Bản này đã chuyển toàn bộ CSDL và câu truy vấn sang MySQL. Nếu tài liệu học phần yêu cầu SQL Server, hãy kiểm tra lại với giảng viên trước khi nộp.

**Bước 1. Tạo CSDL.** Mở MySQL Workbench, kết nối vào server, mở lần lượt rồi chạy từng file (biểu tượng tia sét). Hoặc dùng dòng lệnh:

```
mysql -u root -p < sql/01_schema.sql
mysql -u root -p < sql/02_seed.sql
```

1. `sql/01_schema.sql`: tạo CSDL `ivy_moda_shop`, 18 bảng, ràng buộc, chỉ mục và trigger đánh giá. Chạy lại nhiều lần vẫn an toàn (`CREATE TABLE IF NOT EXISTS`).
2. `sql/02_seed.sql`: nạp 4 tài khoản, 11 danh mục, 32 sản phẩm, 276 biến thể, 64 ảnh, 6 mã giảm giá, 16 đơn hàng mẫu, 6 đánh giá. Nếu đã nạp rồi, script tự dừng.
3. `sql/03_create_app_user.sql` (khuyến nghị): tạo tài khoản `ivy_app` chỉ có quyền đọc và ghi. Đổi mật khẩu trong file trước khi chạy.

Khi mở file bằng Notepad/VS Code, lưu lại ở định dạng UTF-8 để tiếng Việt không bị lỗi font.

**Lưu ý về `DELIMITER`**: file `02_seed.sql` và `01_schema.sql` có khối trigger và stored procedure dùng `DELIMITER $$`. MySQL Workbench và dòng lệnh `mysql` hiểu cú pháp này; một số công cụ khác (ví dụ chạy từng câu bằng `mysql2` trong Node) thì không. Hãy chạy toàn bộ file bằng Workbench hoặc `mysql < file.sql`, không dán từng đoạn vào một công cụ khác.

**Bước 2. Cấu hình kết nối.** Sao chép `.env.example` thành `.env` rồi điền:

| Biến | Ý nghĩa |
|---|---|
| `SESSION_SECRET` | Chuỗi ngẫu nhiên từ 32 ký tự. Tạo bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DB_HOST`, `DB_PORT` | Mặc định `localhost` và `3306` |
| `DB_NAME` | Mặc định `ivy_moda_shop` (trùng tên CSDL trong `01_schema.sql`) |
| `DB_USER`, `DB_PASSWORD` | Ví dụ `ivy_app` và mật khẩu đã đặt ở file 03 |
| `DB_SSL` | Để `true` nếu CSDL trên máy chủ đám mây yêu cầu TLS; với MySQL trên máy cá nhân để `false` |

Nếu không kết nối được, server vẫn khởi động và in gợi ý cách sửa ra cửa sổ lệnh: kiểm tra dịch vụ MySQL đang chạy (`services.msc`, tên thường là `MySQL80`), đúng `DB_HOST`/`DB_PORT`, tường lửa cho phép cổng 3306, và tài khoản có quyền trên CSDL `ivy_moda_shop`.

**Bước 3. Chạy.**

```
npm install
npm start
```

Mở http://localhost:3000. Chạy ở chế độ tự khởi động lại khi sửa code: `npm run dev`.

**Bước 4. Ảnh sản phẩm (bạn tự cung cấp).** Đặt ảnh vào `public/images/products/` theo tên trong `public/images/products/DANH-SACH-ANH.md`: ảnh chính `P001.jpg`, ảnh phụ `P001_2.jpg` (hiện khi rê chuột), tỉ lệ khuyến nghị 3:4. Thiếu ảnh nào, website tự hiện ảnh minh họa mặc định. Dùng đuôi khác (png, webp) thì chạy lệnh `UPDATE ProductImages SET ImageUrl = REPLACE(ImageUrl, '.jpg', '.webp');` trong MySQL.

## 2. Tài khoản thử nghiệm

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị viên | `admin@example.com` | `Admin@123` |
| Khách hàng (có địa chỉ, có đơn) | `ha.nguyen@example.com` | `Customer@123` |
| Khách hàng (có địa chỉ, có đơn) | `an.tran@example.com` | `Customer@123` |
| Khách hàng (chưa có địa chỉ, chưa có đơn) | `mai.le@example.com` | `Customer@123` |

Mã giảm giá mẫu: `WELCOME10` (giảm 10%, tối đa 100.000₫, đơn từ 300.000₫), `GIAM50K` (giảm 50.000₫, đơn từ 500.000₫), `SALE20` (giảm 20%, tối đa 200.000₫, đơn từ 1.000.000₫). Ba mã để thử lỗi: `HETLUOT` (hết lượt), `HETHAN` (hết hạn), `SAPDIENRA` (chưa đến ngày).

Dữ liệu mẫu có sẵn các tình huống tồn kho: `P001-DEN-XL` và `P017-DOD-S` hết hàng, `P018-DEN-M` còn 1, `P001-TRG-M` còn 3, và sản phẩm `P032` hết sạch.

## 3. Bản đồ mã Use Case trong mã nguồn

Mọi chú thích đều có dạng `[UCxx]`, tìm bằng Ctrl+Shift+F.

| Mã | Nội dung | File chính |
|---|---|---|
| UC01 | Đăng ký, đăng nhập, đăng xuất, hồ sơ, sổ địa chỉ, gộp giỏ hàng vãng lai | `routes/auth.js`, `models/userModel.js`, `views/auth/`, `views/account/` |
| UC04 | Kiểm tra tồn kho khi thêm giỏ và đặt hàng, trừ kho khi xác nhận, hoàn kho khi hủy hoặc trả, 6 trạng thái, lịch sử chuyển trạng thái | `services/orderService.js`, `utils/orderStatus.js`, `models/cartModel.js` |
| UC05 | Mã giảm giá theo giá trị tối thiểu, thời hạn, số lượt | `utils/pricing.js`, `models/discountModel.js` |
| UC06 | COD, cổng thanh toán, kiểm tra chữ ký IPN, chống xử lý lặp | `services/paymentService.js`, `services/payment/`, `utils/payment/`, `routes/paymentHooks.js` |
| UC09 | Chỉ đơn "Đã giao" mới được đánh giá | `models/reviewModel.js`, trigger `TR_Reviews_OnlyDeliveredOrders` trong `sql/01_schema.sql` |
| UC12 | Quản trị mã giảm giá | `routes/admin/discounts.js` |

Tôi chỉ gắn các mã UC mà đề bài nêu. Các chức năng khác (danh mục, sản phẩm, báo cáo) không gắn mã, vì tôi không biết mã của chúng trong tài liệu học phần của bạn. Nếu tài liệu có mã cho các phần đó, hãy bổ sung chú thích.

## 4. Thanh toán online

`PAYMENT_PROVIDER` trong `.env` chọn cổng:

- `mock` (mặc định): cổng giả lập để demo. Có trang `/payment/mock/<mã>` cho phép mô phỏng thành công, thất bại, gửi lặp, sửa số tiền. Bị chặn khi `NODE_ENV=production`.
- `payos`: nhận tiền chuyển khoản vào tài khoản ngân hàng đã liên kết với payOS.
- `vnpay`: VNPay sandbox.

**Về tài khoản MB Bank của bạn.** MB Bank là ngân hàng, không phải cổng thanh toán có môi trường thử. Để website nhận tiền vào tài khoản MB, cần một cổng trung gian. Tôi viết sẵn payOS vì payOS liên kết với tài khoản ngân hàng cá nhân. Bạn cần tự đăng ký kênh thanh toán trên payOS, liên kết tài khoản MB, rồi điền `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` vào `.env` (không gửi các khóa này cho ai).

**Chưa kiểm chứng.** Phần giao tiếp payOS và VNPay được viết theo hiểu biết của tôi về tài liệu của họ. Môi trường tôi làm việc không truy cập được trang tài liệu và không có tài khoản cổng thật, nên chưa chạy thử với cổng thật. Trước khi nộp, hãy đối chiếu địa chỉ API, tên trường và cách ký trong `services/payment/providers/payos.js`, `vnpay.js` và `utils/payment/signature.js` với tài liệu mới nhất. Phần kiểm tra chữ ký, so số tiền và chống xử lý lặp (dùng chung cho mọi cổng) đã được kiểm thử bằng 55 test tự động.

Webhook của cổng thật chỉ gọi được địa chỉ công khai. Khi chạy trên localhost, dùng ngrok (đặt `APP_BASE_URL` thành địa chỉ ngrok) hoặc dùng cổng `mock`.

## 5. Kịch bản kiểm thử bắt buộc

Thực hiện lần lượt, ghi kết quả (ảnh chụp) vào báo cáo.

**A. Tài khoản [UC01]**

1. Mở `/register`: cả hai ô đồng ý **không được đánh dấu sẵn**. Bỏ trống ô đồng ý rồi bấm Đăng ký: bị từ chối (cả khi tắt kiểm tra của trình duyệt, vì server kiểm tra lại).
2. Đăng ký email đã có: báo "email đã được đăng ký". Mật khẩu `12345678` hoặc ngắn hơn 8 ký tự: bị từ chối.
3. Trong MySQL chạy `SELECT Email, PasswordHash FROM Users`: mật khẩu là chuỗi bcrypt bắt đầu bằng `$2a$12$`, không phải mật khẩu gốc.
4. Đăng nhập sai mật khẩu 5 lần: tài khoản khóa tạm 15 phút.
5. Khi chưa đăng nhập, thêm 2 sản phẩm vào giỏ, rồi đăng nhập: giỏ hàng vẫn còn và được gộp vào tài khoản.
6. Đăng xuất bằng nút trên đầu trang, mở lại `/orders`: bị chuyển về trang đăng nhập.
7. Vào `/account/addresses`: thêm, sửa, đặt mặc định, xóa địa chỉ. Địa chỉ mặc định không xóa được.

**B. Phân quyền `/admin`**

1. Đăng nhập `ha.nguyen@example.com`, mở `/admin` và `/admin/orders`: trang 403.
2. Chưa đăng nhập, mở `/admin`: chuyển tới đăng nhập. Đăng nhập admin xong quay về đúng trang.
3. Khách hàng gửi POST tới `/admin/orders/<mã>/status` (dùng công cụ như Postman): bị chặn 403. Test tự động: `test/adminGuard.test.js`.

**C. Tồn kho và đặt hàng [UC04]**

1. Mở sản phẩm `P001`, chọn màu Đen: ô size XL hiện "Hết hàng" và không chọn được. Chọn Trắng, size M: hiện "Còn 3".
2. Thêm 5 cái `P001` Trắng size M vào giỏ: báo "Không đủ hàng, kho hiện chỉ còn 3".
3. Đặt hàng COD: đơn ở "Chờ xác nhận", **tồn kho chưa bị trừ**. Đơn lưu đơn giá tại lúc đặt và bản sao địa chỉ.
4. Trong admin, đổi giá một biến thể và sửa địa chỉ trong sổ địa chỉ: đơn cũ không đổi giá, không đổi địa chỉ.
5. Admin xác nhận đơn: tồn kho **bị trừ**, có dòng mới trong `InventoryLogs` (lý do `ORDER_CONFIRM`) và `OrderStatusHistory`.
6. Admin chuyển "Đang giao": bắt buộc chọn đơn vị vận chuyển và nhập mã vận đơn (tạo vận đơn). Sau đó "Đã giao thành công": đơn COD ghi nhận đã thu tiền.
7. Hủy một đơn đã xác nhận: tồn kho **được hoàn lại**, lượt dùng mã giảm giá được trả lại. Hủy đơn "Chờ xác nhận" bằng tài khoản khách: được, không đụng kho.
8. Khách hủy đơn đã "Đã xác nhận": không có nút hủy; gửi POST thủ công cũng bị từ chối.
9. Đủ 6 trạng thái: dữ liệu mẫu đã có sẵn đơn ở cả 6 trạng thái, xem tại `/admin/orders`.
10. Hai trình duyệt cùng mở một đơn, một bên xác nhận rồi bên kia bấm xác nhận: bên sau báo "trạng thái đơn đã thay đổi".

**D. Mã giảm giá [UC05][UC12]**

1. Ở trang đặt hàng, nhập `WELCOME10` với đơn dưới 300.000₫: báo cần đạt tối thiểu. Nhập `HETHAN`, `HETLUOT`, `SAPDIENRA`, mã sai: mỗi mã báo một lý do riêng.
2. Nhập `WELCOME10` với đơn hợp lệ: tổng tiền cập nhật ngay; phí giao hàng miễn phí khi đơn sau giảm giá từ 500.000₫.
3. Admin tạo mã mới (phần trăm và cố định), sửa, tạm dừng; mã tạm dừng khách không dùng được.

**E. Thanh toán [UC06]** (với `PAYMENT_PROVIDER=mock`)

1. Đặt hàng chọn "Thanh toán online", bấm các nút trên trang cổng demo:
   - "Thanh toán thành công": đơn chuyển "Đã thanh toán".
   - "Gửi thông báo hai lần": lần hai trả `DUPLICATE`, không ghi nhận lần nữa (**idempotency**).
   - "Sửa số tiền sau khi ký": trả `INVALID_SIGNATURE`, dữ liệu không đổi (**kiểm tra chữ ký**).
   - "Sai số tiền": trả `AMOUNT_MISMATCH`.
2. Trong admin, mở đơn và xem "Nhật ký thông báo từ cổng thanh toán": mọi lần gọi đều được ghi, kể cả sai chữ ký.
3. Từ dòng lệnh: `node scripts/simulate-ipn.js <paymentRef> <số tiền> replay`.
4. Đơn thanh toán online chưa nhận tiền: admin không xác nhận được. Hủy một đơn đã thanh toán online: đơn hiện "Cần hoàn tiền", admin bấm "Đã hoàn tiền" sau khi chuyển tiền thật.
5. Test tự động: `npm test` (chữ ký, xử lý lặp, tình huống thanh toán muộn, trả tiền hai lần).

**F. Đánh giá [UC09]**

1. Đăng nhập `ha.nguyen@example.com`. Sản phẩm `P014` (Đầm sơ mi thắt eo) và `P004` (Áo len mỏng cổ V) thuộc đơn "Đã giao" và chưa được đánh giá, nên trang sản phẩm hiện form "Viết đánh giá". Sản phẩm `P019`, `P015`, `P025` thuộc đơn chưa giao (đang giao, đã xác nhận, chờ xác nhận) nên **không** hiện form. `P002` đã được đánh giá trong dữ liệu mẫu nên cũng không hiện form lần nữa.
2. Gửi POST tới `/reviews` với `orderItemId` của đơn chưa giao hoặc của người khác: bị từ chối.
3. Ghi thẳng vào bảng trong MySQL, ví dụ `INSERT INTO Reviews ...` với đơn chưa giao: trigger `TR_Reviews_OnlyDeliveredOrders` chặn bằng `SIGNAL SQLSTATE '45000'` (mã lỗi 1644, thông báo có tiền tố `[UC09]`).
4. Mỗi dòng hàng chỉ đánh giá được một lần.

**G. Pháp lý và bảo mật**

1. Chân trang có đủ bốn liên kết: thông tin người bán, điều khoản, bảo vệ dữ liệu cá nhân, chính sách đổi trả. Ô đồng ý ở trang đặt hàng không đánh dấu sẵn và đặt hàng không được nếu chưa tích.
2. SQL Injection: ô tìm kiếm nhập `' OR 1=1 --` và `%`: không lỗi, không lộ dữ liệu. Mọi câu SQL dùng tham số hóa.
3. XSS: đăng ký họ tên `<script>alert(1)</script>`: hiển thị nguyên chữ, không chạy. Header `Content-Security-Policy` không cho script nội tuyến.
4. CSRF: gửi form không có `csrfToken`: bị từ chối.
5. Báo cáo `/admin/reports`: doanh thu theo ngày hoặc tháng và sản phẩm bán chạy khớp với đơn "Đã giao".

## 6. Cấu trúc thư mục

```
app.js                  khởi động Express, thứ tự middleware
config/                 env.js (đọc .env), db.js (kết nối MySQL), shop.js (thông tin cửa hàng, quy tắc)
middleware/             auth.js (guard /admin), csrf.js, rateLimit.js, cartContext.js, errorHandler.js
models/                 truy vấn SQL tham số hóa theo từng bảng
services/               orderService.js, paymentService.js, payment/ (mock, payos, vnpay)
routes/                 pages.js, auth.js, shop.js, paymentHooks.js, admin/
utils/                  validate.js, security.js, pricing.js, orderStatus.js, payment/signature.js ...
views/                  giao diện EJS (shop, auth, account, admin, legal, errors)
public/                 css, js, images
sql/                    01_schema.sql, 02_seed.sql, 03_create_app_login.sql
test/                   103 test tự động (npm test)
```

## 7. Thay thông tin cửa hàng

Thông tin người bán, phí giao hàng, ngưỡng miễn phí, số ngày đổi trả nằm ở `config/shop.js`. Thông tin hiện tại là nội dung mẫu cho đồ án; hãy thay bằng thông tin thật của nhóm. Nội dung các trang pháp lý cũng là bản mẫu, cần đối chiếu với tài liệu học phần.

## Thanh toán SePay VietQR

Bản MySQL đã tích hợp cùng luồng SePay của bản SQL Server tham chiếu: tạo QR VietQR cho đơn online, gắn nội dung chuyển khoản theo mã đơn và lưu lần thanh toán vào bảng `Payments` với `Provider = 'SEPAY'`.

Cấu hình trong `.env`:

```env
PAYMENT_PROVIDER=sepay
SEPAY_QR_URL=https://qr.sepay.vn/img
SEPAY_ACCOUNT_NUMBER=so_tai_khoan_nhan
SEPAY_BANK_NAME=ten_ngan_hang
SEPAY_ACCOUNT_NAME=ten_chu_tai_khoan
SEPAY_CONTENT_PREFIX=HD36-
SEPAY_CONTENT_SUFFIX=
```

Khi đặt đơn online, website chuyển tới `/payment/sepay/<mã đơn>` và hiển thị QR, số tài khoản, ngân hàng, chủ tài khoản cùng nội dung chuyển khoản. Bản SQL Server tham chiếu không có webhook tự động SePay; việc xác nhận chuyển khoản cần đối soát theo quy trình SePay.

## Cập nhật database cũ cho SePay

Nếu bảng `Payments` đã được tạo trước khi bật SePay, chạy `sql/04_enable_sepay.sql` bằng tài khoản có quyền `ALTER` (ví dụ `root`). Chạy lại `sql/01_schema.sql` không cập nhật CHECK constraint vì file dùng `CREATE TABLE IF NOT EXISTS`.

> **Development với database cũ:** nếu chưa thể chạy migration bằng tài khoản quản trị, đặt `SEPAY_DB_PROVIDER=MOCK`. Ứng dụng vẫn tạo **QR SePay thật** với đúng số tiền và nội dung chuyển khoản, chỉ lưu `Provider=MOCK` để không bị CHECK constraint cũ chặn. Production phải bỏ biến này hoặc đặt `SEPAY_DB_PROVIDER=SEPAY` sau khi chạy `sql/04_enable_sepay.sql`.
## Tích hợp webhook SePay

Ứng dụng nhận webhook tại `POST /webhook/sepay`. Endpoint này xác thực `Authorization: Apikey <SEPAY_API_KEY>`, kiểm tra IP theo `SEPAY_WEBHOOK_IPS`, lưu raw payload và giao dịch vào bảng `SepayTransactions`, chống xử lý trùng, rồi cập nhật `Payments.Status = 'PAID'` khi giao dịch hợp lệ.

Chạy migration bằng tài khoản có quyền `ALTER`/`CREATE` (thường là root), theo thứ tự:

```text
mysql -u root -p < sql/04_enable_sepay.sql
mysql -u root -p < sql/05_sepay_webhook.sql
```

Nếu tạo database mới, chạy `sql/01_schema.sql` trước. Khi test local, đặt `NODE_ENV=development` và có thể để `SEPAY_WEBHOOK_IPS` trống để gọi bằng Postman/curl. Production phải dùng IP allowlist và URL HTTPS public; SePay không thể gọi trực tiếp `localhost`, nên dùng ngrok/tunnel:

```text
https://<domain-public>/webhook/sepay
```

Payload JSON mẫu:

```json
{
  "id": 123456,
  "gateway": "MBBank",
  "transactionDate": "2024-07-02 11:08:33",
  "accountNumber": "00120501475226",
  "code": "AMDEMO0001",
  "content": "AMDEMO0001 chuyen tien",
  "transferType": "in",
  "transferAmount": 500000,
  "referenceCode": "FT24012345678"
}
```

## Tích hợp SePay đã triển khai

Project đã tích hợp luồng thanh toán chuyển khoản bằng QR VietQR của SePay:

- Người dùng chọn **Thanh toán online** khi đặt hàng.
- Ứng dụng tạo payment đang chờ và chuyển tới `/payment/sepay/<mã-đơn>`.
- Trang thanh toán hiển thị QR SePay thật, số tiền và nội dung chuyển khoản gắn với mã đơn.
- Trình duyệt polling `GET /payment/sepay/<mã-đơn>/status?ref=<paymentRef>` trong khi payment còn `PENDING`.
- Sau khi người dùng chuyển khoản, SePay gửi giao dịch về webhook của ứng dụng.
- Webhook kiểm tra giao dịch hợp lệ và cập nhật `Payments.Status = 'PAID'`.
- Khi polling nhận trạng thái `PAID`, trang thanh toán hiển thị modal **Thanh toán thành công**, sau đó redirect về `/orders`.

### Endpoint webhook SePay

Endpoint cần cấu hình trên SePay:

```text
POST https://<public-domain>/webhook/sepay
```

Ví dụ với ngrok:

```text
https://pegasus-endless-grossly.ngrok-free.app/webhook/sepay
```

Request phải gửi API key bằng header:

```http
Authorization: Apikey <SEPAY_API_KEY>
Content-Type: application/json
```

Webhook trả về JSON, không trả về trang HTML. Response thành công:

```json
{
  "success": true,
  "message": "Payment successful"
}
```

Ứng dụng vẫn giữ route `POST /` để tương thích tạm thời với cấu hình domain/ngrok cũ. Khi tạo cấu hình mới trên SePay, luôn dùng `/webhook/sepay`.

### Kiểm tra webhook và chống xử lý trùng

Trước khi xác nhận giao dịch, server kiểm tra:

- API key SePay.
- IP gọi webhook theo danh sách `SEPAY_WEBHOOK_IPS` nếu allowlist đã được cấu hình.
- `accountNumber` có phải tài khoản nhận tiền của cửa hàng.
- `transferType` là giao dịch tiền vào (`in`).
- Mã đơn/payment xuất hiện trong `code` hoặc `content`.
- `transferAmount` khớp số tiền payment đang chờ.
- Giao dịch chưa từng được xử lý.

Raw payload được lưu để audit và debug. SePay có thể retry webhook, vì vậy `SepayTransactionId` được dùng làm khóa duy nhất để chống ghi nhận một giao dịch nhiều lần.

### Bảng lưu giao dịch SePay

Migration `sql/05_sepay_webhook.sql` tạo bảng `SepayTransactions`. Bảng lưu mã giao dịch SePay, payment/order reference, tài khoản, số tiền, loại giao dịch, mã tham chiếu, raw payload, trạng thái xử lý, lỗi xử lý và thời gian nhận webhook.

Nếu database đã được tạo trước khi tích hợp SePay, chạy migration bằng tài khoản MySQL có quyền `ALTER` và `CREATE`:

```powershell
cmd /c "mysql -u root -p < sql\04_enable_sepay.sql"
cmd /c "mysql -u root -p < sql\05_sepay_webhook.sql"
```

Với database mới, chạy `sql/01_schema.sql` trước. `sql/04_enable_sepay.sql` mở rộng constraint provider để cho phép `SEPAY`; `sql/05_sepay_webhook.sql` tạo bảng và index phục vụ webhook.

### Biến môi trường

Đặt các biến sau trong file `.env`. Không commit `SEPAY_API_KEY` hoặc các thông tin bí mật lên GitHub:

```env
PAYMENT_PROVIDER=sepay
APP_BASE_URL=https://<public-domain>
SEPAY_QR_URL=https://qr.sepay.vn/img
SEPAY_ACCOUNT_NUMBER=<so-tai-khoan-nhan>
SEPAY_BANK_NAME=<ten-ngan-hang>
SEPAY_ACCOUNT_NAME=<ten-chu-tai-khoan>
SEPAY_CONTENT_PREFIX=HD36-
SEPAY_CONTENT_SUFFIX=
SEPAY_API_KEY=<sepay-api-key>
SEPAY_WEBHOOK_PATH=/webhook/sepay
SEPAY_WEBHOOK_IPS=<danh-sach-IP-SePay-cach-nhau-bang-dau-phay>
SEPAY_DB_PROVIDER=SEPAY
```

Khi development dùng database cũ chưa chạy migration và constraint `Payments.Provider` chưa cho phép `SEPAY`, có thể đặt:

```env
SEPAY_DB_PROVIDER=MOCK
```

QR và webhook vẫn là luồng SePay thật; chỉ giá trị provider lưu trong `Payments` dùng `MOCK` để tương thích constraint cũ. Sau khi chạy migration, production phải dùng `SEPAY_DB_PROVIDER=SEPAY`.

### Test local bằng ngrok

1. Chạy ứng dụng tại `http://localhost:3000`.
2. Chạy `ngrok http 3000` và lấy HTTPS public URL.
3. Cấu hình SePay gọi `<ngrok-url>/webhook/sepay`.
4. Đặt `APP_BASE_URL` bằng public URL nếu cần tạo link từ bên ngoài.
5. Thực hiện giao dịch thử và kiểm tra response JSON, log server, bảng `SepayTransactions`, `Payments.Status` và modal redirect về `/orders`.

Production cần HTTPS, domain public và IP allowlist của SePay. Không đưa API key vào GitHub, ảnh chụp màn hình, lịch sử lệnh curl hoặc tài liệu công khai.
