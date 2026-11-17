'use strict';
/**
 * Giá» hĂ ng, Ä‘áº·t hĂ ng, Ä‘Æ¡n hĂ ng cá»§a tĂ´i, Ä‘Ă¡nh giĂ¡, vĂ  cĂ¡c trang thanh toĂ¡n dĂ nh cho khĂ¡ch.
 *   [UC04] kiá»ƒm tra tá»“n kho khi thĂªm vĂ o giá» vĂ  khi Ä‘áº·t hĂ ng
 *   [UC05] Ă¡p dá»¥ng mĂ£ giáº£m giĂ¡
 *   [UC06] thanh toĂ¡n COD / online; trang cá»•ng giáº£ láº­p Ä‘á»ƒ kiá»ƒm thá»­ IPN
 *   [UC09] Ä‘Ă¡nh giĂ¡ sáº£n pháº©m (chá»‰ vá»›i Ä‘Æ¡n "ÄĂ£ giao")
 * CĂ¡c endpoint IPN/webhook cá»§a cá»•ng thanh toĂ¡n náº±m á»Ÿ routes/paymentHooks.js (gáº¯n trÆ°á»›c CSRF).
 */
const express = require('express');
const ah = require('../utils/asyncHandler');
const v = require('../utils/validate');
const S = require('../utils/orderStatus');
const { formatVnd } = require('../utils/format');
const { evaluateDiscount, computeTotals } = require('../utils/pricing');
const { BusinessError, NotFoundError } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');
const { getOrCreateCartId, findCartId } = require('../middleware/cartContext');
const cartModel = require('../models/cartModel');
const discountModel = require('../models/discountModel');
const orderModel = require('../models/orderModel');
const paymentModel = require('../models/paymentModel');
const userModel = require('../models/userModel');
const reviewModel = require('../models/reviewModel');
const orderService = require('../services/orderService');
const paymentSvc = require('../services/paymentService');
const registry = require('../services/payment/registry');
const shop = require('../config/shop');
const env = require('../config/env');

const router = express.Router();

const MOCK_ACTIONS = ['success', 'fail', 'tamper', 'wrongamount', 'replay'];

/* ====================================================================
   GIá» HĂ€NG
   ==================================================================== */

router.get('/cart', ah(async (req, res) => {
  const cartId = await findCartId(req);
  const cart = cartId ? await cartModel.getDetail(cartId) : { items: [], subtotal: 0 };
  res.render('shop/cart', { title: 'Giá» hĂ ng', cart, added: req.query.added === '1' });
}));

/** [UC04] ThĂªm vĂ o giá»: kiá»ƒm tra tá»“n kho (cartModel.addItem), khĂ´ng cho vÆ°á»£t tá»“n. */
router.post('/cart/add', ah(async (req, res) => {
  const variantId = v.id(req.body.variantId);
  if (!variantId) throw new BusinessError('Vui lĂ²ng chá»n kĂ­ch cá»¡ vĂ  mĂ u sáº¯c.');
  const qty = v.intInRange(req.body.quantity || '1', 'sá»‘ lÆ°á»£ng', 1, shop.limits.maxQtyPerLine);
  if (qty.error) throw new BusinessError(qty.error);

  const cartId = await getOrCreateCartId(req, res);
  await cartModel.addItem(cartId, variantId, qty.value);
  res.redirect('/cart?added=1');
}));

router.post('/cart/update', ah(async (req, res) => {
  const variantId = v.id(req.body.variantId);
  if (!variantId) throw new BusinessError('ThĂ´ng tin sáº£n pháº©m khĂ´ng há»£p lá»‡.');
  const qty = v.intInRange(req.body.quantity, 'sá»‘ lÆ°á»£ng', 0, shop.limits.maxQtyPerLine);
  if (qty.error) throw new BusinessError(qty.error);
  const cartId = await findCartId(req);
  if (cartId) await cartModel.updateItem(cartId, variantId, qty.value);
  res.redirect('/cart');
}));

router.post('/cart/remove', ah(async (req, res) => {
  const variantId = v.id(req.body.variantId);
  const cartId = await findCartId(req);
  if (variantId && cartId) await cartModel.removeItem(cartId, variantId);
  res.redirect('/cart');
}));

/* ====================================================================
   Äáº¶T HĂ€NG [UC01][UC04][UC05]
   ==================================================================== */

