'use strict';
/**
 * [UC04] Model đơn hàng: các truy vấn đọc (chi tiết, danh sách của khách, danh sách của admin, thống kê).
 * Thay đổi trạng thái nằm ở services/orderService để trừ/hoàn kho cùng một giao dịch.
 */
const db = require('../config/db');
const S = require('../utils/orderStatus');
const { escapeLike } = require('../utils/security');
const { paginate } = require('../utils/pagination');
const paymentModel = require('./paymentModel');
const shippingModel = require('./shippingModel');

// Trạng thái thanh toán tổng hợp: PAID > REFUNDED > lần thử gần nhất > NONE.
const PAYMENT_STATE_SQL = `
  CASE
    WHEN EXISTS (SELECT 1 FROM Payments pp WHERE pp.OrderId = o.OrderId AND pp.Status = 'PAID') THEN 'PAID'
    WHEN EXISTS (SELECT 1 FROM Payments pp WHERE pp.OrderId = o.OrderId AND pp.Status = 'REFUNDED') THEN 'REFUNDED'
    ELSE COALESCE((SELECT pp.Status FROM Payments pp WHERE pp.OrderId = o.OrderId ORDER BY pp.PaymentId DESC LIMIT 1), 'NONE')
  END`;

// Đơn đã hủy hoặc đã trả hàng nhưng tiền khách đã trả vẫn chưa được hoàn.
const NEEDS_REFUND_COND = `o.Status IN ('CANCELLED', 'RETURNED')
  AND EXISTS (SELECT 1 FROM Payments pp WHERE pp.OrderId = o.OrderId AND pp.Status = 'PAID')`;

const ORDER_COLUMNS = `
  o.OrderId AS id, o.OrderCode AS code, o.UserId AS userId, o.Status AS status,
  o.ShipRecipientName AS shipName, o.ShipPhone AS shipPhone, o.ShipProvince AS shipProvince,
  o.ShipDistrict AS shipDistrict, o.ShipWard AS shipWard, o.ShipStreet AS shipStreet, o.Note AS note,
  o.Subtotal AS subtotal, o.DiscountId AS discountId, o.DiscountCode AS discountCode, o.DiscountAmount AS discountAmount,
  o.ShippingFee AS shippingFee, o.TotalAmount AS total, o.PaymentMethod AS paymentMethod, o.StockDeducted AS stockDeducted,
  o.CancelReason AS cancelReason, o.ConsentGivenAt AS consentGivenAt, o.PlacedAt AS placedAt, o.ConfirmedAt AS confirmedAt,
  o.DeliveredAt AS deliveredAt, o.CancelledAt AS cancelledAt,
  u.FullName AS customerName, u.Email AS customerEmail, u.Phone AS customerPhone`;

function summarizePayments(payments) {
  if (payments.some((p) => p.status === 'PAID')) return 'PAID';
  if (payments.some((p) => p.status === 'REFUNDED')) return 'REFUNDED';
  if (!payments.length) return 'NONE';
  return payments[payments.length - 1].status;
}

