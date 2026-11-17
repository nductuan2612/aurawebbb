'use strict';
/**
 * [UC01] Model tài khoản: đăng ký, đăng nhập, hồ sơ, sổ địa chỉ, gộp giỏ hàng khi đăng nhập.
 * Mọi câu SQL dùng tham số hóa (:name) để chống SQL Injection.
 */
const db = require('../config/db');
const { compare, burnTime } = require('../utils/password');
const { BusinessError } = require('../utils/errors');
const shop = require('../config/shop');

const badCredentials = () => new BusinessError('Email hoặc mật khẩu không đúng.', { code: 'BAD_CREDENTIALS' });

// ------------------------------------------------------------------ đăng ký
/** [UC01] Tạo tài khoản KHÁCH HÀNG. Tài khoản quản trị chỉ có từ script seed. */
async function register({ email, passwordHash, fullName, phone, dateOfBirth, consentGivenAt }) {
  try {
    await db.query(
      `INSERT INTO Users (Email, PasswordHash, FullName, Phone, DateOfBirth, Role, ConsentGivenAt, ConsentVersion)
         VALUES (:email, :hash, :name, :phone, :dob, 'CUSTOMER', :consent, :ver)`,
      {
        email, hash: passwordHash, name: fullName, phone: phone || null, dob: dateOfBirth || null,
        consent: consentGivenAt, ver: shop.policies.consentVersion,
      });
  } catch (err) {
    if (db.isUniqueViolation(err)) {
      throw new BusinessError('Địa chỉ email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.', { code: 'EMAIL_TAKEN' });
    }
    throw err;
  }
  const u = await db.one('SELECT UserId AS id, Email AS email, FullName AS fullName, Role AS role FROM Users WHERE Email = :email', { email });
  return u;
}

// ------------------------------------------------------------------ đăng nhập
/**
 * [UC01] Trả về { id, email, fullName, role } khi đúng mật khẩu, ném BusinessError khi sai.
 *  - Email không tồn tại vẫn chạy bcrypt, nên thời gian phản hồi không cho biết email nào đã đăng ký.
 *  - Sai mật khẩu quá shop.login.maxFailedAttempts lần thì khóa tạm shop.login.lockMinutes phút.
 *  - Trạng thái "tài khoản bị vô hiệu hóa" chỉ được báo SAU KHI mật khẩu đúng.
 */
async function login({ email, password }) {
  const u = await db.one(
    `SELECT UserId AS userId, Email AS email, FullName AS fullName, Role AS role, IsActive AS isActive,
            PasswordHash AS passwordHash, FailedLoginCount AS failedCount, LockedUntil AS lockedUntil
       FROM Users WHERE Email = :email`, { email });
  if (!u) {
    await burnTime(password);
    throw badCredentials();
  }

  const now = new Date();
  if (u.lockedUntil && new Date(u.lockedUntil) > now) {
    await burnTime(password);
    const minutes = Math.max(1, Math.ceil((new Date(u.lockedUntil) - now) / 60000));
    throw new BusinessError(`Tài khoản tạm khóa vì nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau ${minutes} phút.`, { code: 'ACCOUNT_LOCKED' });
  }

  const ok = await compare(password, u.passwordHash);
  if (!ok) {
    const failed = u.failedCount + 1;
    if (failed >= shop.login.maxFailedAttempts) {
      const lockUntil = new Date(now.getTime() + shop.login.lockMinutes * 60000);
      await db.query('UPDATE Users SET FailedLoginCount = 0, LockedUntil = :lu WHERE UserId = :uid', { lu: lockUntil, uid: u.userId });
      throw new BusinessError(`Bạn đã nhập sai mật khẩu ${failed} lần. Tài khoản tạm khóa ${shop.login.lockMinutes} phút.`, { code: 'ACCOUNT_LOCKED' });
    }
    await db.query('UPDATE Users SET FailedLoginCount = :c WHERE UserId = :uid', { c: failed, uid: u.userId });
    throw badCredentials();
  }

  if (!u.isActive) {
    throw new BusinessError('Tài khoản này đã bị vô hiệu hóa. Vui lòng liên hệ cửa hàng để được hỗ trợ.', { code: 'ACCOUNT_INACTIVE' });
  }

  await db.query(
    'UPDATE Users SET FailedLoginCount = 0, LockedUntil = NULL, LastLoginAt = UTC_TIMESTAMP() WHERE UserId = :uid',
    { uid: u.userId });
  return { id: u.userId, email: u.email, fullName: u.fullName, role: u.role };
}