router.get('/checkout', requireAuth, ah(async (req, res) => {
  const cartId = await findCartId(req);
  const [cart, addresses] = await Promise.all([
    cartId ? cartModel.getDetail(cartId) : { items: [], subtotal: 0 },
    userModel.listAddresses(req.user.id),
  ]);
  if (!cart.items.length) return res.redirect('/cart');

  const gateway = registry.active();
  res.render('shop/checkout', {
    title: 'Äáº·t hĂ ng',
    cart,
    addresses,
    gateway: { label: gateway ? gateway.label : '', ready: Boolean(gateway && gateway.isConfigured()), key: gateway ? gateway.key : '' },
    blocked: cart.items.some((it) => it.warning),
  });
}));

/** Kiá»ƒm tra mĂ£ giáº£m giĂ¡ cho giá» hiá»‡n táº¡i (AJAX). Tá»•ng tiá»n luĂ´n tĂ­nh láº¡i tá»« giá» trong CSDL. */
router.post('/checkout/apply-discount', requireAuth, ah(async (req, res) => {
  const code = v.line(req.body.discountCode, 30);
  if (!code) return res.json({ ok: false, message: 'Vui lĂ²ng nháº­p mĂ£ giáº£m giĂ¡.' });
  const cartId = await findCartId(req);
  const cart = cartId ? await cartModel.getDetail(cartId) : { items: [], subtotal: 0 };
  if (!cart.items.length) return res.json({ ok: false, message: 'Giá» hĂ ng trá»‘ng.' });

  const discount = await discountModel.findByCode(code);
  const evl = evaluateDiscount(discount, cart.subtotal);
  if (!evl.ok) return res.json({ ok: false, message: evl.message });

  const totals = computeTotals(cart.subtotal, evl.amount);
  return res.json({
    ok: true,
    message: `ÄĂ£ Ă¡p dá»¥ng mĂ£ ${discount.Code}.`,
    code: discount.Code,
    discount: totals.discountAmount,
    shippingFee: totals.shippingFee,
    total: totals.total,
    labels: {
      discount: `-${formatVnd(totals.discountAmount)}`,
      shippingFee: totals.shippingFee === 0 ? 'Miá»…n phĂ­' : formatVnd(totals.shippingFee),
      total: formatVnd(totals.total),
    },
  });
}));

router.post('/checkout', requireAuth, ah(async (req, res) => {
  const b = req.body;

  // Ă” Ä‘á»“ng Ă½ xá»­ lĂ½ dá»¯ liá»‡u cĂ¡ nhĂ¢n KHĂ”NG Ä‘Ă¡nh dáº¥u sáºµn; khĂ´ng tĂ­ch thĂ¬ khĂ´ng Ä‘áº·t Ä‘Æ°á»£c (kiá»ƒm tra phĂ­a server).
  if (!v.checked(b.consentData)) {
    throw new BusinessError('Báº¡n cáº§n Ä‘á»“ng Ă½ vá»›i chĂ­nh sĂ¡ch xá»­ lĂ½ dá»¯ liá»‡u cĂ¡ nhĂ¢n Ä‘á»ƒ tiáº¿p tá»¥c Ä‘áº·t hĂ ng.', { code: 'NO_CONSENT' });
  }
  const addressId = v.id(b.addressId);
  if (!addressId) throw new BusinessError('Vui lĂ²ng chá»n Ä‘á»‹a chá»‰ giao hĂ ng.');

  const method = b.paymentMethod === 'ONLINE' ? 'ONLINE' : 'COD';
  const note = v.optionalLine(b.note, 'ghi chĂº', 500);
  if (note.error) throw new BusinessError(note.error);

  const cartId = await findCartId(req);
  if (!cartId) throw new BusinessError('Giá» hĂ ng trá»‘ng. HĂ£y thĂªm sáº£n pháº©m trÆ°á»›c khi Ä‘áº·t hĂ ng.');

  const order = await orderService.createOrder({
    userId: req.user.id,
    cartId,
    addressId,
    discountCode: v.line(b.discountCode, 30) || null,
    paymentMethod: method,
    note: note.value,
    consentGivenAt: new Date(),
  });

  if (method === 'ONLINE') {
    try {
      if (paymentSvc.activeProvider() && paymentSvc.activeProvider().key === 'sepay') {
        const pay = await paymentSvc.startSepayQrPayment({ orderCode: order.code, userId: req.user.id });
        return res.redirect(`/payment/sepay/${encodeURIComponent(pay.orderCode)}`);
      }
      const pay = await paymentSvc.startOnlinePayment({ orderCode: order.code, userId: req.user.id, ip: req.ip });
      return res.redirect(pay.url);
    } catch (err) {
      // ÄÆ¡n Ä‘Ă£ Ä‘Æ°á»£c táº¡o. Cá»•ng chÆ°a sáºµn sĂ ng thĂ¬ Ä‘á»ƒ khĂ¡ch báº¥m "Thanh toĂ¡n" láº¡i á»Ÿ trang Ä‘Æ¡n hĂ ng.
      return res.redirect(`/orders/${order.code}?payment=unavailable`);
    }
  }
  return res.redirect(`/orders/${order.code}?placed=1`);
}));

