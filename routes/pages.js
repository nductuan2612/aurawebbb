'use strict';
/**
 * Các trang công khai: trang chủ, danh sách sản phẩm (tìm kiếm, lọc giá/size/màu, sắp xếp),
 * chi tiết sản phẩm (biến thể, tồn kho, đánh giá) và 4 trang pháp lý TMĐT.
 */
const express = require('express');
const ah = require('../utils/asyncHandler');
const v = require('../utils/validate');
const { NotFoundError } = require('../utils/errors');
const productModel = require('../models/productModel');
const categoryModel = require('../models/categoryModel');
const reviewModel = require('../models/reviewModel');
const shop = require('../config/shop');

const router = express.Router();

/** Chuyển giá trị query (chuỗi hoặc mảng chuỗi) thành mảng chuỗi sạch, giới hạn số phần tử. */
function listParam(raw, max) {
  return [].concat(raw === undefined ? [] : raw)
    .filter((x) => typeof x === 'string')
    .map((x) => v.line(x, 50))
    .filter(Boolean)
    .slice(0, max);
}

function parseListQuery(query) {
  const filters = {};
  const q = typeof query.q === 'string' ? v.line(query.q, 100) : '';
  if (q) filters.q = q;

  const category = typeof query.category === 'string' ? v.slug(query.category) : null;
  if (category && !category.error) filters.category = category.value;

  const sizes = listParam(query.size, 4).map((s) => s.toUpperCase()).filter((s) => v.SIZES.includes(s));
  if (sizes.length) filters.sizes = [...new Set(sizes)];

  const colors = listParam(query.color, 12);
  if (colors.length) filters.colors = [...new Set(colors)];

  for (const [param, key] of [['min', 'minPrice'], ['max', 'maxPrice']]) {
    const raw = typeof query[param] === 'string' ? query[param].trim() : '';
    if (raw) {
      const r = v.intInRange(raw, 'giá', 0, 50000000);
      if (!r.error) filters[key] = r.value;
    }
  }
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
    [filters.minPrice, filters.maxPrice] = [filters.maxPrice, filters.minPrice];
  }
  if (query.sale === '1') filters.onSale = true;

  const sort = typeof query.sort === 'string' && Object.prototype.hasOwnProperty.call(productModel.SORTS, query.sort) ? query.sort : 'newest';
  const page = Number.parseInt(query.page, 10) || 1;
  return { filters, sort, page };
}

/** Chuỗi query giữ nguyên bộ lọc, dùng cho liên kết phân trang. */
function baseQueryString(filters, sort) {
  const p = new URLSearchParams();
  if (filters.q) p.set('q', filters.q);
  if (filters.category) p.set('category', filters.category);
  (filters.sizes || []).forEach((s) => p.append('size', s));
  (filters.colors || []).forEach((c) => p.append('color', c));
  if (filters.minPrice !== undefined) p.set('min', String(filters.minPrice));
  if (filters.maxPrice !== undefined) p.set('max', String(filters.maxPrice));
  if (filters.onSale) p.set('sale', '1');
  if (sort && sort !== 'newest') p.set('sort', sort);
  return p.toString();
}

/* ====================================================================
   TRANG CHỦ
   ==================================================================== */

router.get('/', ah(async (req, res) => {
  const [featured, newest, bestsellers] = await Promise.all([
    productModel.top({ featured: true }, 3, 'newest'),
    productModel.top({}, 8, 'newest'),
    productModel.top({}, 4, 'bestseller'),
  ]);
  res.render('shop/home', { title: shop.name, featured, newest, bestsellers });
}));

/* ====================================================================
   DANH SÁCH SẢN PHẨM
   ==================================================================== */

async function renderList(req, res, extra = {}) {
  const { filters, sort, page } = parseListQuery(req.query);
  if (extra.category) filters.category = extra.category.slug;

  const [{ items, pagination }, facets] = await Promise.all([
    productModel.list(filters, { page, sort }),
    productModel.facets(),
  ]);

  const category = extra.category || (filters.category ? await categoryModel.findBySlug(filters.category) : null);
  const basePath = extra.basePath || '/products';
  let heading = 'Tất cả sản phẩm';
  if (filters.q) heading = `Kết quả cho "${filters.q}"`;
  else if (category) heading = category.name;
  else if (filters.onSale) heading = 'Đang giảm giá';

  res.render('shop/products', {
    title: heading,
    heading,
    category,
    items,
    pagination,
    filters,
    sort,
    sorts: productModel.SORT_LABELS,
    facets,
    basePath,
    baseQuery: baseQueryString(
      extra.category ? { ...filters, category: undefined } : filters,
      sort,
    ),
    sizes: v.SIZES,
  });
}

router.get('/products', ah((req, res) => renderList(req, res)));

router.get('/category/:slug', ah(async (req, res) => {
  const slug = v.slug(req.params.slug);
  if (slug.error) throw new NotFoundError();
  const category = await categoryModel.findBySlug(slug.value);
  if (!category) throw new NotFoundError('Không tìm thấy danh mục.');
  return renderList(req, res, { category, basePath: `/category/${category.slug}` });
}));

/* ====================================================================
   CHI TIẾT SẢN PHẨM: biến thể, tồn kho, đánh giá
   ==================================================================== */

router.get('/products/:slug', ah(async (req, res) => {
  const slug = v.slug(req.params.slug);
  if (slug.error) throw new NotFoundError();
  const product = await productModel.getBySlug(slug.value);
  if (!product) throw new NotFoundError('Không tìm thấy sản phẩm.');

  const page = Number.parseInt(req.query.rpage, 10) || 1;
  const [reviews, summary, related, eligible] = await Promise.all([
    reviewModel.listVisible(product.id, { page, perPage: 5 }),
    reviewModel.summary(product.id),
    productModel.top({ category: product.categorySlug, excludeId: product.id }, 4, 'bestseller'),
    // [UC09] chỉ những dòng hàng thuộc đơn "Đã giao" của chính khách này mới được hiện form đánh giá
    req.user ? reviewModel.eligibleForProduct(req.user.id, product.id) : Promise.resolve([]),
  ]);

  const colors = [];
  for (const variant of product.variants) {
    if (!colors.some((c) => c.name === variant.color)) colors.push({ name: variant.color, hex: variant.hex });
  }

  res.render('shop/product', {
    title: product.name,
    product,
    colors,
    sizes: v.SIZES,
    reviews,
    summary,
    related,
    eligible,
    reviewed: req.query.reviewed === '1',
  });
}));

/* ====================================================================
   TRANG PHÁP LÝ TMĐT
   ==================================================================== */

const LEGAL = Object.freeze({
  seller: { view: 'legal/seller', title: 'Thông tin người bán' },
  terms: { view: 'legal/terms', title: 'Điều khoản sử dụng' },
  privacy: { view: 'legal/privacy', title: 'Chính sách bảo vệ dữ liệu cá nhân' },
  returns: { view: 'legal/returns', title: 'Chính sách đổi trả' },
});

router.get('/legal/:page', (req, res, next) => {
  const page = Object.prototype.hasOwnProperty.call(LEGAL, req.params.page) ? LEGAL[req.params.page] : null;
  if (!page) return next(new NotFoundError());
  return res.render(page.view, { title: page.title });
});

module.exports = router;
