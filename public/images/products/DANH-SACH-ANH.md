# Danh sách ảnh sản phẩm

Bạn tự cung cấp ảnh: đặt file vào thư mục này (`public/images/products`) với đúng tên trong bảng dưới.

- Ảnh chính (`P001.jpg`) hiện ở danh sách và đầu thư viện ảnh trong trang chi tiết.
- Ảnh phụ (`P001_2.jpg`) hiện khi rê chuột vào thẻ sản phẩm và là ảnh thứ hai trong thư viện.
- Tỉ lệ khuyến nghị 3:4, ví dụ 900 x 1200 px.
- Thiếu file nào, website tự hiện ảnh minh họa mặc định ở chỗ đó, không báo lỗi.
- Dùng đuôi khác (png, webp)? Chạy một lệnh trong MySQL, ví dụ: `UPDATE ProductImages SET ImageUrl = REPLACE(ImageUrl, '.jpg', '.webp');`

| Mã | Tên sản phẩm | Ảnh chính | Ảnh phụ |
|---|---|---|---|
| P001 | Áo sơ mi lụa cổ nơ | `P001.jpg` | `P001_2.jpg` |
| P002 | Áo thun cotton cổ tròn | `P002.jpg` | `P002_2.jpg` |
| P003 | Áo kiểu voan tay phồng | `P003.jpg` | `P003_2.jpg` |
| P004 | Áo len mỏng cổ V | `P004.jpg` | `P004_2.jpg` |
| P005 | Áo croptop thun gân | `P005.jpg` | `P005_2.jpg` |
| P006 | Quần ống rộng linen | `P006.jpg` | `P006_2.jpg` |
| P007 | Quần jeans ống đứng | `P007.jpg` | `P007_2.jpg` |
| P008 | Quần tây ống suông | `P008.jpg` | `P008_2.jpg` |
| P009 | Quần short kaki | `P009.jpg` | `P009_2.jpg` |
| P010 | Chân váy chữ A | `P010.jpg` | `P010_2.jpg` |
| P011 | Chân váy xếp ly dài | `P011.jpg` | `P011_2.jpg` |
| P012 | Chân váy jeans | `P012.jpg` | `P012_2.jpg` |
| P013 | Chân váy bút chì | `P013.jpg` | `P013_2.jpg` |
| P014 | Đầm sơ mi thắt eo | `P014.jpg` | `P014_2.jpg` |
| P015 | Đầm xòe hoa nhí | `P015.jpg` | `P015_2.jpg` |
| P016 | Đầm ôm dệt kim | `P016.jpg` | `P016_2.jpg` |
| P017 | Đầm maxi lụa | `P017.jpg` | `P017_2.jpg` |
| P018 | Blazer dáng rộng | `P018.jpg` | `P018_2.jpg` |
| P019 | Áo khoác dạ lửng | `P019.jpg` | `P019_2.jpg` |
| P020 | Cardigan len dáng dài | `P020.jpg` | `P020_2.jpg` |
| P021 | Sơ mi Oxford tay dài | `P021.jpg` | `P021_2.jpg` |
| P022 | Sơ mi linen ngắn tay | `P022.jpg` | `P022_2.jpg` |
| P023 | Sơ mi kẻ sọc | `P023.jpg` | `P023_2.jpg` |
| P024 | Polo pique | `P024.jpg` | `P024_2.jpg` |
| P025 | Áo thun basic cổ tròn | `P025.jpg` | `P025_2.jpg` |
| P026 | Áo thun in họa tiết | `P026.jpg` | `P026_2.jpg` |
| P027 | Quần kaki slimfit | `P027.jpg` | `P027_2.jpg` |
| P028 | Quần jeans xanh đậm | `P028.jpg` | `P028_2.jpg` |
| P029 | Quần short thể thao | `P029.jpg` | `P029_2.jpg` |
| P030 | Áo khoác bomber | `P030.jpg` | `P030_2.jpg` |
| P031 | Áo khoác gió | `P031.jpg` | `P031_2.jpg` |
| P032 | Áo khoác denim | `P032.jpg` | `P032_2.jpg` |
