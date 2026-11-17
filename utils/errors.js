'use strict';
/**
 * Các lớp lỗi của ứng dụng.
 * expose = true: thông báo được phép hiển thị cho người dùng.
 * Lỗi hệ thống (status 500) không bao giờ lộ chi tiết ra trình duyệt.
 */
class AppError extends Error {
  constructor(message, status = 500, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.expose = options.expose !== undefined ? options.expose : status < 500;
    this.code = options.code;
  }
}

/** Lỗi nghiệp vụ: hết hàng, mã giảm giá không hợp lệ, chuyển trạng thái sai... */
class BusinessError extends AppError {
  constructor(message, options = {}) {
    super(message, 400, { expose: true, ...options });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Không tìm thấy trang bạn yêu cầu.') {
    super(message, 404, { expose: true });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Tài khoản của bạn không có quyền truy cập trang này.') {
    super(message, 403, { expose: true });
  }
}

module.exports = { AppError, BusinessError, NotFoundError, ForbiddenError };
