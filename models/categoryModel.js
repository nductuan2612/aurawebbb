'use strict';
/**
 * Model danh mục (hai cấp: danh mục gốc và danh mục con).
 * Cây danh mục hiển thị trên thanh điều hướng được lưu tạm trong bộ nhớ 60 giây.
 */
const db = require('../config/db');
const { BusinessError } = require('../utils/errors');

const TTL_MS = 60 * 1000;
let cache = { at: 0, tree: null };

function clearCache() {
  cache = { at: 0, tree: null };
}

/** Cây danh mục đang hiển thị: [{ id, name, slug, children: [{ id, name, slug }] }] */
async function tree() {
  if (cache.tree && Date.now() - cache.at < TTL_MS) return cache.tree;
  const rows = (await db.query(
    `SELECT CategoryId AS id, ParentId AS parentId, Name AS name, Slug AS slug
       FROM Categories WHERE IsActive = 1 ORDER BY SortOrder, Name`)).rows;
  const roots = rows.filter((r) => r.parentId === null).map((r) => ({ ...r, children: [] }));
  const byId = new Map(roots.map((r) => [r.id, r]));
  for (const r of rows) {
    if (r.parentId !== null && byId.has(r.parentId)) byId.get(r.parentId).children.push(r);
  }
  cache = { at: Date.now(), tree: roots };
  return roots;
}

async function findBySlug(slug) {
  return db.one(
    `SELECT c.CategoryId AS id, c.Name AS name, c.Slug AS slug, c.Description AS description,
            c.ParentId AS parentId, pc.Name AS parentName, pc.Slug AS parentSlug
       FROM Categories c LEFT JOIN Categories pc ON pc.CategoryId = c.ParentId
      WHERE c.Slug = :slug AND c.IsActive = 1`, { slug });
}

// ------------------------------------------------------------------ quản trị
async function adminList() {
  return (await db.query(
    `SELECT c.CategoryId AS id, c.ParentId AS parentId, c.Name AS name, c.Slug AS slug, c.Description AS description,
            c.SortOrder AS sortOrder, c.IsActive AS isActive, pc.Name AS parentName,
            (SELECT COUNT(*) FROM Products p WHERE p.CategoryId = c.CategoryId) AS productCount
       FROM Categories c
       LEFT JOIN Categories pc ON pc.CategoryId = c.ParentId
      ORDER BY COALESCE(pc.SortOrder, c.SortOrder), COALESCE(c.ParentId, c.CategoryId),
               CASE WHEN c.ParentId IS NULL THEN 0 ELSE 1 END, c.SortOrder, c.Name`)).rows;
}

async function getById(id) {
  return db.one(
    `SELECT CategoryId AS id, ParentId AS parentId, Name AS name, Slug AS slug, Description AS description,
            SortOrder AS sortOrder, IsActive AS isActive
       FROM Categories WHERE CategoryId = :id`, { id });
}

/** Chỉ hỗ trợ hai cấp: danh mục cha phải là danh mục gốc, và danh mục đang có con không được làm con. */
async function checkParent(t, id, parentId) {
  if (parentId === null || parentId === undefined) return;
  if (id && parentId === id) throw new BusinessError('Danh mục không thể là cha của chính nó.');
  const p = await t.one('SELECT ParentId AS parentId FROM Categories WHERE CategoryId = :id', { id: parentId });
  if (!p) throw new BusinessError('Danh mục cha không tồn tại.');
  if (p.parentId !== null) throw new BusinessError('Chỉ hỗ trợ hai cấp danh mục. Danh mục cha phải là danh mục gốc.');
  if (id) {
    const hasChildren = await t.scalar('SELECT 1 AS x FROM Categories WHERE ParentId = :id LIMIT 1', { id });
    if (hasChildren) throw new BusinessError('Danh mục này đang có danh mục con nên không thể chuyển thành danh mục con.');
  }
}

async function save({ id, parentId, name, slug, description, sortOrder, isActive }) {
  try {
    await db.tx(async (t) => {
      await checkParent(t, id, parentId);
      const params = { parent: parentId || null, name, slug, descr: description || null, sort: sortOrder, act: isActive ? 1 : 0 };
      if (id) {
        const r = await t.query(
          `UPDATE Categories SET ParentId = :parent, Name = :name, Slug = :slug, Description = :descr,
                  SortOrder = :sort, IsActive = :act WHERE CategoryId = :id`, { ...params, id });
        if (!r.rowsAffected[0]) throw new BusinessError('Danh mục không tồn tại.');
      } else {
        await t.query(
          `INSERT INTO Categories (ParentId, Name, Slug, Description, SortOrder, IsActive)
             VALUES (:parent, :name, :slug, :descr, :sort, :act)`, params);
      }
    });
  } catch (err) {
    if (db.isUniqueViolation(err)) throw new BusinessError('Đường dẫn (slug) này đã được dùng cho danh mục khác.');
    throw err;
  } finally {
    clearCache();
  }
}

async function setActive(id, isActive) {
  await db.query('UPDATE Categories SET IsActive = :act WHERE CategoryId = :id', { act: isActive ? 1 : 0, id });
  clearCache();
}

module.exports = { tree, findBySlug, clearCache, adminList, getById, save, setActive };
