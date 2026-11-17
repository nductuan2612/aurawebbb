'use strict';
/** Express 4 không tự bắt lỗi của hàm async. Bọc lại để lỗi luôn chảy vào trình xử lý lỗi chung. */
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
