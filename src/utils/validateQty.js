// src/utils/validateQty.js
// FEAT-09 — Kiểm tra tính hợp lệ của dữ liệu số lượng nhập sản xuất.
// Hàm thuần (pure): không phụ thuộc React/SQLite ⇒ test được bằng Node thuần.
// Xem specs/features/FEAT-09-validate-qty-limit.md

// "1.200" / "1 200" là dấu phân tách nghìn hợp lệ; "1.5" thì không (mỗi nhóm phải đúng 3 chữ số).
const THOUSANDS_RE = /^\d{1,3}(?:[.\s]\d{3})+$/;
const PLAIN_INT_RE = /^\d+$/;

/** Chuẩn hoá chuỗi số: bỏ khoảng trắng, coi `.` và ` ` là phân tách nghìn. Trả null nếu không hợp lệ. */
function normalizeDigits(s) {
  if (THOUSANDS_RE.test(s)) return s.replace(/[.\s]/g, '');
  if (PLAIN_INT_RE.test(s)) return s;
  return null;
}

/**
 * Chuyển giá trị nhập vào thành số nguyên ≥ 0 hợp lệ.
 * @param {string|number} raw
 * @returns {number|null} null = không hợp lệ (rỗng, chữ, ký hiệu khoa học, âm, số thực, quá lớn)
 */
export function parseQty(raw) {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const digits = normalizeDigits(trimmed);
  if (digits === null) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * Kiểm tra số lượng sắp ghi có vượt đơn đặt hàng hay không.
 * Quy tắc (INV-V1): SUM(entries.qty) + qtyMới ≤ items.target, tính riêng trong batch active.
 * `defect_qty` không tính vào hạn mức (nằm trong tổng đã sản xuất).
 * @returns {{ok:true}|{ok:false, code:'OVER_TARGET', target:number, produced:number,
 *            incomingQty:number, remaining:number, overBy:number}}
 */
export function checkQtyLimit({ target = 0, produced = 0, incomingQty = 0, hasLimit = null } = {}) {
  const limitOn = hasLimit === null || hasLimit === undefined ? Number(target) > 0 : !!hasLimit;
  if (!limitOn) return { ok: true };

  const q = Number(incomingQty) || 0;
  if (q <= 0) return { ok: true };

  const t = Number(target) || 0;
  const p = Number(produced) || 0;
  const total = p + q;
  if (total <= t) return { ok: true };

  return {
    ok: false,
    code: 'OVER_TARGET',
    target: t,
    produced: p,
    incomingQty: q,
    remaining: Math.max(t - p, 0),
    overBy: total - t,
  };
}

/** Định dạng số kiểu Việt Nam: 1200 → "1.200". Không dùng Intl (Hermes hạn chế). */
function groupDigits(n) {
  const s = String(n);
  const sign = s.startsWith('-') ? '-' : '';
  const digits = sign ? s.slice(1) : s;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Thông điệp tiếng Việt cho Alert khi vượt hạn mức (INV-U2). */
export function formatQtyError(result, ntk) {
  if (!result || result.ok !== false) return '';
  if (result.code === 'OVER_TARGET') {
    const label = ntk ? `Mã ${ntk}: ` : '';
    return `${label}kế hoạch ${groupDigits(result.target)}, đã làm ${groupDigits(result.produced)}. `
      + `Chỉ còn nhập tối đa ${groupDigits(result.remaining)} `
      + `(bạn nhập ${groupDigits(result.incomingQty)}, vượt ${groupDigits(result.overBy)}).`;
  }
  return 'Dữ liệu không hợp lệ.';
}

export const INVALID_QTY_TITLE = 'Số lượng không hợp lệ';
export const INVALID_QTY_MESSAGE = 'Chỉ nhập số nguyên không âm (ví dụ: 120, 1200 hoặc 1.200).';
export const OVER_TARGET_TITLE = 'Vượt đơn đặt hàng';
