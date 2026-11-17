'use strict';
/**
 * [UC05][UC12] Model mã giảm giá.
 * Mọi hàm trả về ĐÚNG TÊN CỘT CSDL (DiscountType, MinOrderValue, UsageLimit...) để dùng trực tiếp
 * với utils/pricing (evaluateDiscount, discountState). Điều kiện áp dụng nằm ở utils/pricing,
 * việc "giữ chỗ" một lượt dùng khi đặt hàng nằm ở services/orderService (UPDATE có điều kiện).
 */
const db = require('../config/db');
const { BusinessError } = require('../utils/errors');
const { normalizeCode } = require('../utils/pricing');

const COLUMNS = `DiscountId, Code, Description, DiscountType, DiscountValue, MaxDiscountAmount, MinOrderValue,
                 StartsAt, EndsAt, UsageLimit, UsedCount, IsActive`;

/** Tìm mã theo chuỗi khách nhập. Trả về null nếu sai định dạng hoặc không tồn tại. */
async function findByCode(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  return db.one(`SELECT ${COLUMNS} FROM Discounts WHERE Code = :code`, { code });
}

// ------------------------------------------------------------------ quản trị [UC12]
async function adminList() {
  return (await db.query(
    `SELECT d.DiscountId, d.Code, d.Description, d.DiscountType, d.DiscountValue, d.MaxDiscountAmount, d.MinOrderValue,
            d.StartsAt, d.EndsAt, d.UsageLimit, d.UsedCount, d.IsActive,
            (SELECT COUNT(*) FROM Orders o WHERE o.DiscountId = d.DiscountId) AS OrderCount
       FROM Discounts d ORDER BY d.CreatedAt DESC, d.DiscountId DESC`)).rows;
}

async function getById(id) {
  return db.one(`SELECT ${COLUMNS} FROM Discounts WHERE DiscountId = :id`, { id });
}

/** Tạo mới (không có id) hoặc cập nhật. Dữ liệu đã được route kiểm tra; ở đây chặn nốt các ràng buộc phụ thuộc CSDL. */
async function save({ id, code, description, type, value, maxAmount, minOrderValue, startsAt, endsAt, usageLimit, isActive }) {
  const p = {
    code, descr: description || null, type, value, max: type === 'PERCENT' ? (maxAmount || null) : null,
    min: minOrderValue, start: startsAt, end: endsAt, limit: usageLimit || null, act: isActive ? 1 : 0,
  };
  try {
    if (id) {
      const cur = await getById(id);
      if (!cur) throw new BusinessError('Mã giảm giá không tồn tại.');
      if (p.limit !== null && p.limit < cur.UsedCount) {
        throw new BusinessError(`Số lượt tối đa không được nhỏ hơn số lượt đã dùng (${cur.UsedCount}).`);
      }
      await db.query(
        `UPDATE Discounts SET Code = :code, Description = :descr, DiscountType = :type, DiscountValue = :value,
                MaxDiscountAmount = :max, MinOrderValue = :min, StartsAt = :start, EndsAt = :end,
                UsageLimit = :limit, IsActive = :act, UpdatedAt = UTC_TIMESTAMP()
          WHERE DiscountId = :id`, { ...p, id });
    } else {
      await db.query(
        `INSERT INTO Discounts (Code, Description, DiscountType, DiscountValue, MaxDiscountAmount, MinOrderValue,
                               StartsAt, EndsAt, UsageLimit, IsActive)
         VALUES (:code, :descr, :type, :value, :max, :min, :start, :end, :limit, :act)`, p);
    }
  } catch (err) {
    if (db.isUniqueViolation(err)) throw new BusinessError('Mã giảm giá này đã tồn tại. Hãy chọn mã khác.');
    throw err;
  }
}

async function setActive(id, isActive) {
  await db.query('UPDATE Discounts SET IsActive = :act, UpdatedAt = UTC_TIMESTAMP() WHERE DiscountId = :id', { act: isActive ? 1 : 0, id });
}

module.exports = { findByCode, adminList, getById, save, setActive };
