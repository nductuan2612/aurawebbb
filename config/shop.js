'use strict';
/**
 * Thông tin cửa hàng và các quy tắc kinh doanh dùng chung.
 * LƯU Ý: phần "legal" bên dưới là NỘI DUNG MẪU cho đồ án học phần.
 * Hãy thay bằng thông tin thật của đơn vị bán hàng trước khi dùng cho mục đích khác.
 */
module.exports = Object.freeze({
  name: 'AURA moda',
  tagline: 'Thời trang nữ và nam',

  legal: Object.freeze({
    isSample: true,
    companyName: 'Công ty TNHH Thời trang AURA (tên mẫu)',
    address: 'Số 1 đường Mẫu, phường Mẫu, Hà Nội (địa chỉ mẫu)',
    phone: '0900 000 000',
    email: 'cskh@example.com',
    taxCode: '0000000000 (mã số thuế mẫu)',
    representative: 'Nguyễn Văn A (người đại diện mẫu)',
    businessLicense: 'Giấy chứng nhận đăng ký doanh nghiệp số 0000000000 (số mẫu)',
    workingHours: '08:30 - 21:00, tất cả các ngày trong tuần',
    privacyContact: 'baove.dulieu@example.com',
  }),

  shipping: Object.freeze({
    fee: 30000,         // phí giao hàng cố định (VND)
    freeFrom: 500000,   // miễn phí giao hàng khi giá trị đơn sau giảm giá từ mức này
  }),

  limits: Object.freeze({
    maxQtyPerLine: 20,         // khớp CK_CartItems_Qty trong CSDL
    maxOrderTotal: 200000000,  // chặn đơn quá lớn, tránh tràn kiểu INT
    perPage: 12,
    adminPerPage: 20,
    maxImagesPerProduct: 8,
  }),

  policies: Object.freeze({
    returnDays: 7,           // số ngày được đổi trả kể từ lúc nhận hàng
    consentVersion: 'v1',    // đổi giá trị này khi nội dung chính sách bảo vệ dữ liệu thay đổi
  }),

  lowStockThreshold: 3,      // từ mức này trở xuống hiển thị "Sắp hết hàng"

  carriers: Object.freeze([
    'Giao Hàng Nhanh', 'Viettel Post', 'J&T Express', 'Giao Hàng Tiết Kiệm', 'Đơn vị khác',
  ]),

  login: Object.freeze({
    maxFailedAttempts: 5,    // sai mật khẩu quá số lần này thì khóa tạm
    lockMinutes: 15,
  }),
});