/* ====================================================================
   ÄÆ N HĂ€NG Cá»¦A TĂ”I [UC04]
   ==================================================================== */

const FLASH = Object.freeze({
  placed: { type: 'ok', text: 'Äáº·t hĂ ng thĂ nh cĂ´ng. ChĂºng tĂ´i sáº½ xĂ¡c nháº­n Ä‘Æ¡n sá»›m nháº¥t cĂ³ thá»ƒ.' },
  cancelled: { type: 'ok', text: 'ÄÆ¡n hĂ ng Ä‘Ă£ Ä‘Æ°á»£c há»§y.' },
  reviewed: { type: 'ok', text: 'Cáº£m Æ¡n báº¡n Ä‘Ă£ Ä‘Ă¡nh giĂ¡ sáº£n pháº©m.' },
  paid: { type: 'ok', text: 'ÄĂ£ nháº­n thanh toĂ¡n cá»§a báº¡n. Cáº£m Æ¡n báº¡n Ä‘Ă£ mua hĂ ng.' },
  pending: { type: 'info', text: 'ChĂºng tĂ´i Ä‘ang chá» cá»•ng thanh toĂ¡n xĂ¡c nháº­n. Trang nĂ y sáº½ cáº­p nháº­t khi nháº­n Ä‘Æ°á»£c káº¿t quáº£.' },
  failed: { type: 'error', text: 'Thanh toĂ¡n chÆ°a thĂ nh cĂ´ng. Báº¡n cĂ³ thá»ƒ thá»­ thanh toĂ¡n láº¡i.' },
  unavailable: { type: 'error', text: 'ÄÆ¡n hĂ ng Ä‘Ă£ Ä‘Æ°á»£c táº¡o nhÆ°ng chÆ°a má»Ÿ Ä‘Æ°á»£c cá»•ng thanh toĂ¡n. Báº¡n cĂ³ thá»ƒ báº¥m "Thanh toĂ¡n online" Ä‘á»ƒ thá»­ láº¡i.' },
});

function flashFrom(query) {
  if (query.placed === '1') return FLASH.placed;
  if (query.cancelled === '1') return FLASH.cancelled;
  if (query.reviewed === '1') return FLASH.reviewed;
  const p = typeof query.payment === 'string' ? query.payment : '';
  if (p === 'cancelled') return { type: 'info', text: 'Báº¡n Ä‘Ă£ há»§y thanh toĂ¡n. ÄÆ¡n hĂ ng váº«n Ä‘Æ°á»£c giá»¯, báº¡n cĂ³ thá»ƒ thanh toĂ¡n láº¡i.' };
  return FLASH[p] || null;
}

router.get('/orders', requireAuth, ah(async (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const { items, pagination } = await orderModel.listForUser(req.user.id, { page });
  res.render('shop/orders', { title: 'ÄÆ¡n hĂ ng cá»§a tĂ´i', items, pagination });
}));

router.get('/orders/:code', requireAuth, ah(async (req, res) => {
  const order = await orderModel.getByCode(v.line(req.params.code, 30), req.user.id); // chá»‰ tráº£ Ä‘Æ¡n cá»§a chĂ­nh khĂ¡ch nĂ y
  if (!order) throw new NotFoundError('KhĂ´ng tĂ¬m tháº¥y Ä‘Æ¡n hĂ ng.');
  const gateway = registry.active();
  res.render('shop/order-detail', {
    title: `ÄÆ¡n ${order.code}`,
    order,
    flash: flashFrom(req.query),
    gatewayReady: Boolean(gateway && gateway.isConfigured()),
  });
}));

