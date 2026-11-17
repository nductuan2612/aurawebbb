'use strict';
/**
 * Báo cáo thống kê cho admin: doanh thu theo thời gian và sản phẩm bán chạy.
 *
 * ĐỊNH NGHĨA: doanh thu tính trên đơn đang ở trạng thái "Đã giao", gom theo NGÀY GIAO (giờ Việt Nam).
 * Đơn sau đó bị trả hàng chuyển sang "Trả hàng/Hoàn tiền" nên tự không còn được tính.
 * Khoảng thời gian là [from, to): from tính cả, to không tính (cả hai là thời điểm UTC).
 */
const db = require('../config/db');

// Biểu thức gom nhóm lấy từ danh sách cố định, không bao giờ ghép từ dữ liệu người dùng.
// DATE_ADD(..., INTERVAL 7 HOUR) quy đổi UTC sang giờ Việt Nam trước khi định dạng.
const PERIOD_EXPR = Object.freeze({
  day: "DATE_FORMAT(DATE_ADD(o.DeliveredAt, INTERVAL 7 HOUR), '%Y-%m-%d')",
  month: "DATE_FORMAT(DATE_ADD(o.DeliveredAt, INTERVAL 7 HOUR), '%Y-%m')",
});

async function revenue({ from, to, group = 'day' }) {
  const expr = Object.prototype.hasOwnProperty.call(PERIOD_EXPR, group) ? PERIOD_EXPR[group] : PERIOD_EXPR.day;
  const rows = (await db.query(
    `SELECT ${expr} AS period, COUNT(*) AS orders,
            CAST(SUM(CAST(o.TotalAmount AS DECIMAL(18,0))) AS DECIMAL(18,0)) AS revenue
       FROM Orders o
      WHERE o.Status = 'DELIVERED' AND o.DeliveredAt >= :dateFrom AND o.DeliveredAt < :dateTo
      GROUP BY ${expr}
      ORDER BY ${expr}`, { dateFrom: from, dateTo: to })).rows;
  return rows.map((r) => ({ period: r.period, orders: Number(r.orders), revenue: Number(r.revenue) }));
}

async function topProducts({ from, to, limit = 10 }) {
  const rows = (await db.query(
    `SELECT oi.ProductId AS productId, p.ProductCode AS code, p.Name AS name, p.Slug AS slug,
            SUM(oi.Quantity) AS qty,
            CAST(SUM(CAST(oi.LineTotal AS DECIMAL(18,0))) AS DECIMAL(18,0)) AS revenue
       FROM OrderItems oi
       JOIN Orders o ON o.OrderId = oi.OrderId
       JOIN Products p ON p.ProductId = oi.ProductId
      WHERE o.Status = 'DELIVERED' AND o.DeliveredAt >= :dateFrom AND o.DeliveredAt < :dateTo
      GROUP BY oi.ProductId, p.ProductCode, p.Name, p.Slug
      ORDER BY SUM(oi.Quantity) DESC, SUM(CAST(oi.LineTotal AS DECIMAL(18,0))) DESC
      LIMIT ${Number(limit)}`,
    { dateFrom: from, dateTo: to })).rows;
  return rows.map((r) => ({ ...r, qty: Number(r.qty), revenue: Number(r.revenue) }));
}

/** Số đơn đặt trong kỳ theo trạng thái hiện tại. */
async function statusBreakdown({ from, to }) {
  const rows = (await db.query(
    `SELECT Status AS status, COUNT(*) AS cnt FROM Orders
      WHERE PlacedAt >= :dateFrom AND PlacedAt < :dateTo GROUP BY Status`, { dateFrom: from, dateTo: to })).rows;
  const map = {};
  for (const r of rows) map[r.status] = Number(r.cnt);
  return map;
}

module.exports = { revenue, topProducts, statusBreakdown };
