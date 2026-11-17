'use strict';
/**
 * [UC01] Route tài khoản: đăng ký, đăng nhập, đăng xuất, hồ sơ, đổi mật khẩu, sổ địa chỉ.
 *
 * BẢO MẬT:
 *  - Đăng ký: ô đồng ý xử lý dữ liệu cá nhân (consentData) KHÔNG ĐÁNH DẤU SẴN trên form,
 *    nếu không tích thì không tạo tài khoản (kiểm tra phía server dù client đã kiểm tra trước).
 *  - Đăng nhập: regenerate session sau khi xác thực để chống session fixation.
 *    Băm mật khẩu bcrypt cost 12 (utils/password.js); burnTime đảm bảo thời gian phản hồi
 *    không tiết lộ email nào đã đăng ký.
 *  - Đăng xuất: hủy phiên hoàn toàn, không chỉ xóa cookie.
 *  - Mọi câu SQL đi qua tham số hóa (models/userModel.js).
 */
const express = require('express');
const router = express.Router();
const ah = require('../utils/asyncHandler');
const v = require('../utils/validate');
const { hash } = require('../utils/password');
const { regenerate, save, destroy } = require('../utils/session');
const { safeNextPath } = require('../utils/security');
const { BusinessError } = require('../utils/errors');
const { requireAuth, requireGuest } = require('../middleware/auth');
const { GUEST_COOKIE } = require('../middleware/cartContext');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');
const userModel = require('../models/userModel');
const shop = require('../config/shop');

/* ====================================================================
   ĐĂNG KÝ [UC01]
   ==================================================================== */

router.get('/register', requireGuest, (req, res) => {
  res.render('auth/register', {
    title: 'Đăng ký tài khoản',
    privacyUrl: '/legal/privacy',
    termsUrl: '/legal/terms',
    consentVersion: shop.policies.consentVersion,
    fields: {}, errors: {},
  });
});

router.post('/register', requireGuest, registerLimiter, ah(async (req, res) => {
  const b = req.body;
  const errors = {};
  const fields = {};

  const emailRes   = v.email(b.email);
  const nameRes    = v.fullName(b.fullName);
  const phoneRes   = v.phone(b.phone, { required: false });
  const dobRes     = v.dateOfBirth(b.dateOfBirth);
  const pwRes      = v.password(b.password);
  const pw2        = String(b.password2 || '');

  fields.email     = emailRes.error ? v.line(b.email, 255) : emailRes.value;
  fields.fullName  = nameRes.error  ? v.line(b.fullName, 100) : nameRes.value;
  fields.phone     = v.line(b.phone, 30);
  fields.dateOfBirth = v.line(b.dateOfBirth, 20);

  if (emailRes.error)  errors.email    = emailRes.error;
  if (nameRes.error)   errors.fullName  = nameRes.error;
  if (phoneRes.error)  errors.phone     = phoneRes.error;
  if (dobRes.error)    errors.dateOfBirth = dobRes.error;
  if (pwRes.error)     errors.password  = pwRes.error;
  if (!errors.password && pw2 !== b.password) errors.password2 = 'Mật khẩu nhập lại không khớp.';

  // [UC01] Ô đồng ý xử lý dữ liệu cá nhân: KHÔNG đánh dấu sẵn trên form; phải tích mới đăng ký được.
  if (!v.checked(b.consentData)) {
    errors.consent = 'Bạn cần đồng ý với chính sách xử lý dữ liệu cá nhân để tiếp tục đăng ký.';
  }
  if (!v.checked(b.agreeTerms)) {
    errors.terms = 'Bạn cần đồng ý với Điều khoản sử dụng để tiếp tục đăng ký.';
  }

  if (Object.keys(errors).length) {
    return res.status(400).render('auth/register', {
      title: 'Đăng ký tài khoản',
      privacyUrl: '/legal/privacy', termsUrl: '/legal/terms', consentVersion: shop.policies.consentVersion,
      fields, errors,
    });
  }

  const user = await userModel.register({
    email: emailRes.value, passwordHash: await hash(pwRes.value),
    fullName: nameRes.value, phone: phoneRes.value, dateOfBirth: dobRes.value || null,
    consentGivenAt: new Date(),
  });

  // Đăng ký xong: gộp giỏ hàng vãng lai (nếu có) vào tài khoản mới rồi tạo phiên đăng nhập luôn.
  const guestTokenHash = req.guestTokenHash || null;
  await userModel.mergeGuestCart({ userId: user.id, guestTokenHash });
  await regenerate(req);
  req.session.userId = user.id;
  await save(req);
  if (guestTokenHash) res.clearCookie(GUEST_COOKIE);
  res.redirect('/account');
}));

