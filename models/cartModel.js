'use strict';
/**
 * Model giỏ hàng.
 * [UC04] Kiểm tra tồn kho khi THÊM và khi CẬP NHẬT số lượng: không cho vượt tồn kho,
 *        không cho thêm biến thể đã ngừng bán hoặc hết hàng.
 */
const db = require('../config/db');
const shop = require('../config/shop');
const { BusinessError } = require('../utils/errors');

/** Tải giỏ hàng kèm dòng hàng, tên sản phẩm, ảnh, giá, tồn kho hiện tại. */
async function getDetail(cartId) {
  const items = (await db.query(
    `SELECT ci.CartItemId AS id, ci.VariantId AS variantId, ci.Quantity AS quantity,
            pv.Sku AS sku, pv.Size AS size, pv.ColorName AS color, pv.ColorHex AS hex,
            pv.Price AS price, pv.CompareAtPrice AS compareAt, pv.StockQuantity AS stock,
            pv.IsActive AS variantActive,
            p.ProductId AS productId, p.Name AS name, p.Slug AS slug, p.IsActive AS productActive,
            (SELECT i.ImageUrl FROM ProductImages i WHERE i.ProductId = p.ProductId ORDER BY i.SortOrder LIMIT 1) AS image
       FROM CartItems ci
       JOIN ProductVariants pv ON pv.VariantId = ci.VariantId
       JOIN Products p ON p.ProductId = pv.ProductId
      WHERE ci.CartId = :cartId
      ORDER BY ci.AddedAt DESC, ci.CartItemId DESC`, { cartId })).rows;
  let subtotal = 0;
  for (const it of items) {
    it.lineTotal = it.price * it.quantity;
    subtotal += it.lineTotal;
    if (!it.productActive || !it.variantActive) it.warning = 'Sản phẩm này hiện ngừng bán.';
    else if (it.stock <= 0) it.warning = 'Biến thể này đã hết hàng.';
    else if (it.quantity > it.stock) it.warning = `Chỉ còn ${it.stock} sản phẩm trong kho.`;
  }
  return { items, subtotal };
}

/** [UC04] Thêm vào giỏ: kiểm tra tồn kho trước khi thêm, chặn biến thể ngừng bán.
 * "FOR UPDATE" khóa dòng biến thể trong giao dịch, tương đương WITH (UPDLOCK) của SQL Server. */
async function addItem(cartId, variantId, quantity) {
  return db.tx(async (t) => {
    const v = await t.one(
      `SELECT v.VariantId AS id, v.StockQuantity AS stock, v.IsActive AS isActive,
              p.IsActive AS productActive, p.Name AS name
         FROM ProductVariants v JOIN Products p ON p.ProductId = v.ProductId
        WHERE v.VariantId = :vid
        FOR UPDATE`, { vid: variantId });
    if (!v || !v.productActive) throw new BusinessError('Sản phẩm không tồn tại.');
    if (!v.isActive) throw new BusinessError('Biến thể này hiện ngừng bán.');
    if (v.stock <= 0) throw new BusinessError('Sản phẩm này đã hết hàng.');
    const existing = await t.one(
      'SELECT CartItemId AS id, Quantity AS qty FROM CartItems WHERE CartId = :cid AND VariantId = :vid',
      { cid: cartId, vid: variantId });
    const newQty = (existing ? existing.qty : 0) + quantity;
    if (newQty > shop.limits.maxQtyPerLine) throw new BusinessError(`Mỗi dòng trong giỏ hàng tối đa ${shop.limits.maxQtyPerLine} sản phẩm.`);
    if (newQty > v.stock) throw new BusinessError(`Không đủ hàng. Kho hiện chỉ còn ${v.stock} sản phẩm.`);
    if (existing) {
      await t.query('UPDATE CartItems SET Quantity = :q WHERE CartItemId = :id', { q: newQty, id: existing.id });
    } else {
      await t.query('INSERT INTO CartItems (CartId, VariantId, Quantity) VALUES (:cid, :vid, :q)', { cid: cartId, vid: variantId, q: quantity });
    }
    await t.query('UPDATE Carts SET UpdatedAt = UTC_TIMESTAMP() WHERE CartId = :cid', { cid: cartId });
  });
}

/** Cập nhật số lượng: kiểm tra tồn kho, xóa dòng nếu số lượng = 0. */
async function updateItem(cartId, variantId, quantity) {
  return db.tx(async (t) => {
    if (quantity <= 0) {
      await t.query('DELETE FROM CartItems WHERE CartId = :cid AND VariantId = :vid', { cid: cartId, vid: variantId });
      return;
    }
    if (quantity > shop.limits.maxQtyPerLine) throw new BusinessError(`Mỗi dòng tối đa ${shop.limits.maxQtyPerLine} sản phẩm.`);
    const v = await t.one('SELECT StockQuantity AS stock FROM ProductVariants WHERE VariantId = :vid FOR UPDATE', { vid: variantId });
    if (!v) throw new BusinessError('Biến thể không tồn tại.');
    if (quantity > v.stock) throw new BusinessError(`Không đủ hàng. Kho chỉ còn ${v.stock} sản phẩm.`);
    const r = await t.query('UPDATE CartItems SET Quantity = :q WHERE CartId = :cid AND VariantId = :vid', { q: quantity, cid: cartId, vid: variantId });
    if (!r.rowsAffected[0]) throw new BusinessError('Sản phẩm không có trong giỏ hàng.');
    await t.query('UPDATE Carts SET UpdatedAt = UTC_TIMESTAMP() WHERE CartId = :cid', { cid: cartId });
  });
}

async function removeItem(cartId, variantId) {
  await db.query('DELETE FROM CartItems WHERE CartId = :cid AND VariantId = :vid', { cid: cartId, vid: variantId });
  await db.query('UPDATE Carts SET UpdatedAt = UTC_TIMESTAMP() WHERE CartId = :cid', { cid: cartId });
}

async function clear(cartId) {
  await db.query('DELETE FROM CartItems WHERE CartId = :cid', { cid: cartId });
  await db.query('UPDATE Carts SET UpdatedAt = UTC_TIMESTAMP() WHERE CartId = :cid', { cid: cartId });
}

module.exports = { getDetail, addItem, updateItem, removeItem, clear };