/** Nạp dòng hàng, lịch sử trạng thái, thanh toán, vận đơn và các cờ suy ra cho giao diện. */
async function hydrate(order) {
  const [items, history, payments, shipping] = await Promise.all([
    db.query(
      `SELECT oi.OrderItemId AS id, oi.VariantId AS variantId, oi.ProductId AS productId, oi.ProductName AS name,
              oi.Sku AS sku, oi.Size AS size, oi.ColorName AS color, oi.ImageUrl AS image,
              oi.UnitPrice AS unitPrice, oi.Quantity AS quantity, oi.LineTotal AS lineTotal, p.Slug AS slug,
              CASE WHEN EXISTS (SELECT 1 FROM Reviews r WHERE r.OrderItemId = oi.OrderItemId) THEN 1 ELSE 0 END AS reviewed
         FROM OrderItems oi JOIN Products p ON p.ProductId = oi.ProductId
        WHERE oi.OrderId = :oid ORDER BY oi.OrderItemId`, { oid: order.id }).then((r) => r.rows),
    db.query(
      `SELECT h.HistoryId AS id, h.FromStatus AS fromStatus, h.ToStatus AS toStatus, h.Note AS note, h.ChangedAt AS changedAt,
              u.FullName AS changedBy, u.Role AS changedByRole
         FROM OrderStatusHistory h LEFT JOIN Users u ON u.UserId = h.ChangedByUserId
        WHERE h.OrderId = :oid ORDER BY h.ChangedAt, h.HistoryId`, { oid: order.id }).then((r) => r.rows),
    paymentModel.listByOrder(order.id),
    shippingModel.getByOrder(order.id),
  ]);
  order.items = items;
  order.history = history;
  order.payments = payments;
  order.shipping = shipping;
  order.paymentState = summarizePayments(payments);
  order.needsRefund = (order.status === 'CANCELLED' || order.status === 'RETURNED') && payments.some((p) => p.status === 'PAID');
  order.canPayOnline = order.paymentMethod === 'ONLINE' && order.status === 'PENDING'
    && !payments.some((p) => p.status === 'PAID' || p.status === 'REFUNDED');
  order.canCancel = order.status === 'PENDING';
  return order;
}

/** Lấy đơn theo mã. Truyền userId để chỉ trả về đơn của chính khách đó (chống xem đơn của người khác). */
async function getByCode(code, userId = null) {
  const params = { code };
  let where = 'o.OrderCode = :code';
  if (userId) {
    where += ' AND o.UserId = :uid';
    params.uid = userId;
  }
  const order = await db.one(`SELECT ${ORDER_COLUMNS} FROM Orders o JOIN Users u ON u.UserId = o.UserId WHERE ${where}`, params);
  return order ? hydrate(order) : null;
}

async function listForUser(userId, { page = 1, perPage = 10 } = {}) {
  const total = await db.scalar('SELECT COUNT(*) AS total FROM Orders WHERE UserId = :uid', { uid: userId });
  const pagination = paginate(total || 0, page, perPage);
  const items = (await db.query(
    `SELECT o.OrderId AS id, o.OrderCode AS code, o.Status AS status, o.TotalAmount AS total,
            o.PaymentMethod AS paymentMethod, o.PlacedAt AS placedAt,
            (SELECT COALESCE(SUM(oi.Quantity), 0) FROM OrderItems oi WHERE oi.OrderId = o.OrderId) AS itemCount,
            (SELECT oi.ProductName FROM OrderItems oi WHERE oi.OrderId = o.OrderId ORDER BY oi.OrderItemId LIMIT 1) AS firstName,
            (SELECT oi.ImageUrl FROM OrderItems oi WHERE oi.OrderId = o.OrderId ORDER BY oi.OrderItemId LIMIT 1) AS firstImage,
            ${PAYMENT_STATE_SQL} AS paymentState
       FROM Orders o
      WHERE o.UserId = :uid
      ORDER BY o.PlacedAt DESC, o.OrderId DESC
      LIMIT ${Number(perPage)} OFFSET ${Number(pagination.offset)}`, // LIMIT/OFFSET dùng số nguyên đã kiểm tra
    { uid: userId })).rows;
  return { items, pagination };
}

