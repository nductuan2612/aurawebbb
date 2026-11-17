#!/usr/bin/env node
/**
 * Tạo tài khoản admin bằng dòng lệnh (dùng khi không chạy seed.sql, hoặc cần thêm admin khác).
 *
 * Cách dùng:
 *   node scripts/create-admin.js admin@example.com Admin@123 "Quản trị viên"
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');
const { hash } = require('../utils/password');

async function main() {
  const [, , email, password, fullName = 'Admin'] = process.argv;
  if (!email || !password) {
    console.error('Cách dùng: node scripts/create-admin.js <email> <password> [fullName]');
    process.exit(1);
  }
  const passwordHash = await hash(password);

  // MySQL không có "IF NOT EXISTS ... ELSE PRINT" ở cấp lệnh thường như T-SQL: kiểm tra trước, rồi mới chèn.
  const existing = await db.scalar('SELECT 1 AS x FROM Users WHERE Email = :email LIMIT 1', { email });
  if (existing) {
    console.log(`Email đã tồn tại, không tạo lại: ${email}`);
  } else {
    await db.query(
      `INSERT INTO Users (Email, PasswordHash, FullName, Role, ConsentGivenAt, ConsentVersion)
       VALUES (:email, :hash, :name, 'ADMIN', UTC_TIMESTAMP(), 'v1')`,
      { email, hash: passwordHash, name: fullName });
    console.log(`Đã tạo tài khoản admin: ${email}`);
  }
  await db.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