// ------------------------------------------------------------------ hồ sơ
async function findById(userId) {
  return db.one(
    `SELECT UserId AS userId, Email AS email, FullName AS fullName, Phone AS phone,
            DATE_FORMAT(DateOfBirth, '%Y-%m-%d') AS dateOfBirth, Role AS role, CreatedAt AS createdAt
       FROM Users WHERE UserId = :userId`, { userId });
}

async function updateProfile({ userId, fullName, phone, dateOfBirth }) {
  await db.query(
    `UPDATE Users SET FullName = :name, Phone = :phone, DateOfBirth = :dob, UpdatedAt = UTC_TIMESTAMP()
       WHERE UserId = :uid`,
    { name: fullName, phone: phone || null, dob: dateOfBirth || null, uid: userId });
}

async function changePassword({ userId, oldPassword, newPasswordHash }) {
  const u = await db.one('SELECT PasswordHash AS passwordHash FROM Users WHERE UserId = :uid', { uid: userId });
  if (!u) throw new BusinessError('Tài khoản không tồn tại.');
  const ok = await compare(oldPassword, u.passwordHash);
  if (!ok) throw new BusinessError('Mật khẩu hiện tại không đúng.', { code: 'BAD_CREDENTIALS' });
  await db.query(
    'UPDATE Users SET PasswordHash = :h, UpdatedAt = UTC_TIMESTAMP() WHERE UserId = :uid',
    { h: newPasswordHash, uid: userId });
}

// ------------------------------------------------------------------ sổ địa chỉ
const ADDRESS_COLUMNS = `AddressId AS addressId, RecipientName AS recipientName, Phone AS phone,
            Province AS province, District AS district, Ward AS ward, StreetAddress AS street, IsDefault AS isDefault`;

async function listAddresses(userId) {
  return (await db.query(
    `SELECT ${ADDRESS_COLUMNS} FROM Addresses WHERE UserId = :uid ORDER BY IsDefault DESC, AddressId`,
    { uid: userId })).rows;
}

/** Luôn kèm điều kiện UserId để khách không đọc hay sửa được địa chỉ của người khác. */
async function getAddress(addressId, userId) {
  return db.one(
    `SELECT ${ADDRESS_COLUMNS} FROM Addresses WHERE AddressId = :id AND UserId = :uid`,
    { id: addressId, uid: userId });
}

async function addAddress({ userId, recipientName, phone, province, district, ward, street, setDefault }) {
  return db.tx(async (t) => {
    if (setDefault) await t.query('UPDATE Addresses SET IsDefault = 0 WHERE UserId = :uid', { uid: userId });
    const hasAny = await t.scalar('SELECT 1 FROM Addresses WHERE UserId = :uid LIMIT 1', { uid: userId });
    const isDefault = setDefault || !hasAny ? 1 : 0; // địa chỉ đầu tiên luôn là mặc định
    await t.query(
      `INSERT INTO Addresses (UserId, RecipientName, Phone, Province, District, Ward, StreetAddress, IsDefault)
         VALUES (:uid, :name, :phone, :province, :district, :ward, :street, :def)`,
      { uid: userId, name: recipientName, phone, province, district: district || null, ward, street, def: isDefault });
  });
}

async function updateAddress({ addressId, userId, recipientName, phone, province, district, ward, street, setDefault }) {
  return db.tx(async (t) => {
    const existing = await t.one(
      'SELECT IsDefault AS isDefault FROM Addresses WHERE AddressId = :id AND UserId = :uid',
      { id: addressId, uid: userId });
    if (!existing) throw new BusinessError('Địa chỉ không tồn tại hoặc không thuộc về bạn.', { code: 'NOT_FOUND' });
    if (setDefault && !existing.isDefault) {
      await t.query('UPDATE Addresses SET IsDefault = 0 WHERE UserId = :uid', { uid: userId });
    }
    const isDefault = setDefault || existing.isDefault ? 1 : 0;
    await t.query(
      `UPDATE Addresses SET RecipientName = :name, Phone = :phone, Province = :province, District = :district,
              Ward = :ward, StreetAddress = :street, IsDefault = :def
        WHERE AddressId = :id AND UserId = :uid`,
      { name: recipientName, phone, province, district: district || null, ward, street, def: isDefault, id: addressId, uid: userId });
  });
}

