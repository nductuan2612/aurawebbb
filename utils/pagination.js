'use strict';

/**
 * Tính phân trang. items là dãy số trang kèm null ở chỗ cần hiện dấu "…".
 * Ví dụ trang 5/20: [1, 2, null, 4, 5, 6, null, 19, 20]
 */
function paginate(total, page, perPage) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const wanted = Number.isInteger(page) ? page : 1;
  const current = Math.min(Math.max(1, wanted), totalPages);
  const offset = (current - 1) * perPage;

  const set = new Set([1, 2, current - 1, current, current + 1, totalPages - 1, totalPages]);
  const nums = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

  const items = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev === 2) items.push(prev + 1); // thiếu đúng một trang thì hiện luôn số trang thay vì dấu "…"
    else if (n - prev > 2) items.push(null);
    items.push(n);
    prev = n;
  }
  return { total, perPage, totalPages, current, offset, hasPrev: current > 1, hasNext: current < totalPages, items };
}

module.exports = { paginate };
