'use strict';
/**
 * Thời gian theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
 * CSDL lưu UTC. Chỉ đổi sang giờ Việt Nam khi hiển thị hoặc khi nhận dữ liệu từ form.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n, w = 2) => String(n).padStart(w, '0');

function asDate(d) {
  if (d === null || d === undefined || d === '') return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
}

function vnParts(d) {
  const x = asDate(d);
  if (!x) return null;
  const s = new Date(x.getTime() + VN_OFFSET_MS);
  return {
    y: s.getUTCFullYear(), mo: s.getUTCMonth() + 1, d: s.getUTCDate(),
    h: s.getUTCHours(), mi: s.getUTCMinutes(), s: s.getUTCSeconds(),
  };
}

/** "04/11/2026" */
function formatDate(d) {
  const p = vnParts(d);
  return p ? `${pad(p.d)}/${pad(p.mo)}/${p.y}` : '';
}

/** "00:30 04/11/2026" */
function formatDateTime(d) {
  const p = vnParts(d);
  return p ? `${pad(p.h)}:${pad(p.mi)} ${pad(p.d)}/${pad(p.mo)}/${p.y}` : '';
}

/** "2026-11-04" (giờ Việt Nam), dùng cho <input type="date"> */
function toDateInput(d) {
  const p = vnParts(d);
  return p ? `${p.y}-${pad(p.mo)}-${pad(p.d)}` : '';
}

/** "2026-11-04T00:30" (giờ Việt Nam), dùng cho <input type="datetime-local"> */
function toDateTimeLocal(d) {
  const p = vnParts(d);
  return p ? `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}` : '';
}

/** Đọc "yyyy-MM-dd" thành {y, mo, d}. Trả về null nếu không phải ngày có thật. */
function parseYmd(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, mo, d };
}

/** 0 giờ ngày "yyyy-MM-dd" theo giờ Việt Nam, trả về Date (UTC). */
function fromDateInput(str) {
  const p = parseYmd(str);
  return p ? new Date(Date.UTC(p.y, p.mo - 1, p.d) - VN_OFFSET_MS) : null;
}

/** Đọc "yyyy-MM-ddTHH:mm" (giờ Việt Nam) thành Date (UTC). */
function fromDateTimeLocal(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || t.getUTCHours() !== h || t.getUTCMinutes() !== mi) {
    return null;
  }
  return new Date(t.getTime() - VN_OFFSET_MS);
}

function addDays(date, n) {
  return new Date(date.getTime() + n * DAY_MS);
}

/** 0 giờ (giờ Việt Nam) của ngày chứa thời điểm d, trả về Date (UTC). */
function vnStartOfDay(d = new Date()) {
  const p = vnParts(d);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d) - VN_OFFSET_MS);
}

/** 0 giờ ngày mùng 1 (giờ Việt Nam) của tháng chứa thời điểm d. */
function vnStartOfMonth(d = new Date()) {
  const p = vnParts(d);
  return new Date(Date.UTC(p.y, p.mo - 1, 1) - VN_OFFSET_MS);
}

/** 0 giờ ngày mùng 1 của tháng kế tiếp (Date.UTC tự cuộn sang năm sau khi tháng = 12). */
function vnStartOfNextMonth(d = new Date()) {
  const p = vnParts(d);
  return new Date(Date.UTC(p.y, p.mo, 1) - VN_OFFSET_MS);
}

/** "261104" (yyMMdd theo giờ Việt Nam), dùng trong mã đơn hàng. */
function vnYYMMDD(d = new Date()) {
  const p = vnParts(d);
  return `${String(p.y).slice(-2)}${pad(p.mo)}${pad(p.d)}`;
}

/** "20261104003015" (yyyyMMddHHmmss theo giờ Việt Nam), định dạng thời gian của VNPay. */
function vnTimestamp14(d = new Date()) {
  const p = vnParts(d);
  return `${p.y}${pad(p.mo)}${pad(p.d)}${pad(p.h)}${pad(p.mi)}${pad(p.s)}`;
}

module.exports = {
  VN_OFFSET_MS, DAY_MS, vnParts, formatDate, formatDateTime, toDateInput, toDateTimeLocal,
  parseYmd, fromDateInput, fromDateTimeLocal, addDays, vnYYMMDD, vnTimestamp14,
  vnStartOfDay, vnStartOfMonth, vnStartOfNextMonth,
};
