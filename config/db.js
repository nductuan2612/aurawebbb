'use strict';
/**
 * Kết nối MySQL và các hàm truy vấn dùng chung.
 *
 * QUY ƯỚC BẢO MẬT (chống SQL Injection):
 *  - Mọi giá trị đến từ người dùng LUÔN đi qua tham số (:name), không bao giờ nối chuỗi vào câu SQL.
 *  - Phần động của câu SQL (ORDER BY, danh sách IN) chỉ lấy từ danh sách cho phép (whitelist)
 *    hoặc được sinh ra thành các tham số riêng bằng inList().
 *
 * VỀ THỜI GIAN: cột ngày giờ trong CSDL lưu giờ UTC. Ứng dụng luôn truyền tham số :now = new Date()
 * cho các cột "tạo lúc / đổi lúc" thay vì gọi NOW() trong câu SQL, và kết nối được cấu hình
 * timezone: 'Z' nên đối tượng Date của JavaScript luôn được ghi/đọc đúng là giờ UTC,
 * không phụ thuộc múi giờ hệ điều hành của máy chạy MySQL. utils/time.js tự quy đổi sang giờ
 * Việt Nam (UTC+7) khi hiển thị.
 */
const mysql = require('mysql2/promise');
const env = require('./env');
const logger = require('../utils/logger');

function buildConfig() {
  return {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    namedPlaceholders: true,
    timezone: 'Z',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 15000,
    ssl: env.db.ssl ? {} : undefined,
  };
}

let poolPromise = null;

/** Trả về pool kết nối (tạo một lần, dùng lại). Lỗi kết nối lần đầu thì lần sau thử tạo lại. */
async function getPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const pool = mysql.createPool(buildConfig());
      pool.on('error', (err) => logger.error('Lỗi pool MySQL:', err.message));
      await pool.query('SELECT 1'); // chạm vào pool để lỗi cấu hình lộ ra ngay, không đợi đến request đầu tiên
      return pool;
    })().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

async function close() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  poolPromise = null;
  await pool.end();
}

/** Chuẩn hóa kết quả của mysql2 về { rows, rowsAffected, insertId } dùng chung cho cả SELECT lẫn INSERT/UPDATE/DELETE. */
function normalize(result) {
  const [data] = result;
  if (Array.isArray(data)) return { rows: data, rowsAffected: [data.length], insertId: undefined };
  return { rows: [], rowsAffected: [data.affectedRows || 0], insertId: data.insertId };
}

function makeApi(exec) {
  async function query(text, params) {
    return normalize(await exec(text, params || {}));
  }
  return {
    query,
    async one(text, params) {
      const r = await query(text, params);
      return r.rows[0] || null;
    },
    async scalar(text, params) {
      const r = await query(text, params);
      const row = r.rows[0];
      if (!row) return null;
      const keys = Object.keys(row);
      return keys.length ? row[keys[0]] : null;
    },
    /** Dùng cho INSERT: trả về id vừa sinh (AUTO_INCREMENT), thay cho OUTPUT INSERTED của T-SQL. */
    async insert(text, params) {
      const r = await query(text, params);
      return r.insertId;
    },
  };
}

async function query(text, params) {
  const pool = await getPool();
  return makeApi((t, p) => pool.execute(t, p)).query(text, params);
}
async function one(text, params) {
  const pool = await getPool();
  return makeApi((t, p) => pool.execute(t, p)).one(text, params);
}
async function scalar(text, params) {
  const pool = await getPool();
  return makeApi((t, p) => pool.execute(t, p)).scalar(text, params);
}
async function insert(text, params) {
  const pool = await getPool();
  return makeApi((t, p) => pool.execute(t, p)).insert(text, params);
}

/**
 * Chạy một nhóm lệnh trong một giao dịch (transaction). fn nhận đối tượng t có query/one/scalar/insert,
 * tất cả dùng chung một kết nối nên "SELECT ... FOR UPDATE" trong t khóa đúng dòng cho tới khi commit/rollback.
 * Có lỗi (kể cả BusinessError) thì rollback toàn bộ, không để lại dữ liệu dở dang.
 */
async function tx(fn) {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const t = makeApi((text, params) => conn.execute(text, params));
    const result = await fn(t);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* kết nối có thể đã mất, bỏ qua lỗi rollback để không che lấp lỗi gốc */
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** Tạo danh sách tham số cho mệnh đề IN. Danh sách rỗng trả về NULL để IN (NULL) không khớp dòng nào. */
function inList(prefix, values) {
  const params = {};
  const names = (values || []).map((v, i) => {
    const n = `${prefix}${i}`;
    params[n] = v;
    return `:${n}`;
  });
  return { clause: names.length ? names.join(', ') : 'NULL', params };
}

/** 1062 = ER_DUP_ENTRY, vi phạm UNIQUE KEY. */
function isUniqueViolation(err) {
  return Boolean(err) && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062);
}

/** 1644 = ER_SIGNAL_EXCEPTION, lỗi do trigger tự ném bằng SIGNAL SQLSTATE '45000'. */
function isSignalError(err) {
  return Boolean(err) && (err.errno === 1644 || err.sqlState === '45000');
}

/** Diễn giải lỗi kết nối bằng tiếng Việt kèm gợi ý cách sửa. */
function describeConnectError(err) {
  const code = err && err.code;
  const msg = String((err && err.message) || err);
  const hints = [];
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    hints.push('Sai tài khoản hoặc mật khẩu MySQL. Kiểm tra DB_USER và DB_PASSWORD trong file .env.');
    hints.push('Nếu vừa tạo tài khoản bằng sql/03_create_app_user.sql, kiểm tra lại mật khẩu đã đặt trong file đó.');
  } else if (code === 'ER_BAD_DB_ERROR') {
    hints.push(`Không tìm thấy CSDL "${env.db.name}". Hãy chạy sql/01_schema.sql trong MySQL Workbench hoặc dòng lệnh mysql trước, hoặc kiểm tra DB_NAME.`);
  } else if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'PROTOCOL_CONNECTION_LOST') {
    hints.push(`Không kết nối được tới MySQL tại "${env.db.host}:${env.db.port}".`);
    hints.push('Kiểm tra dịch vụ MySQL (MySQL80 trong Services.msc trên Windows) đang chạy, DB_HOST/DB_PORT đúng, và tường lửa cho phép cổng 3306.');
  } else if (code === 'ER_NOT_SUPPORTED_AUTH_MODE') {
    hints.push('Tài khoản dùng kiểu xác thực mà driver không hỗ trợ. Trong MySQL chạy: ALTER USER \'ivy_app\'@\'%\' IDENTIFIED WITH caching_sha2_password BY \'mật khẩu\';');
  } else {
    hints.push('Xem thông báo gốc bên dưới và đối chiếu mục "Cấu hình kết nối CSDL" trong README.');
  }
  return { message: msg, hints };
}

module.exports = {
  mysql,
  getPool,
  close,
  query,
  one,
  scalar,
  insert,
  tx,
  inList,
  isUniqueViolation,
  isSignalError,
  describeConnectError,
};
