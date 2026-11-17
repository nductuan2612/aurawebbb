'use strict';
/**
 * Khu vực quản trị /admin.
 *
 * GUARD: requireAdmin được gắn TRƯỚC khi mount mọi router con, nên không route nào trong /admin thoát được:
 *   - chưa đăng nhập        -> chuyển tới trang đăng nhập
 *   - tài khoản khách hàng  -> 403, với mọi phương thức HTTP (GET, POST, ...) và mọi đường dẫn con
 *   - tài khoản ADMIN       -> đi tiếp
 * Vai trò được đọc từ CSDL ở mỗi request (middleware/auth.js), không tin dữ liệu lưu trong phiên.
 */
const express = require('express');
const ah = require('../../utils/asyncHandler');
const { requireAdmin } = require('../../middleware/auth');
const shop = require('../../config/shop');
const { addDays, vnStartOfDay, vnStartOfMonth, vnStartOfNextMonth } = require('../../utils/time');
const orderModel = require('../../models/orderModel');
const variantModel = require('../../models/variantModel');

const router = express.Router();

router.use(requireAdmin);

router.get('/', ah(async (req, res) => {
  const now = new Date();
  const todayStart = vnStartOfDay(now);
  const [stats, pending, lowStock, refundCount] = await Promise.all([
    orderModel.dashboard({
      todayStart,
      todayEnd: addDays(todayStart, 1),
      monthStart: vnStartOfMonth(now),
      monthEnd: vnStartOfNextMonth(now),
      lowStock: shop.lowStockThreshold,
    }),
    orderModel.adminList({ status: 'PENDING', page: 1, perPage: 6 }),
    variantModel.lowStock(shop.lowStockThreshold, 10),
    orderModel.refundCount(),
  ]);
  res.render('admin/dashboard', { title: 'Tổng quan', stats, pending: pending.items, lowStock, refundCount });
}));

router.use(require('./catalog'));
router.use(require('./orders'));
router.use(require('./discounts'));
router.use(require('./reports'));

module.exports = router;