/** Danh sách cho admin. Tìm theo mã đơn, email, số điện thoại, tên người nhận. */
async function adminList({ status, q, dateFrom, dateTo, refund, page = 1, perPage = 20 } = {}) {
  const params = {};
  const where = ['1 = 1'];
  if (status && S.isValid(status)) {
    where.push('o.Status = :status');
    params.status = status;
  }
  if (q) {
    params.q = `%${escapeLike(q)}%`;
    where.push(`(o.OrderCode LIKE :q ESCAPE '\\\\' OR u.Email LIKE :q ESCAPE '\\\\' OR o.ShipPhone LIKE :q ESCAPE '\\\\'
                 OR o.ShipRecipientName LIKE :q ESCAPE '\\\\')`);
  }
  if (dateFrom) {
    where.push('o.PlacedAt >= :dateFrom');
    params.dateFrom = dateFrom;
  }
  if (dateTo) {
    where.push('o.PlacedAt < :dateTo');
    params.dateTo = dateTo;
  }
  if (refund) where.push(`(${NEEDS_REFUND_COND})`);
  const w = where.join(' AND ');

  const total = await db.scalar(
    `SELECT COUNT(*) AS total FROM Orders o JOIN Users u ON u.UserId = o.UserId WHERE ${w}`, params);
  const pagination = paginate(total || 0, page, perPage);
  const items = (await db.query(
    `SELECT o.OrderId AS id, o.OrderCode AS code, o.Status AS status, o.TotalAmount AS total,
            o.PaymentMethod AS paymentMethod, o.PlacedAt AS placedAt, o.ShipRecipientName AS shipName,
            u.FullName AS customerName, u.Email AS customerEmail,
            (SELECT COALESCE(SUM(oi.Quantity), 0) FROM OrderItems oi WHERE oi.OrderId = o.OrderId) AS itemCount,
            ${PAYMENT_STATE_SQL} AS paymentState,
            CASE WHEN ${NEEDS_REFUND_COND} THEN 1 ELSE 0 END AS needsRefund
       FROM Orders o JOIN Users u ON u.UserId = o.UserId
      WHERE ${w}
      ORDER BY o.PlacedAt DESC, o.OrderId DESC
      LIMIT ${Number(perPage)} OFFSET ${Number(pagination.offset)}`,
    params)).rows;
  return { items, pagination };
}

/** Số đơn theo từng trạng thái (cho các tab lọc). */
async function statusCounts() {
  const rows = (await db.query('SELECT Status AS status, COUNT(*) AS cnt FROM Orders GROUP BY Status')).rows;
  const map = {};
  for (const r of rows) map[r.status] = r.cnt;
  return map;
}

async function refundCount() {
  const n = await db.scalar(`SELECT COUNT(*) AS n FROM Orders o WHERE ${NEEDS_REFUND_COND}`);
  return n || 0;
}

/**
 * Số liệu tổng quan cho trang chủ quản trị.
 * Doanh thu chỉ tính đơn đang ở trạng thái "Đã giao", nên đơn đã trả hàng tự bị loại.
 * Tổng tiền ép sang DECIMAL trước khi cộng để không tràn kiểu số nguyên.
 */
async function dashboard({ todayStart, todayEnd, monthStart, monthEnd, lowStock }) {
  const r = await db.one(
    `SELECT
       (SELECT COUNT(*) FROM Orders WHERE PlacedAt >= :todayStart AND PlacedAt < :todayEnd) AS todayOrders,
       (SELECT COUNT(*) FROM Orders WHERE Status = 'PENDING') AS pendingOrders,
       (SELECT COUNT(*) FROM Orders WHERE Status = 'DELIVERED' AND DeliveredAt >= :monthStart AND DeliveredAt < :monthEnd) AS monthDelivered,
       (SELECT COALESCE(SUM(CAST(TotalAmount AS DECIMAL(18,0))), 0) FROM Orders
         WHERE Status = 'DELIVERED' AND DeliveredAt >= :monthStart AND DeliveredAt < :monthEnd) AS monthRevenue,
       (SELECT COUNT(*) FROM ProductVariants v JOIN Products p ON p.ProductId = v.ProductId
         WHERE v.IsActive = 1 AND p.IsActive = 1 AND v.StockQuantity <= :low) AS lowStock`,
    { todayStart, todayEnd, monthStart, monthEnd, low: lowStock });
  return {
    todayOrders: Number(r.todayOrders),
    pendingOrders: Number(r.pendingOrders),
    monthDelivered: Number(r.monthDelivered),
    monthRevenue: Number(r.monthRevenue),
    lowStock: Number(r.lowStock),
  };
}

module.exports = { getByCode, listForUser, adminList, statusCounts, refundCount, dashboard, summarizePayments };
