'use strict';
/**
 * [UC12] Quản trị mã giảm giá: tạo, sửa, bật/tắt. Điều kiện áp dụng gồm giá trị đơn tối thiểu,
 * thời hạn (bắt đầu, kết thúc) và số lượt dùng. Việc kiểm tra điều kiện khi khách nhập mã nằm ở [UC05] (utils/pricing).
 */
const express = require('express');
const ah = require('../../utils/asyncHandler');
const v = require('../../utils/validate');
const { normalizeCode, discountState } = require('../../utils/pricing');
const { fromDateTimeLocal, toDateTimeLocal, addDays } = require('../../utils/time');
const { BusinessError, NotFoundError } = require('../../utils/errors');
const discountModel = require('../../models/discountModel');

const router = express.Router();

const blank = (x) => x === undefined || x === null || String(x).trim() === '';

function parseDiscount(b) {
  const errors = {};
  const code = normalizeCode(b.code);
  if (!code) errors.code = 'Mã gồm 3 đến 30 ký tự: chữ không dấu, số, gạch ngang hoặc gạch dưới, không có khoảng trắng.';

  const type = b.discountType === 'PERCENT' || b.discountType === 'FIXED' ? b.discountType : null;
  if (!type) errors.discountType = 'Vui lòng chọn loại giảm giá.';

  const value = v.intInRange(b.value, type === 'PERCENT' ? 'phần trăm giảm' : 'số tiền giảm', 1, type === 'PERCENT' ? 100 : 50000000);
  if (value.error) errors.value = value.error;

  let maxAmount = null;
  if (type === 'PERCENT' && !blank(b.maxAmount)) {
    const m = v.intInRange(b.maxAmount, 'mức giảm tối đa', 1, 50000000);
    if (m.error) errors.maxAmount = m.error;
    else maxAmount = m.value;
  }

  let minOrderValue = 0;
  if (!blank(b.minOrderValue)) {
    const m = v.intInRange(b.minOrderValue, 'giá trị đơn tối thiểu', 0, 50000000);
    if (m.error) errors.minOrderValue = m.error;
    else minOrderValue = m.value;
  }

  const startsAt = fromDateTimeLocal(b.startsAt);
  const endsAt = fromDateTimeLocal(b.endsAt);
  if (!startsAt) errors.startsAt = 'Vui lòng chọn thời điểm bắt đầu.';
  if (!endsAt) errors.endsAt = 'Vui lòng chọn thời điểm kết thúc.';
  if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = 'Thời điểm kết thúc phải sau thời điểm bắt đầu.';

  let usageLimit = null;
  if (!blank(b.usageLimit)) {
    const m = v.intInRange(b.usageLimit, 'số lượt tối đa', 1, 1000000);
    if (m.error) errors.usageLimit = m.error;
    else usageLimit = m.value;
  }

  const description = v.optionalLine(b.description, 'mô tả', 255);
  if (description.error) errors.description = description.error;

  return {
    errors,
    data: {
      code, description: description.value, type, value: value.value, maxAmount, minOrderValue,
      startsAt, endsAt, usageLimit, isActive: v.checked(b.isActive),
    },
  };
}

/** Đổi dòng CSDL (tên cột PascalCase) sang giá trị điền sẵn cho form. */
function toForm(d) {
  return {
    id: d.DiscountId,
    code: d.Code,
    description: d.Description || '',
    discountType: d.DiscountType,
    value: d.DiscountValue,
    maxAmount: d.MaxDiscountAmount || '',
    minOrderValue: d.MinOrderValue,
    startsAt: toDateTimeLocal(d.StartsAt),
    endsAt: toDateTimeLocal(d.EndsAt),
    usageLimit: d.UsageLimit || '',
    usedCount: d.UsedCount,
    isActive: Boolean(d.IsActive),
  };
}

function renderForm(res, { title, discount, errors = {}, status = 200 }) {
  res.status(status).render('admin/discount-form', { title, discount, errors });
}

router.get('/discounts', ah(async (req, res) => {
  const now = new Date();
  const rows = await discountModel.adminList();
  const discounts = rows.map((d) => ({ ...d, state: discountState(d, now) }));
  res.render('admin/discounts', { title: 'Mã giảm giá', discounts });
}));

router.get('/discounts/new', (req, res) => {
  const now = new Date();
  renderForm(res, {
    title: 'Thêm mã giảm giá',
    discount: {
      discountType: 'PERCENT', value: '', maxAmount: '', minOrderValue: 0, usageLimit: '',
      startsAt: toDateTimeLocal(now), endsAt: toDateTimeLocal(addDays(now, 30)), isActive: true,
    },
  });
});

router.post('/discounts/new', ah(async (req, res) => {
  const { errors, data } = parseDiscount(req.body);
  if (Object.keys(errors).length) return renderForm(res, { title: 'Thêm mã giảm giá', discount: req.body, errors, status: 400 });
  try {
    await discountModel.save(data);
  } catch (err) {
    if (err instanceof BusinessError) {
      return renderForm(res, { title: 'Thêm mã giảm giá', discount: req.body, errors: { general: err.message }, status: 400 });
    }
    throw err;
  }
  return res.redirect('/admin/discounts');
}));

router.get('/discounts/:id/edit', ah(async (req, res) => {
  const id = v.id(req.params.id);
  const row = id ? await discountModel.getById(id) : null;
  if (!row) throw new NotFoundError('Không tìm thấy mã giảm giá.');
  renderForm(res, { title: 'Sửa mã giảm giá', discount: toForm(row) });
}));

router.post('/discounts/:id/edit', ah(async (req, res) => {
  const id = v.id(req.params.id);
  const row = id ? await discountModel.getById(id) : null;
  if (!row) throw new NotFoundError('Không tìm thấy mã giảm giá.');
  const { errors, data } = parseDiscount(req.body);
  const shown = { ...req.body, id, usedCount: row.UsedCount };
  if (Object.keys(errors).length) return renderForm(res, { title: 'Sửa mã giảm giá', discount: shown, errors, status: 400 });
  try {
    await discountModel.save({ id, ...data });
  } catch (err) {
    if (err instanceof BusinessError) {
      return renderForm(res, { title: 'Sửa mã giảm giá', discount: shown, errors: { general: err.message }, status: 400 });
    }
    throw err;
  }
  return res.redirect('/admin/discounts');
}));

router.post('/discounts/:id/toggle', ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (id) await discountModel.setActive(id, req.body.active === '1');
  res.redirect('/admin/discounts');
}));

module.exports = router;
