// src/utils/date.js
// BUG-02 — Ngày cục bộ, KHÔNG dùng giờ UTC.
//
// Vì sao: `new Date().toISOString().slice(0, 10)` trả ngày theo **UTC**. Ở Việt Nam
// (UTC+7), nhập số lượng lúc 00:00–06:59 sáng sẽ bị ghi nhầm sang **hôm trước**.
// Lỗi này từng nằm ở `ItemCard` (ngày nhật ký) và `queries.finishOrder` (ngày hoàn tất đơn).
//
// Dùng định dạng `YYYY-MM-DD` — giữ đúng INV-D2 (`SPEC-data.md` §5.1) và khớp cột `date`
// mà `fetchHistoryGrouped` nhóm bằng `substr(date,1,…)`.
//
// Hàm thuần, không phụ thuộc React/DB ⇒ test được bằng `node scripts/test-date.mjs`.

/**
 * Ngày cục bộ dạng `YYYY-MM-DD`.
 * @param {Date} [now] Mốc thời gian (mặc định hiện tại) — truyền vào để test được.
 * @returns {string} `YYYY-MM-DD`
 */
export function todayLocal(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Kiểm tra chuỗi có đúng định dạng `YYYY-MM-DD` và là ngày có thật không.
 * Dùng khi cần chặn dữ liệu rác (ví dụ `date` đọc từ file JSON import).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDateString(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(mo) - 1 &&
    date.getDate() === Number(d)
  );
}

/**
 * Chuyển ngày từ định dạng ISO `YYYY-MM-DD` sang `DD-MM-YYYY` để hiển thị cho người dùng.
 * Nếu chuỗi không đúng định dạng `YYYY-MM-DD`, trả về chuỗi gốc.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDisplayDate(dateStr) {
  if (typeof dateStr !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}