router.post('/orders/:code/cancel', requireAuth, ah(async (req, res) => {
  const code = v.line(req.params.code, 30);
  await orderService.cancelByCustomer({ orderCode: code, userId: req.user.id });
  res.redirect(`/orders/${code}?cancelled=1`);
}));

/* ====================================================================
   ÄĂNH GIĂ [UC09]: chá»‰ khĂ¡ch cĂ³ Ä‘Æ¡n á»Ÿ tráº¡ng thĂ¡i "ÄĂ£ giao"
   ==================================================================== */

router.post('/reviews', requireAuth, ah(async (req, res) => {
  const b = req.body;
  const orderItemId = v.id(b.orderItemId);
  const productId = v.id(b.productId);
  const rating = v.intInRange(b.rating, 'sá»‘ sao', 1, 5);
  const title = v.optionalLine(b.title, 'tiĂªu Ä‘á»', 100);
  const comment = v.requiredLine(b.comment, 'nháº­n xĂ©t', 1000);
  if (!orderItemId || !productId) throw new BusinessError('ThĂ´ng tin Ä‘Ă¡nh giĂ¡ khĂ´ng há»£p lá»‡.');
  const bad = rating.error || title.error || comment.error;
  if (bad) throw new BusinessError(bad);

  await reviewModel.create({
    userId: req.user.id, orderItemId, productId,
    rating: rating.value, title: title.value, comment: comment.value,
  });

  const back = v.slug(b.backSlug || '');
  if (!back.error) return res.redirect(`/products/${back.value}?reviewed=1#reviews`);
  return res.redirect('/orders');
}));

/* ====================================================================
   THANH TOĂN ONLINE [UC06]
   ==================================================================== */

/** Báº¯t Ä‘áº§u hoáº·c tiáº¿p tá»¥c thanh toĂ¡n online cho má»™t Ä‘Æ¡n Ä‘ang chá». */
router.post('/orders/:code/pay', requireAuth, ah(async (req, res) => {
  const code = v.line(req.params.code, 30);
  try {
    if (paymentSvc.activeProvider() && paymentSvc.activeProvider().key === 'sepay') {
      const pay = await paymentSvc.startSepayQrPayment({ orderCode: code, userId: req.user.id });
      return res.redirect(`/payment/sepay/${encodeURIComponent(pay.orderCode)}`);
    }
    const pay = await paymentSvc.startOnlinePayment({ orderCode: code, userId: req.user.id, ip: req.ip });
    return res.redirect(pay.url);
  } catch (err) {
    // Không để lỗi cấu trúc DB/cổng thanh toán biến thành trang 500 khi khách bấm trả lại.
    // Đơn vẫn còn ở trạng thái chờ thanh toán để khách thử lại hoặc chọn COD.
    return res.redirect(`/orders/${encodeURIComponent(code)}?payment=unavailable`);
  }
}));

/** KhĂ¡ch quay vá» tá»« cá»•ng. Káº¿t quáº£ chá»‰ Ä‘Æ°á»£c tin khi Ä‘Ă£ xĂ¡c thá»±c (chá»¯ kĂ½ hoáº·c tra cá»©u láº¡i vá»›i cá»•ng). */
router.get('/payment/sepay/:code/status', requireAuth, ah(async (req, res) => {
  const code = v.line(req.params.code, 30);
  const order = await orderModel.getByCode(code, req.user.id);
  if (!order || order.paymentMethod !== 'ONLINE') return res.status(404).json({ ok: false });
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const provider = paymentSvc.activeProvider();
  const providerKey = provider ? provider.dbKey : 'SEPAY';
  const requestedRef = typeof req.query.ref === 'string' ? v.line(req.query.ref, 40) : '';
  let payment = requestedRef ? await paymentModel.findByRef(providerKey, requestedRef) : await paymentModel.paymentStatusByOrder(order.id, providerKey);
  // Cho phép đọc cả SEPAY khi dev đang dùng SEPAY_DB_PROVIDER=MOCK hoặc DB đã được migrate.
  if (!payment && providerKey !== 'SEPAY') {
    payment = requestedRef ? await paymentModel.findByRef('SEPAY', requestedRef) : await paymentModel.paymentStatusByOrder(order.id, 'SEPAY');
  }
  if (payment && Number(payment.orderId) !== Number(order.id)) return res.status(404).json({ ok: false });
  if (!payment) return res.json({ ok: true, status: 'NOT_FOUND', paid: false, orderCode: order.code });
  return res.json({ ok: true, status: payment.status, paid: payment.status === 'PAID', orderCode: order.code });
}));