/** Địa chỉ mặc định không xóa trực tiếp được: khách phải chọn địa chỉ mặc định khác trước. */
async function deleteAddress(addressId, userId) {
  const r = await db.query(
    'DELETE FROM Addresses WHERE AddressId = :id AND UserId = :uid AND IsDefault = 0',
    { id: addressId, uid: userId });
  return (r.rowsAffected[0] || 0) > 0;
}

async function setDefaultAddress(addressId, userId) {
  return db.tx(async (t) => {
    const exists = await t.scalar('SELECT 1 FROM Addresses WHERE AddressId = :id AND UserId = :uid LIMIT 1', { id: addressId, uid: userId });
    if (!exists) throw new BusinessError('Địa chỉ không tồn tại.', { code: 'NOT_FOUND' });
    await t.query('UPDATE Addresses SET IsDefault = 0 WHERE UserId = :uid', { uid: userId });
    await t.query('UPDATE Addresses SET IsDefault = 1 WHERE AddressId = :id AND UserId = :uid', { id: addressId, uid: userId });
  });
}

// ------------------------------------------------------------------ gộp giỏ hàng vãng lai khi đăng nhập
/**
 * [UC01] Gộp giỏ hàng vãng lai vào giỏ của tài khoản vừa đăng nhập.
 * Cùng một biến thể ở cả hai giỏ thì cộng số lượng, bị chặn bởi tồn kho và giới hạn mỗi dòng.
 * Biến thể đã ngừng bán hoặc hết hàng thì bỏ qua. Giỏ vãng lai bị xóa sau khi gộp.
 */
async function mergeGuestCart({ userId, guestTokenHash }) {
  if (!guestTokenHash) return;
  await db.tx(async (t) => {
    const guest = await t.one('SELECT CartId AS cartId FROM Carts WHERE GuestTokenHash = :h', { h: guestTokenHash });
    if (!guest) return;

    const userCart = await t.one('SELECT CartId AS cartId FROM Carts WHERE UserId = :uid', { uid: userId });
    if (!userCart) {
      // Tài khoản chưa có giỏ: chuyển quyền sở hữu giỏ vãng lai sang tài khoản.
      await t.query('UPDATE Carts SET UserId = :uid, GuestTokenHash = NULL, UpdatedAt = UTC_TIMESTAMP() WHERE CartId = :cid', { uid: userId, cid: guest.cartId });
      return;
    }

    const items = (await t.query(
      `SELECT ci.VariantId AS variantId, ci.Quantity AS quantity, v.StockQuantity AS stock,
              v.IsActive AS variantActive, p.IsActive AS productActive
         FROM CartItems ci
         JOIN ProductVariants v ON v.VariantId = ci.VariantId
         JOIN Products p ON p.ProductId = v.ProductId
        WHERE ci.CartId = :cid`, { cid: guest.cartId })).rows;

    for (const item of items) {
      if (!item.variantActive || !item.productActive) continue;
      const existing = await t.one(
        'SELECT CartItemId AS id, Quantity AS qty FROM CartItems WHERE CartId = :cid AND VariantId = :vid',
        { cid: userCart.cartId, vid: item.variantId });
      const cap = Math.max(0, Math.min(shop.limits.maxQtyPerLine, item.stock));
      const have = existing ? existing.qty : 0;
      const merged = Math.max(have, Math.min(have + item.quantity, cap));
      if (merged < 1) continue;
      if (existing) {
        if (merged !== have) await t.query('UPDATE CartItems SET Quantity = :q WHERE CartItemId = :id', { q: merged, id: existing.id });
      } else {
        await t.query('INSERT INTO CartItems (CartId, VariantId, Quantity) VALUES (:cid, :vid, :q)', { cid: userCart.cartId, vid: item.variantId, q: merged });
      }
    }
    await t.query('UPDATE Carts SET UpdatedAt = UTC_TIMESTAMP() WHERE CartId = :cid', { cid: userCart.cartId });
    await t.query('DELETE FROM Carts WHERE CartId = :cid', { cid: guest.cartId }); // CartItems xóa theo (ON DELETE CASCADE)
  });
}

module.exports = {
  register, login, findById, updateProfile, changePassword,
  listAddresses, getAddress, addAddress, updateAddress, deleteAddress, setDefaultAddress,
  mergeGuestCart,
};
