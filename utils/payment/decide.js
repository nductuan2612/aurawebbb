'use strict';
/**
 * [UC06] Quyết định cách xử lý MỘT sự kiện thanh toán từ cổng (IPN/webhook).
 * Hàm thuần, không đụng CSDL, nên kiểm thử được đầy đủ: gửi lặp, sai số tiền, thanh toán muộn, trả tiền hai lần...
 *
 *   payment : bản ghi Payments hiện có { status, amount, gatewayTxnNo } hoặc null
 *   event   : { success, amount, txnNo } lấy từ thông báo ĐÃ qua kiểm tra chữ ký
 *   ctx     : { otherPaid:   đơn đã có một lần thanh toán KHÁC ở trạng thái PAID,
 *               orderClosed: đơn đã hủy hoặc đã trả hàng }
 *
 * Trả về { action, outcome, needsRefund }
 *   action  : MARK_PAID | MARK_FAILED | NONE
 *   outcome : PAID | PAID_ORDER_CLOSED | FAILED | DUPLICATE | DUPLICATE_OTHER_TXN | DOUBLE_PAYMENT
 *             | IGNORED | AMOUNT_MISMATCH | PAYMENT_NOT_FOUND
 *
 * IDEMPOTENCY: thông báo thành công đến lần thứ hai cho một khoản đã PAID luôn ra action NONE (outcome DUPLICATE),
 * nên gửi lặp bao nhiêu lần cũng không đổi dữ liệu và không cộng tiền hai lần.
 */
function sameTxn(a, b) {
  const x = a === null || a === undefined ? '' : String(a);
  const y = b === null || b === undefined ? '' : String(b);
  return x === y;
}

function decide(payment, event, ctx = {}) {
  const none = (outcome) => ({ action: 'NONE', outcome, needsRefund: false });

  if (!payment) return none('PAYMENT_NOT_FOUND');
  if (!Number.isFinite(event.amount) || event.amount !== Number(payment.amount)) return none('AMOUNT_MISMATCH');

  if (event.success) {
    if (payment.status === 'PAID') return none(sameTxn(payment.gatewayTxnNo, event.txnNo) ? 'DUPLICATE' : 'DUPLICATE_OTHER_TXN');
    if (payment.status === 'REFUNDED') return none('DUPLICATE');
    if (ctx.otherPaid) return none('DOUBLE_PAYMENT');
    // PENDING, FAILED hoặc CANCELLED (khách trả muộn sau khi bị thay bằng lần thử mới) đều ghi nhận là đã trả.
    const closed = Boolean(ctx.orderClosed);
    return { action: 'MARK_PAID', outcome: closed ? 'PAID_ORDER_CLOSED' : 'PAID', needsRefund: closed };
  }

  if (payment.status === 'PENDING') return { action: 'MARK_FAILED', outcome: 'FAILED', needsRefund: false };
  return none('IGNORED');
}

module.exports = { decide };
