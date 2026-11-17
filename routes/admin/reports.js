'use strict';
/**
 * Báo cáo thống kê: doanh thu theo thời gian (ngày hoặc tháng) và sản phẩm bán chạy.
 * Doanh thu tính trên đơn đang ở trạng thái "Đã giao", gom theo ngày giao (giờ Việt Nam).
 */
const express = require('express');
const ah = require('../../utils/asyncHandler');
const {
  fromDateInput, toDateInput, addDays, vnStartOfDay, vnStartOfMonth, vnStartOfNextMonth,
} = require('../../utils/time');
const reportModel = require('../../models/reportModel');

const router = express.Router();

const MAX_DAYS = 732;      // tối đa khoảng 2 năm
const DAILY_LIMIT = 92;    // quá 92 ngày thì tự gom theo tháng để biểu đồ còn đọc được
const DAY_MS = 86400000;

/** Bổ sung các ngày/tháng không có đơn (doanh thu 0) để biểu đồ liền mạch. */
function buildSeries(rows, from, to, group) {
  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const out = [];
  const push = (key, label) => {
    const r = byPeriod.get(key);
    out.push({ period: key, label, orders: r ? r.orders : 0, revenue: r ? r.revenue : 0 });
  };
  if (group === 'month') {
    for (let cur = vnStartOfMonth(from); cur < to; cur = vnStartOfNextMonth(cur)) {
      const key = toDateInput(cur).slice(0, 7);
      push(key, `${key.slice(5)}/${key.slice(0, 4)}`);
    }
  } else {
    for (let cur = from; cur < to; cur = addDays(cur, 1)) {
      const key = toDateInput(cur);
      push(key, `${key.slice(8)}/${key.slice(5, 7)}`);
    }
  }
  return out;
}

/** Tính sẵn hình học biểu đồ cột (SVG) để view chỉ việc in ra, không cần style nội tuyến. */
function buildChart(series) {
  const W = 960;
  const H = 280;
  const padX = 8;
  const padTop = 12;
  const padBottom = 28;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const max = Math.max(1, ...series.map((s) => s.revenue));
  const slot = plotW / Math.max(1, series.length);
  const barW = Math.max(2, slot * 0.68);
  const bars = series.map((s, i) => {
    const h = s.revenue > 0 ? Math.max(2, Math.round((s.revenue / max) * plotH)) : 0;
    return {
      x: Math.round(padX + i * slot + (slot - barW) / 2),
      y: padTop + plotH - h,
      w: Math.round(barW),
      h,
      label: s.label,
      revenue: s.revenue,
      orders: s.orders,
    };
  });
  const ticks = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])]
    .filter((i) => i >= 0 && i < series.length)
    .map((i) => ({ x: Math.round(padX + i * slot + slot / 2), label: series[i].label }));
  return { W, H, baseY: padTop + plotH, labelY: H - 8, bars, ticks, max };
}

router.get('/reports', ah(async (req, res) => {
  const today = vnStartOfDay(new Date());
  const parsedFrom = typeof req.query.from === 'string' ? fromDateInput(req.query.from) : null;
  const parsedTo = typeof req.query.to === 'string' ? fromDateInput(req.query.to) : null;

  let from = parsedFrom || addDays(today, -29);
  let last = parsedTo || today; // ngày cuối, tính cả ngày này
  if (last < from) [from, last] = [last, from];
  if ((last - from) / DAY_MS > MAX_DAYS) from = addDays(last, -MAX_DAYS);
  const to = addDays(last, 1);

  const requested = req.query.group === 'month' ? 'month' : 'day';
  const days = Math.round((to - from) / DAY_MS);
  const group = requested === 'day' && days > DAILY_LIMIT ? 'month' : requested;

  const [rows, topProducts, statusCounts] = await Promise.all([
    reportModel.revenue({ from, to, group }),
    reportModel.topProducts({ from, to, limit: 10 }),
    reportModel.statusBreakdown({ from, to }),
  ]);

  const series = buildSeries(rows, from, to, group);
  const totalRevenue = series.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = series.reduce((s, r) => s + r.orders, 0);

  res.render('admin/reports', {
    title: 'Báo cáo',
    series,
    chart: buildChart(series),
    topProducts,
    statusCounts,
    totals: { revenue: totalRevenue, orders: totalOrders, average: totalOrders ? Math.round(totalRevenue / totalOrders) : 0 },
    group,
    autoGrouped: group !== requested,
    fromStr: toDateInput(from),
    toStr: toDateInput(last),
  });
}));

module.exports = router;