/* ====================================================================
   ĐĂNG NHẬP / ĐĂNG XUẤT [UC01]
   ==================================================================== */

router.get('/login', requireGuest, (req, res) => {
  const next = safeNextPath(req.query.next || '', '');
  res.render('auth/login', { title: 'Đăng nhập', next, errors: {}, email: '' });
});

router.post('/login', requireGuest, loginLimiter, ah(async (req, res) => {
  const b = req.body;
  const emailRes = v.email(b.email);
  const next = safeNextPath(b.next || '', '');

  if (emailRes.error || !b.password) {
    return res.status(400).render('auth/login', {
      title: 'Đăng nhập', next, email: v.line(b.email, 255),
      errors: { general: 'Email hoặc mật khẩu không đúng.' },
    });
  }

  let user;
  try {
    user = await userModel.login({ email: emailRes.value, password: b.password });
  } catch (err) {
    if (err instanceof BusinessError) {
      return res.status(400).render('auth/login', {
        title: 'Đăng nhập', next, email: emailRes.value,
        errors: { general: err.message },
      });
    }
    throw err;
  }

  // Gộp giỏ hàng vãng lai trước khi regenerate phiên, sau đó xóa cookie guest.
  const guestTokenHash = req.guestTokenHash || null;
  await userModel.mergeGuestCart({ userId: user.id, guestTokenHash });

  // Regenerate session ID để chống session fixation sau khi xác thực thành công.
  await regenerate(req);
  req.session.userId = user.id;
  await save(req);

  if (guestTokenHash) res.clearCookie(GUEST_COOKIE);

  // Không có đường dẫn quay lại hợp lệ thì chuyển tới trang mặc định theo vai trò.
  res.redirect(next || (user.role === 'ADMIN' ? '/admin' : '/account'));
}));

router.post('/logout', requireAuth, ah(async (req, res) => {
  await destroy(req);
  res.clearCookie('ivy_csrf');
  res.redirect('/login');
}));

/* ====================================================================
   HỒ SƠ VÀ ĐỔI MẬT KHẨU [UC01]
   ==================================================================== */

router.get('/account', requireAuth, ah(async (req, res) => {
  const user = await userModel.findById(req.user.id);
  res.render('account/profile', { title: 'Hồ sơ', profile: user, errors: {} });
}));

router.post('/account', requireAuth, ah(async (req, res) => {
  const b = req.body;
  const nameRes  = v.fullName(b.fullName);
  const phoneRes = v.phone(b.phone, { required: false });
  const dobRes   = v.dateOfBirth(b.dateOfBirth);
  const errors   = {};

  if (nameRes.error)  errors.fullName  = nameRes.error;
  if (phoneRes.error) errors.phone     = phoneRes.error;
  if (dobRes.error)   errors.dateOfBirth = dobRes.error;

  if (Object.keys(errors).length) {
    const stored = await userModel.findById(req.user.id);
    const profile = { ...stored, fullName: v.line(b.fullName, 100), phone: v.line(b.phone, 30), dateOfBirth: v.line(b.dateOfBirth, 20) };
    return res.status(400).render('account/profile', { title: 'Hồ sơ', profile, errors });
  }

  await userModel.updateProfile({
    userId: req.user.id, fullName: nameRes.value,
    phone: phoneRes.value, dateOfBirth: dobRes.value || null,
  });
  res.redirect('/account?updated=1');
}));

router.get('/account/password', requireAuth, (req, res) => {
  res.render('account/password', { title: 'Đổi mật khẩu', errors: {} });
});

