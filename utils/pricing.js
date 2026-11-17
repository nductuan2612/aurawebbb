'use strict';
/**
 * [UC05] Tính tiền và kiểm tra điều kiện mã giảm giá. Toàn bộ là hàm thuần, không đụng CSDL.
 *
 * Điều kiện áp dụng mã (đúng theo đề bài):
 *   - giá trị đơn tối thiểu (MinOrderValue)
 *   - thời hạn (StartsAt đến EndsAt)
 *   - số lượt dùng (UsageLimit, UsedCount)
 * Việc "giữ chỗ" một lượt dùng khi đặt hàng được CSDL bảo đảm bằng một câu UPDATE có điều kiện
 * (xem services/orderService.js), nên hai đơn cùng lúc không thể vượt quá số lượt.
 */
const shop = require('../config/shop');
const { formatVnd } = require('./format');

/** Chuẩn hóa mã nhập vào. Trả về null nếu sai định dạng. */
function normalizeCode(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z0-9_-]{3,30}$/.test(s) ? s : null;
}

/** Số tiền được giảm. PERCENT làm tròn xuống và bị chặn bởi MaxDiscountAmount; FIXED không vượt giá trị đơn. */
function computeDiscountAmount(discount, subtotal) {
  if (!discount || !(subtotal > 0)) return 0;
  let amount;
  if (discount.DiscountType === 'PERCENT') {
    amount = Math.floor((subtotal * discount.DiscountValue) / 100);
    if (discount.MaxDiscountAmount !== null && discount.MaxDiscountAmount !== undefined) {
      amount = Math.min(amount, discount.MaxDiscountAmount);
    }
  } else {
    amount = discount.DiscountValue;
  }
  return Math.max(0, Math.min(amount, subtotal));
}

/** Kiểm tra mã có áp dụng được cho đơn hàng này không. Trả về { ok, message, amount }. */
function evaluateDiscount(discount, subtotal, now = new Date()) {
  const fail = (message) => ({ ok: false, message, amount: 0 });
  if (!discount) return fail('Mã giảm giá không tồn tại.');
  if (!discount.IsActive) return fail('Mã giảm giá này đã ngừng áp dụng.');
  if (now < new Date(discount.StartsAt)) return fail('Mã giảm giá chưa đến thời gian áp dụng.');
  if (now > new Date(discount.EndsAt)) return fail('Mã giảm giá đã hết hạn.');
  if (discount.UsageLimit !== null && discount.UsageLimit !== undefined && discount.UsedCount >= discount.UsageLimit) {
    return fail('Mã giảm giá đã hết lượt sử dụng.');
  }
  if (subtotal < discount.MinOrderValue) {
    return fail(`Đơn hàng cần đạt tối thiểu ${formatVnd(discount.MinOrderValue)} để dùng mã này.`);
  }
  return { ok: true, message: 'Áp dụng mã giảm giá thành công.', amount: computeDiscountAmount(discount, subtotal) };
}

/** Miễn phí giao hàng khi giá trị đơn SAU giảm giá đạt ngưỡng. */
function shippingFeeFor(amountAfterDiscount) {
  return amountAfterDiscount >= shop.shipping.freeFrom ? 0 : shop.shipping.fee;
}

function computeTotals(subtotal, discountAmount = 0) {
  const discount = Math.min(Math.max(0, discountAmount), subtotal);
  const shippingFee = shippingFeeFor(subtotal - discount);
  return { subtotal, discountAmount: discount, shippingFee, total: subtotal - discount + shippingFee };
}

/** [UC12] Trạng thái hiển thị của một mã trong trang quản trị (tính từ các cột CSDL). */
function discountState(d, now = new Date()) {
  if (!d.IsActive) return { code: 'PAUSED', label: 'Tạm dừng' };
  if (now < new Date(d.StartsAt)) return { code: 'UPCOMING', label: 'Chưa đến hạn' };
  if (now > new Date(d.EndsAt)) return { code: 'EXPIRED', label: 'Đã hết hạn' };
  if (d.UsageLimit !== null && d.UsageLimit !== undefined && d.UsedCount >= d.UsageLimit) {
    return { code: 'USED_UP', label: 'Hết lượt' };
  }
  return { code: 'ACTIVE', label: 'Đang áp dụng' };
}

module.exports = { normalizeCode, computeDiscountAmount, evaluateDiscount, shippingFeeFor, computeTotals, discountState };
