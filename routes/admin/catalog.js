'use strict';
/**
 * Quản trị danh mục, sản phẩm và biến thể (size, màu, giá, SKU, tồn kho riêng).
 * Guard requireAdmin đã gắn ở routes/admin/index.js trước khi mount file này.
 */
const express = require('express');
const ah = require('../../utils/asyncHandler');
const v = require('../../utils/validate');
const { slugify } = require('../../utils/slug');
const { toQuery } = require('../../utils/query');
const { BusinessError, NotFoundError } = require('../../utils/errors');
const shop = require('../../config/shop');
const categoryModel = require('../../models/categoryModel');
const productModel = require('../../models/productModel');
const variantModel = require('../../models/variantModel');

const router = express.Router();

const hasErrors = (errors) => Object.keys(errors).length > 0;
const blank = (x) => x === undefined || x === null || String(x).trim() === '';

/* ====================================================================
   DANH MỤC
   ==================================================================== */

function parseCategory(b) {
  const errors = {};
  const name = v.requiredLine(b.name, 'tên danh mục', 100);
  if (name.error) errors.name = name.error;
  const slug = v.slug(v.line(b.slug, 120) || slugify(name.value || ''));
  if (slug.error) errors.slug = slug.error;
  const description = v.optionalLine(b.description, 'mô tả', 500);
  if (description.error) errors.description = description.error;
  const sort = v.intInRange(blank(b.sortOrder) ? '0' : b.sortOrder, 'thứ tự', 0, 9999);
  if (sort.error) errors.sortOrder = sort.error;
  const parentId = blank(b.parentId) ? null : v.id(b.parentId);
  if (!blank(b.parentId) && !parentId) errors.parentId = 'Danh mục cha không hợp lệ.';
  return {
    errors,
    data: { parentId, name: name.value, slug: slug.value, description: description.value, sortOrder: sort.value, isActive: v.checked(b.isActive) },
  };
}

async function renderCategoryForm(res, { title, category, errors = {}, status = 200 }) {
  const all = await categoryModel.adminList();
  const selfId = category && category.id ? category.id : null;
  const parents = all.filter((c) => !c.parentId && c.id !== selfId);
  res.status(status).render('admin/category-form', {
    title, category: category || { isActive: true, sortOrder: 0 }, parents, errors,
  });
}

router.get('/categories', ah(async (req, res) => {
  res.render('admin/categories', { title: 'Danh mục', categories: await categoryModel.adminList() });
}));

router.get('/categories/new', ah((req, res) => renderCategoryForm(res, { title: 'Thêm danh mục' })));

router.post('/categories/new', ah(async (req, res) => {
  const { errors, data } = parseCategory(req.body);
  if (hasErrors(errors)) return renderCategoryForm(res, { title: 'Thêm danh mục', category: req.body, errors, status: 400 });
  try {
    await categoryModel.save(data);
  } catch (err) {
    if (err instanceof BusinessError) {
      return renderCategoryForm(res, { title: 'Thêm danh mục', category: req.body, errors: { general: err.message }, status: 400 });
    }
    throw err;
  }
  return res.redirect('/admin/categories');
}));

router.get('/categories/:id/edit', ah(async (req, res) => {
  const id = v.id(req.params.id);
  const category = id ? await categoryModel.getById(id) : null;
  if (!category) throw new NotFoundError('Không tìm thấy danh mục.');
  return renderCategoryForm(res, { title: 'Sửa danh mục', category });
}));

router.post('/categories/:id/edit', ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (!id || !(await categoryModel.getById(id))) throw new NotFoundError('Không tìm thấy danh mục.');
  const { errors, data } = parseCategory(req.body);
  const shown = { ...req.body, id };
  if (hasErrors(errors)) return renderCategoryForm(res, { title: 'Sửa danh mục', category: shown, errors, status: 400 });
  try {
    await categoryModel.save({ id, ...data });
  } catch (err) {
    if (err instanceof BusinessError) {
      return renderCategoryForm(res, { title: 'Sửa danh mục', category: shown, errors: { general: err.message }, status: 400 });
    }
    throw err;
  }
  return res.redirect('/admin/categories');
}));

router.post('/categories/:id/toggle', ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (id) await categoryModel.setActive(id, req.body.active === '1');
  res.redirect('/admin/categories');
}));

/* ====================================================================
   SẢN PHẨM
   ==================================================================== */

function parseProduct(b) {
  const errors = {};
  const categoryId = v.id(b.categoryId);
  if (!categoryId) errors.categoryId = 'Vui lòng chọn danh mục.';
  const code = v.requiredLine(b.code, 'mã sản phẩm', 30);
  if (code.error) errors.code = code.error;
  const name = v.requiredLine(b.name, 'tên sản phẩm', 200);
  if (name.error) errors.name = name.error;
  const slug = v.slug(v.line(b.slug, 220) || slugify(name.value || ''));
  if (slug.error) errors.slug = slug.error;
  const description = v.optionalText(b.description, 'mô tả', 5000);
  if (description.error) errors.description = description.error;
  const material = v.optionalLine(b.material, 'chất liệu', 200);
  if (material.error) errors.material = material.error;
  const images = v.imageLines(b.images, shop.limits.maxImagesPerProduct);
  if (images.error) errors.images = images.error;
  return {
    errors,
    data: {
      categoryId, code: code.value, name: name.value, slug: slug.value, description: description.value, material: material.value,
      isFeatured: v.checked(b.isFeatured), isActive: v.checked(b.isActive), images: images.value || [],
    },
  };
}

