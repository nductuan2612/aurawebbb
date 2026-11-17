'use strict';
/**
 * [UC04] Máy trạng thái đơn hàng: đủ 6 trạng thái theo đề bài và quy tắc chuyển trạng thái.
 *
 *   Chờ xác nhận ──► Đã xác nhận ──► Đang giao ──► Đã giao ──► Trả hàng/Hoàn tiền
 *        │                 │               └──────────────────────────▲
 *        └──► Đã hủy ◄─────┘
 *
 * Tác dụng phụ về kho (do services/orderService thực hiện, quyết định ở đây để dễ kiểm thử):
 *   - Chờ xác nhận -> Đã xác nhận           : TRỪ tồn kho
 *   - Đã xác nhận/Đang giao/Đã giao -> Đã hủy hoặc Trả hàng : HOÀN tồn kho
 *   - Chờ xác nhận -> Đã hủy                : không đụng kho (chưa trừ)
 */
const STATUS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  SHIPPING: 'SHIPPING',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
});

const LABELS = Object.freeze({
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
  RETURNED: 'Trả hàng/Hoàn tiền',
});

const ACTION_LABELS = Object.freeze({
  CONFIRMED: 'Xác nhận đơn',
  SHIPPING: 'Tạo vận đơn và giao hàng',
  DELIVERED: 'Đã giao thành công',
  CANCELLED: 'Hủy đơn',
  RETURNED: 'Ghi nhận trả hàng/hoàn tiền',
});

const ORDER = Object.freeze(['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED']);

// Trạng thái hiện tại -> { trạng thái đích: [vai trò được phép] }
const TRANSITIONS = Object.freeze({
  PENDING: { CONFIRMED: ['ADMIN'], CANCELLED: ['ADMIN', 'CUSTOMER'] },
  CONFIRMED: { SHIPPING: ['ADMIN'], CANCELLED: ['ADMIN'] },
  SHIPPING: { DELIVERED: ['ADMIN'], RETURNED: ['ADMIN'] },
  DELIVERED: { RETURNED: ['ADMIN'] },
  CANCELLED: {},
  RETURNED: {},
});

const STOCK_DEDUCTED_STATES = Object.freeze(['CONFIRMED', 'SHIPPING', 'DELIVERED']);

function isValid(code) {
  return Object.prototype.hasOwnProperty.call(LABELS, code);
}

function label(code) {
  return LABELS[code] || String(code);
}

function badgeClass(code) {
  return `status-${String(code).toLowerCase()}`;
}

function canTransition(from, to, actor) {
  const allowed = TRANSITIONS[from] && TRANSITIONS[from][to];
  return Boolean(allowed && allowed.includes(actor));
}

function nextStatuses(from, actor) {
  const targets = TRANSITIONS[from] || {};
  return Object.keys(targets).filter((to) => targets[to].includes(actor));
}

function isFinal(code) {
  return code === STATUS.CANCELLED || code === STATUS.RETURNED;
}

/** 'DEDUCT' = trừ kho, 'RESTORE' = hoàn kho, 'NONE' = không đổi. */
function stockEffect(from, to) {
  if (from === STATUS.PENDING && to === STATUS.CONFIRMED) return 'DEDUCT';
  if (STOCK_DEDUCTED_STATES.includes(from) && (to === STATUS.CANCELLED || to === STATUS.RETURNED)) return 'RESTORE';
  return 'NONE';
}

/** Hủy đơn thì trả lại lượt dùng mã giảm giá. Trả hàng thì không (khách đã hưởng ưu đãi). */
function releasesDiscount(to) {
  return to === STATUS.CANCELLED;
}

// Trạng thái thanh toán của đơn. NONE = đơn thanh toán online nhưng chưa bắt đầu lần thanh toán nào.
const PAYMENT_LABELS = Object.freeze({
  NONE: 'Chưa thanh toán',
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Thanh toán thất bại',
  CANCELLED: 'Đã hủy thanh toán',
  REFUNDED: 'Đã hoàn tiền',
});

/** Đơn COD chưa thu tiền hiển thị "Thanh toán khi nhận hàng" thay vì "Chờ thanh toán". */
function paymentLabel(method, state) {
  if (method === 'COD' && (state === 'PENDING' || state === 'NONE')) return 'Thanh toán khi nhận hàng';
  return PAYMENT_LABELS[state] || String(state);
}

function paymentBadgeClass(state) {
  return `pay-${String(state).toLowerCase()}`;
}

module.exports = {
  STATUS, LABELS, ACTION_LABELS, ORDER, TRANSITIONS, STOCK_DEDUCTED_STATES, PAYMENT_LABELS,
  isValid, label, badgeClass, canTransition, nextStatuses, isFinal, stockEffect, releasesDiscount,
  paymentLabel, paymentBadgeClass,
};