router.get('/payment/sepay/:code', requireAuth, ah(async (req, res) => {
  const code = v.line(req.params.code, 30);
  const order = await orderModel.getByCode(code, req.user.id);
  if (!order || order.paymentMethod !== 'ONLINE') throw new NotFoundError('Order not found.');
  const payments = await paymentModel.listByOrder(order.id);
  const sepayProvider = paymentSvc.activeProvider();
  const providerKey = sepayProvider ? sepayProvider.dbKey : 'SEPAY';
  const payment = payments.find((p) => p.provider === providerKey && p.status === 'PENDING') || payments.find((p) => p.provider === providerKey);
  if (!payment) throw new NotFoundError('Payment transaction not found.');
  res.render('shop/payment-sepay', {
    title: `Thanh to?n ${order.code}`, order, payment,
    sepay: { accountNumber: env.payment.sepayAccountNumber, bankName: env.payment.sepayBankName, accountName: env.payment.sepayAccountName, content: `${env.payment.sepayContentPrefix}${order.code}${env.payment.sepayContentSuffix}` },
  });
}));
router.get('/payment/:provider/return', requireAuth, ah(async (req, res) => {
  const r = await paymentSvc.handleReturn(v.line(req.params.provider, 20), { query: req.query, userId: req.user.id });
  if (r.state === 'INVALID' || !r.orderCode) return res.redirect('/orders');
  return res.redirect(`/orders/${r.orderCode}?payment=${r.state.toLowerCase()}`);
}));

router.get('/payment/:provider/cancel', requireAuth, ah(async (req, res) => {
  const r = await paymentSvc.handleReturn(v.line(req.params.provider, 20), { query: { ...req.query, cancel: 'true' }, userId: req.user.id });
  if (r.state === 'INVALID' || !r.orderCode) return res.redirect('/orders');
  return res.redirect(`/orders/${r.orderCode}?payment=${r.state === 'PAID' ? 'paid' : 'cancelled'}`);
}));

/* ---------- Cá»•ng giáº£ láº­p (chá»‰ khi PAYMENT_PROVIDER=mock) ---------- */

async function loadMockPayment(req) {
  if (registry.active().key !== 'mock') throw new NotFoundError();
  const pay = await paymentModel.findByRef('MOCK', v.line(req.params.ref, 40));
  if (!pay || pay.userId !== req.user.id) throw new NotFoundError('KhĂ´ng tĂ¬m tháº¥y giao dá»‹ch.');
  return pay;
}

router.get('/payment/mock/:ref', requireAuth, ah(async (req, res) => {
  const pay = await loadMockPayment(req);
  res.render('shop/payment-mock', { title: 'Cá»•ng thanh toĂ¡n demo', pay, results: null });
}));

/**
 * MĂ´ phá»ng cá»•ng gá»­i IPN. Server dá»±ng thĂ´ng bĂ¡o vĂ  KĂ báº±ng MOCK_GATEWAY_SECRET (trĂ¬nh duyá»‡t khĂ´ng bao giá» tháº¥y khĂ³a),
 * rá»“i Ä‘i qua Ä‘Ăºng quy trĂ¬nh nhÆ° cá»•ng tháº­t: kiá»ƒm tra chá»¯ kĂ½, so sá»‘ tiá»n, xá»­ lĂ½ idempotent.
 */
router.post('/payment/mock/:ref/simulate', requireAuth, ah(async (req, res) => {
  const pay = await loadMockPayment(req);
  const action = MOCK_ACTIONS.includes(req.body.action) ? req.body.action : 'success';
  const sequence = action === 'replay' ? ['success', 'success'] : [action];

  const results = [];
  for (const a of sequence) {
    const body = paymentSvc.buildMockEvent({ paymentRef: pay.paymentRef, amount: pay.amount, action: a });
    const r = await paymentSvc.handleWebhook('mock', { body, ip: req.ip });
    results.push({ action: a, outcome: r.outcome, httpStatus: r.status });
  }
  const fresh = await paymentModel.findByRef('MOCK', pay.paymentRef);
  res.render('shop/payment-mock', { title: 'Cá»•ng thanh toĂ¡n demo', pay: fresh, results });
}));

module.exports = router;