async function renderProductForm(res, { title, product, errors = {}, status = 200 }) {
  const categories = await categoryModel.adminList();
  res.status(status).render('admin/product-form', {
    title, product: product || { isActive: true, images: '' }, categories, errors,
  });
}

router.get('/products', ah(async (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const q = typeof req.query.q === 'string' ? v.line(req.query.q, 100) : '';
  const categoryId = v.id(req.query.category);
  const active = req.query.active === '1' ? 1 : (req.query.active === '0' ? 0 : undefined);
  const [{ items, pagination }, categories] = await Promise.all([
    productModel.adminList({ q: q || null, categoryId, active, page }),
    categoryModel.adminList(),
  ]);
  res.render('admin/products', {
    title: 'Sản phẩm', items, pagination, categories,
    filters: { q, category: categoryId || '', active: active === undefined ? '' : String(active) },
    baseQuery: toQuery({ q, category: categoryId, active }),
  });
}));

router.get('/products/new', ah((req, res) => renderProductForm(res, { title: 'Thêm sản phẩm' })));

router.post('/products/new', ah(async (req, res) => {
  const { errors, data } = parseProduct(req.body);
  if (hasErrors(errors)) return renderProductForm(res, { title: 'Thêm sản phẩm', product: req.body, errors, status: 400 });
  let id;
  try {
    id = await productModel.save(data);
  } catch (err) {
    if (err instanceof BusinessError) {
      return renderProductForm(res, { title: 'Thêm sản phẩm', product: req.body, errors: { general: err.message }, status: 400 });
    }
    throw err;
  }
  return res.redirect(`/admin/products/${id}/variants`); // thêm biến thể ngay sau khi tạo sản phẩm
}));

router.get('/products/:id/edit', ah(async (req, res) => {
  const id = v.id(req.params.id);
  const product = id ? await productModel.adminGet(id) : null;
  if (!product) throw new NotFoundError('Không tìm thấy sản phẩm.');
  product.images = product.images.join('\n');
  return renderProductForm(res, { title: 'Sửa sản phẩm', product });
}));

router.post('/products/:id/edit', ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (!id || !(await productModel.adminGet(id))) throw new NotFoundError('Không tìm thấy sản phẩm.');
  const { errors, data } = parseProduct(req.body);
  const shown = { ...req.body, id };
  if (hasErrors(errors)) return renderProductForm(res, { title: 'Sửa sản phẩm', product: shown, errors, status: 400 });
  try {
    await productModel.save({ id, ...data });
  } catch (err) {
    if (err instanceof BusinessError) {
      return renderProductForm(res, { title: 'Sửa sản phẩm', product: shown, errors: { general: err.message }, status: 400 });
    }
    throw err;
  }
  return res.redirect('/admin/products');
}));

router.post('/products/:id/toggle', ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (id) await productModel.setActive(id, req.body.active === '1');
  res.redirect('/admin/products');
}));

/* ====================================================================
   BIẾN THỂ: size S/M/L/XL, màu, giá, SKU, tồn kho riêng
   ==================================================================== */

function parseVariant(b) {
  const sku = v.requiredLine(b.sku, 'SKU', 50);
  const size = v.size(b.size);
  const color = v.requiredLine(b.color, 'tên màu', 50);
  const hex = v.hexColor(b.hex);
  const price = v.intInRange(b.price, 'giá bán', 0, 50000000);
  const compareAt = blank(b.compareAt) ? { value: null } : v.intInRange(b.compareAt, 'giá gốc', 0, 50000000);
  const stock = v.intInRange(blank(b.stock) ? '0' : b.stock, 'tồn kho', 0, 1000000);

  const first = [sku, size, color, hex, price, compareAt, stock].find((x) => x.error);
  if (first) throw new BusinessError(first.error);
  if (compareAt.value !== null && compareAt.value <= price.value) throw new BusinessError('Giá gốc phải lớn hơn giá bán.');
  return {
    sku: sku.value, size: size.value, color: color.value, hex: hex.value, price: price.value,
    compareAt: compareAt.value, stock: stock.value, isActive: v.checked(b.isActive),
  };
}

router.get('/products/:id/variants', ah(async (req, res) => {
  const id = v.id(req.params.id);
  const product = id ? await productModel.adminGet(id) : null;
  if (!product) throw new NotFoundError('Không tìm thấy sản phẩm.');
  const variants = await variantModel.listByProduct(id);
  res.render('admin/variants', { title: `Biến thể: ${product.name}`, product, variants, sizes: v.SIZES });
}));

router.post('/products/:id/variants', ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (!id) throw new NotFoundError();
  await variantModel.create(id, parseVariant(req.body), req.user.id);
  res.redirect(`/admin/products/${id}/variants`);
}));

router.post('/products/:id/variants/:vid', ah(async (req, res) => {
  const vid = v.id(req.params.vid);
  if (!vid) throw new NotFoundError();
  const productId = await variantModel.update(vid, parseVariant(req.body), req.user.id);
  res.redirect(`/admin/products/${productId}/variants`);
}));

router.post('/products/:id/variants/:vid/delete', ah(async (req, res) => {
  const vid = v.id(req.params.vid);
  if (!vid) throw new NotFoundError();
  const productId = await variantModel.remove(vid);
  res.redirect(`/admin/products/${productId}/variants`);
}));

module.exports = router;
