'use strict';
/**
 * [UC04] Quản trị đơn hàng: danh sách, chi tiết, chuyển trạng thái (xác nhận, tạo vận đơn, giao, hủy, trả hàng)
 * và ghi nhận hoàn tiền. Việc đổi trạng thái, kho, vận đơn, thanh toán nằm trong services/orderService.
 */
const express = require('express');
const ah = require('../../utils/asyncHandler');
const v = require('../../utils/validate');
const S = require('../../utils/orderStatus');
const { toQuery } = require('../../utils/query');
const { fromDateInput, addDays } = require('../../utils/time');
const { BusinessError, NotFoundError } = require('../../utils/errors');
const shop = require('../../config/shop');
const orderModel = require('../../models/orderModel');
const paymentModel = require('../../models/paymentModel');
const orderService = require('../../services/orderService');

const router = express.Router();

router.get('/orders', ah(async (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const status = S.isValid(req.query.status) ? req.query.status : '';
  const q = typeof req.query.q === 'string' ? v.line(req.query.q, 100) : '';
  const fromStr = typeof req.query.from === 'string' && fromDateInput(req.query.from) ? req.query.from : '';
  const toStr = typeof req.query.to === 'string' && fromDateInput(req.query.to) ? req.query.to : '';
  const refund = req.query.refund === '1';

  const [list, counts, refundCount] = await Promise.all([
    orderModel.adminList({
      status: status || null,
      q: q || null,
      dateFrom: fromStr ? fromDateInput(fromStr) : null,
      dateTo: toStr ? addDays(fromDateInput(toStr), 1) : null, // gồm cả ngày cuối
      refund,
      page,
    }),
    orderModel.statusCounts(),
    orderModel.refundCount(),
  ]);
  res.render('admin/orders', {
    title: 'Đơn hàng',
    items: list.items,
    pagination: list.pagination,
    counts,
    refundCount,
    filters: { status, q, from: fromStr, to: toStr, refund },
    baseQuery: toQuery({ status, q, from: fromStr, to: toStr, refund: refund ? '1' : '' }),
  });
}));

router.get('/orders/:code', ah(async (req, res) => {
  const order = await orderModel.getByCode(v.line(req.params.code, 30));
  if (!order) throw new NotFoundError('Không tìm thấy đơn hàng.');
  const webhookLogs = await paymentModel.recentWebhookLogs(order.id);
  res.render('admin/order-detail', {
    title: `Đơn ${order.code}`,
    order,
    nextStatuses: S.nextStatuses(order.status, 'ADMIN'),
    carriers: shop.carriers,
    webhookLogs,
  });
}));

/** Chuyển trạng thái. Sang "Đang giao" bắt buộc có đơn vị vận chuyển và mã vận đơn (tạo vận đơn). */
router.post('/orders/:code/status', ah(async (req, res) => {
  const code = v.line(req.params.code, 30);
  const toStatus = v.line(req.body.toStatus, 20);
  const note = v.optionalLine(req.body.note, 'ghi chú', 255);
  if (note.error) throw new BusinessError(note.error);

  let shipping = null;
  if (toStatus === S.STATUS.SHIPPING) {
    const carrier = v.line(req.body.carrier, 50);
    const tracking = v.requiredLine(req.body.trackingCode, 'mã vận đơn', 50);
    const shippingNote = v.optionalLine(req.body.shippingNote, 'ghi chú vận đơn', 255);
    if (!shop.carriers.includes(carrier)) throw new BusinessError('Vui lòng chọn đơn vị vận chuyển.');
    const bad = tracking.error || shippingNote.error;
    if (bad) throw new BusinessError(bad);
    shipping = { carrier, trackingCode: tracking.value, note: shippingNote.value };
  }

  await orderService.changeStatus({
    orderCode: code,
    toStatus,
    actor: 'ADMIN',
    actorUserId: req.user.id,
    expectedFrom: v.line(req.body.expectedFrom, 20) || null,
    note: note.value,
    shipping,
  });
  res.redirect(`/admin/orders/${encodeURIComponent(code)}`);
}));

/** Ghi nhận đã hoàn tiền cho đơn đã hủy hoặc đã trả hàng mà khách đã thanh toán. */
router.post('/orders/:code/refund', ah(async (req, res) => {
  const code = v.line(req.params.code, 30);
  const note = v.optionalLine(req.body.note, 'ghi chú', 255);
  if (note.error) throw new BusinessError(note.error);
  await orderService.markRefunded({ orderCode: code, adminUserId: req.user.id, note: note.value });
  res.redirect(`/admin/orders/${encodeURIComponent(code)}`);
}));

module.exports = router;