router.post('/account/password', requireAuth, ah(async (req, res) => {
  const b = req.body;
  const newRes = v.password(b.newPassword);
  const errors = {};

  if (!b.oldPassword) errors.oldPassword = 'Vui lòng nhập mật khẩu hiện tại.';
  if (newRes.error) errors.newPassword = newRes.error;
  if (!errors.newPassword && b.newPassword !== b.confirmPassword) errors.confirmPassword = 'Mật khẩu nhập lại không khớp.';

  if (Object.keys(errors).length) {
    return res.status(400).render('account/password', { title: 'Đổi mật khẩu', errors });
  }

  try {
    await userModel.changePassword({ userId: req.user.id, oldPassword: b.oldPassword, newPasswordHash: await hash(newRes.value) });
  } catch (err) {
    if (err instanceof BusinessError) {
      return res.status(400).render('account/password', { title: 'Đổi mật khẩu', errors: { oldPassword: err.message } });
    }
    throw err;
  }
  res.redirect('/account/password?changed=1');
}));

/* ====================================================================
   SỔ ĐỊA CHỈ [UC01]
   ==================================================================== */

router.get('/account/addresses', requireAuth, ah(async (req, res) => {
  const addresses = await userModel.listAddresses(req.user.id);
  res.render('account/addresses', { title: 'Sổ địa chỉ', addresses, updated: req.query.updated });
}));

router.get('/account/addresses/new', requireAuth, (req, res) => {
  res.render('account/address-form', { title: 'Thêm địa chỉ', address: null, errors: {}, next: safeNextPath(req.query.next || '', '') });
});

router.post('/account/addresses/new', requireAuth, ah(async (req, res) => {
  const { ok, data, errors } = parseAddress(req.body);
  const next = safeNextPath(req.body.next || '', '');
  if (!ok) return res.status(400).render('account/address-form', { title: 'Thêm địa chỉ', address: req.body, errors, next });
  await userModel.addAddress({ userId: req.user.id, ...data });
  res.redirect(next || '/account/addresses?updated=1');
}));

router.get('/account/addresses/:id/edit', requireAuth, ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (!id) return res.redirect('/account/addresses');
  const address = await userModel.getAddress(id, req.user.id);
  if (!address) return res.redirect('/account/addresses');
  res.render('account/address-form', { title: 'Sửa địa chỉ', address, errors: {} });
}));

router.post('/account/addresses/:id/edit', requireAuth, ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (!id) return res.redirect('/account/addresses');
  const { ok, data, errors } = parseAddress(req.body);
  if (!ok) return res.status(400).render('account/address-form', { title: 'Sửa địa chỉ', address: { ...req.body, addressId: id }, errors });
  await userModel.updateAddress({ addressId: id, userId: req.user.id, ...data });
  res.redirect('/account/addresses?updated=1');
}));

router.post('/account/addresses/:id/delete', requireAuth, ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (id) {
    const deleted = await userModel.deleteAddress(id, req.user.id);
    if (!deleted) {
      // Địa chỉ mặc định không được xóa trực tiếp.
      return res.redirect('/account/addresses?error=default');
    }
  }
  res.redirect('/account/addresses?updated=1');
}));

router.post('/account/addresses/:id/set-default', requireAuth, ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (id) await userModel.setDefaultAddress(id, req.user.id);
  res.redirect('/account/addresses?updated=1');
}));

/* ====================================================================
   Hàm tiện ích nội bộ
   ==================================================================== */

function parseAddress(b) {
  const errors = {};
  const nameRes     = v.requiredLine(b.recipientName, 'tên người nhận', 100);
  const phoneRes    = v.phone(b.phone);
  const provinceRes = v.requiredLine(b.province, 'tỉnh/thành phố', 100);
  const wardRes     = v.requiredLine(b.ward, 'phường/xã', 100);
  const streetRes   = v.requiredLine(b.street, 'địa chỉ cụ thể', 255);
  const districtRes = v.optionalLine(b.district, 'quận/huyện', 100);

  if (nameRes.error)     errors.recipientName = nameRes.error;
  if (phoneRes.error)    errors.phone         = phoneRes.error;
  if (provinceRes.error) errors.province      = provinceRes.error;
  if (wardRes.error)     errors.ward          = wardRes.error;
  if (streetRes.error)   errors.street        = streetRes.error;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true, errors: {},
    data: {
      recipientName: nameRes.value, phone: phoneRes.value, province: provinceRes.value,
      district: districtRes.value || null, ward: wardRes.value, street: streetRes.value,
      setDefault: v.checked(b.isDefault),
    },
  };
}

module.exports = router;
