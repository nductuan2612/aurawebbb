'use strict';
/**
 * Model vận đơn (đọc). Mỗi đơn có tối đa một vận đơn (UNIQUE OrderId trong CSDL).
 * Admin tạo vận đơn khi chuyển đơn sang "Đang giao": việc ghi nằm trong services/orderService.changeStatus
 * để vận đơn và trạng thái đơn luôn thay đổi cùng một giao dịch.
 */
const db = require('../config/db');

async function getByOrder(orderId) {
  return db.one(
    `SELECT ShippingId AS id, Carrier AS carrier, TrackingCode AS trackingCode, Status AS status,
            Note AS note, ShippedAt AS shippedAt, DeliveredAt AS deliveredAt
       FROM Shippings WHERE OrderId = :oid`, { oid: orderId });
}

module.exports = { getByOrder };
//comenttuan