'use strict';
/**
 * Model biến thể sản phẩm (size, màu, giá, SKU, tồn kho riêng) cho phân hệ quản trị.
 * Mọi thay đổi tồn kho do admin thực hiện đều ghi vào InventoryLogs (lý do ADMIN_ADJUST).
 */
const db = require('../config/db');
const { BusinessError } = require('../utils/errors');

const DUP_MSG = 'SKU đã tồn tại, hoặc sản phẩm này đã có biến thể cùng size và màu.';

async function listByProduct(productId) {
  return (await db.query(
    `SELECT VariantId AS id, Sku AS sku, Size AS size, ColorName AS color, ColorHex AS hex,
            Price AS price, CompareAtPrice AS compareAt, StockQuantity AS stock, IsActive AS isActive,
            (SELECT MIN(v2.VariantId) FROM ProductVariants v2 WHERE v2.ProductId = ProductVariants.ProductId AND v2.ColorName = ProductVariants.ColorName) AS colorOrder
       FROM ProductVariants WHERE ProductId = :pid
      ORDER BY colorOrder, CASE Size WHEN 'S' THEN 1 WHEN 'M' THEN 2 WHEN 'L' THEN 3 ELSE 4 END`,
    { pid: productId })).rows;
}

function toParams(d) {
  return {
    sku: d.sku, size: d.size, color: d.color, hex: d.hex, price: d.price,
    cmp: d.compareAt === undefined ? null : d.compareAt, stock: d.stock, act: d.isActive ? 1 : 0,
  };
}

async function create(productId, d, adminId) {
  try {
    return await db.tx(async (t) => {
      const exists = await t.scalar('SELECT 1 AS x FROM Products WHERE ProductId = :pid LIMIT 1', { pid: productId });
      if (!exists) throw new BusinessError('Sản phẩm không tồn tại.');
      const variantId = await t.insert(
        `INSERT INTO ProductVariants (ProductId, Sku, Size, ColorName, ColorHex, Price, CompareAtPrice, StockQuantity, IsActive)
           VALUES (:pid, :sku, :size, :color, :hex, :price, :cmp, :stock, :act)`,
        { pid: productId, ...toParams(d) });
      if (d.stock > 0) {
        await t.query(
          `INSERT INTO InventoryLogs (VariantId, OrderId, Delta, StockAfter, Reason, CreatedByUserId)
             VALUES (:vid, NULL, :delta, :after, 'ADMIN_ADJUST', :uid)`,
          { vid: variantId, delta: d.stock, after: d.stock, uid: adminId });
      }
      return variantId;
    });
  } catch (err) {
    if (db.isUniqueViolation(err)) throw new BusinessError(DUP_MSG);
    throw err;
  }
}

/** Cập nhật biến thể. Trả về ProductId để route quay lại trang sản phẩm. */
async function update(variantId, d, adminId) {
  try {
    return await db.tx(async (t) => {
      const old = await t.one(
        'SELECT StockQuantity AS stock, ProductId AS productId FROM ProductVariants WHERE VariantId = :id FOR UPDATE',
        { id: variantId });
      if (!old) throw new BusinessError('Biến thể không tồn tại.');
      await t.query(
        `UPDATE ProductVariants
            SET Sku = :sku, Size = :size, ColorName = :color, ColorHex = :hex, Price = :price,
                CompareAtPrice = :cmp, StockQuantity = :stock, IsActive = :act, UpdatedAt = UTC_TIMESTAMP()
          WHERE VariantId = :id`, { id: variantId, ...toParams(d) });
      if (d.stock !== old.stock) {
        await t.query(
          `INSERT INTO InventoryLogs (VariantId, OrderId, Delta, StockAfter, Reason, CreatedByUserId)
             VALUES (:vid, NULL, :delta, :after, 'ADMIN_ADJUST', :uid)`,
          { vid: variantId, delta: d.stock - old.stock, after: d.stock, uid: adminId });
      }
      return old.productId;
    });
  } catch (err) {
    if (db.isUniqueViolation(err)) throw new BusinessError(DUP_MSG);
    throw err;
  }
}

/** Biến thể đã có trong đơn hàng thì không xóa được (giữ lịch sử đơn), chỉ ngừng bán. */
async function remove(variantId) {
  return db.tx(async (t) => {
    const v = await t.one('SELECT ProductId AS productId FROM ProductVariants WHERE VariantId = :id', { id: variantId });
    if (!v) throw new BusinessError('Biến thể không tồn tại.');
    const used = await t.scalar('SELECT 1 AS x FROM OrderItems WHERE VariantId = :id LIMIT 1', { id: variantId });
    if (used) throw new BusinessError('Biến thể này đã phát sinh đơn hàng nên không thể xóa. Hãy tắt "Đang bán" để ngừng bán.');
    await t.query('DELETE FROM CartItems WHERE VariantId = :id', { id: variantId });
    await t.query('DELETE FROM InventoryLogs WHERE VariantId = :id', { id: variantId });
    await t.query('DELETE FROM ProductVariants WHERE VariantId = :id', { id: variantId });
    return v.productId;
  });
}

async function lowStock(threshold, limit = 20) {
  return (await db.query(
    `SELECT v.VariantId AS id, v.Sku AS sku, v.Size AS size, v.ColorName AS color, v.StockQuantity AS stock,
            p.ProductId AS productId, p.Name AS productName
       FROM ProductVariants v JOIN Products p ON p.ProductId = v.ProductId
      WHERE v.IsActive = 1 AND p.IsActive = 1 AND v.StockQuantity <= :threshold
      ORDER BY v.StockQuantity ASC, p.Name
      LIMIT ${Number(limit)}`, { threshold })).rows;
}

module.exports = { listByProduct, create, update, remove, lowStock };
