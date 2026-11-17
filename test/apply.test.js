'use strict';
// [UC06] Kiểm thử lớp áp dụng sự kiện thanh toán với CSDL giả trong bộ nhớ: xử lý lặp, đua nhau, đơn đã đóng...
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyEventInTx } = require('../services/payment/apply');

/** CSDL giả: trả lời đúng các câu lệnh mà apply.js gửi, mô phỏng điều kiện trạng thái của câu UPDATE. */
function makeDb({ payments, orders, loseRace = false }) {
  const history = [];
  return {
    history,
    async one(sql, p) {
      if (sql.includes('FROM Payments AS p')) {
        const pay = payments.find((x) => x.provider === p.prov && x.paymentRef === p.ref);
        if (!pay) return null;
        const o = orders[pay.orderId];
        return {
          id: pay.id, orderId: pay.orderId, amount: pay.amount, status: pay.status, gatewayTxnNo: pay.gatewayTxnNo,
          orderCode: o.code, userId: o.userId, orderStatus: o.status,
        };
      }
      throw new Error(`one: câu SQL không mong đợi: ${sql}`);
    },
    async scalar(sql, p) {
      if (sql.includes('PaymentId <> :pid')) {
        return payments.some((x) => x.orderId === p.oid && x.id !== p.pid && x.status === 'PAID') ? 1 : null;
      }
      throw new Error(`scalar: câu SQL không mong đợi: ${sql}`);
    },
    async query(sql, p) {
      if (sql.includes("SET Status = 'PAID'")) {
        const pay = payments.find((x) => x.id === p.id);
        if (!loseRace && pay && ['PENDING', 'FAILED', 'CANCELLED'].includes(pay.status)) {
          pay.status = 'PAID';
          pay.gatewayTxnNo = p.txn;
          return { rowsAffected: [1] };
        }
        return { rowsAffected: [0] };
      }
      if (sql.includes("SET Status = 'FAILED'")) {
        const pay = payments.find((x) => x.id === p.id);
        if (pay && pay.status === 'PENDING') {
          pay.status = 'FAILED';
          return { rowsAffected: [1] };
        }
        return { rowsAffected: [0] };
      }
      if (sql.includes('INSERT INTO OrderStatusHistory')) {
        history.push(p);
        return { rowsAffected: [1] };
      }
      throw new Error(`query: câu SQL không mong đợi: ${sql}`);
    },
  };
}

function scenario() {
  return {
    payments: [{ id: 1, orderId: 10, provider: 'MOCK', paymentRef: '111', amount: 801000, status: 'PENDING', gatewayTxnNo: null }],
    orders: { 10: { code: 'AM261104ABCDE', userId: 7, status: 'PENDING' } },
  };
}
const ev = (over = {}) => ({ provider: 'MOCK', paymentRef: '111', success: true, amount: 801000, txnNo: 'MOCK-111', responseCode: '00', ...over });

test('lần đầu: ghi nhận đã thanh toán và ghi lịch sử', async () => {
  const s = scenario();
  const db = makeDb(s);
  const r = await applyEventInTx(db, ev());
  assert.equal(r.outcome, 'PAID');
  assert.equal(r.orderCode, 'AM261104ABCDE');
  assert.equal(r.userId, 7);
  assert.equal(r.needsRefund, false);
  assert.equal(s.payments[0].status, 'PAID');
  assert.equal(s.payments[0].gatewayTxnNo, 'MOCK-111');
  assert.equal(db.history.length, 1);
});

test('IDEMPOTENCY: gửi lại đúng thông báo nhiều lần chỉ ghi nhận một lần', async () => {
  const s = scenario();
  const db = makeDb(s);
  assert.equal((await applyEventInTx(db, ev())).outcome, 'PAID');
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await applyEventInTx(db, ev())).outcome, 'DUPLICATE', `lần gửi lặp thứ ${i + 1}`);
  }
  assert.equal(s.payments[0].status, 'PAID');
  assert.equal(db.history.length, 1, 'không ghi lịch sử thêm khi gửi lặp');
});

test('hai thông báo đến cùng lúc: thông báo thua cuộc đua cũng ra DUPLICATE và không ghi lịch sử', async () => {
  const s = scenario();
  const db = makeDb({ ...s, loseRace: true });
  const r = await applyEventInTx(db, ev());
  assert.equal(r.outcome, 'DUPLICATE');
  assert.equal(db.history.length, 0);
});

test('sai số tiền: không đổi dữ liệu', async () => {
  const s = scenario();
  const db = makeDb(s);
  const r = await applyEventInTx(db, ev({ amount: 1000 }));
  assert.equal(r.outcome, 'AMOUNT_MISMATCH');
  assert.equal(s.payments[0].status, 'PENDING');
  assert.equal(db.history.length, 0);
});

test('mã tham chiếu không tồn tại', async () => {
  const s = scenario();
  const r = await applyEventInTx(makeDb(s), ev({ paymentRef: '999' }));
  assert.equal(r.outcome, 'PAYMENT_NOT_FOUND');
  assert.equal(r.paymentId, null);
});

test('thông báo thất bại rồi thông báo thành công đến muộn vẫn được ghi nhận', async () => {
  const s = scenario();
  const db = makeDb(s);
  const failed = await applyEventInTx(db, ev({ success: false, responseCode: '51', txnNo: null }));
  assert.equal(failed.outcome, 'FAILED');
  assert.equal(s.payments[0].status, 'FAILED');
  const late = await applyEventInTx(db, ev());
  assert.equal(late.outcome, 'PAID');
  assert.equal(s.payments[0].status, 'PAID');
});

test('thông báo thất bại không hạ cấp khoản đã PAID', async () => {
  const s = scenario();
  const db = makeDb(s);
  await applyEventInTx(db, ev());
  const r = await applyEventInTx(db, ev({ success: false, responseCode: '51', txnNo: null }));
  assert.equal(r.outcome, 'IGNORED');
  assert.equal(s.payments[0].status, 'PAID');
});

test('đơn đã hủy nhưng khách vẫn chuyển tiền: ghi nhận và báo cần hoàn tiền', async () => {
  const s = scenario();
  s.orders[10].status = 'CANCELLED';
  const db = makeDb(s);
  const r = await applyEventInTx(db, ev());
  assert.equal(r.outcome, 'PAID_ORDER_CLOSED');
  assert.equal(r.needsRefund, true);
  assert.equal(s.payments[0].status, 'PAID');
  assert.match(db.history[0].note, /hoàn tiền/);
});

test('trả tiền hai lần cho cùng một đơn: lần thứ hai bị chặn', async () => {
  const s = scenario();
  s.payments.push({ id: 2, orderId: 10, provider: 'MOCK', paymentRef: '222', amount: 801000, status: 'PENDING', gatewayTxnNo: null });
  const db = makeDb(s);
  assert.equal((await applyEventInTx(db, ev())).outcome, 'PAID');
  const second = await applyEventInTx(db, ev({ paymentRef: '222', txnNo: 'MOCK-222' }));
  assert.equal(second.outcome, 'DOUBLE_PAYMENT');
  assert.equal(s.payments[1].status, 'PENDING');
});

test('khoản đã PAID nhận thông báo với mã giao dịch khác: không ghi đè mã cũ', async () => {
  const s = scenario();
  const db = makeDb(s);
  await applyEventInTx(db, ev());
  const r = await applyEventInTx(db, ev({ txnNo: 'MOCK-KHAC' }));
  assert.equal(r.outcome, 'DUPLICATE_OTHER_TXN');
  assert.equal(s.payments[0].gatewayTxnNo, 'MOCK-111');
});
