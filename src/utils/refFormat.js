// src/utils/refFormat.js
// FEAT-22 — Định dạng số hiệu nhà máy (`order_ref`, còn gọi là `DMAC No.`) để hiển thị trên thẻ
// mã hàng.
//
// Hàm thuần, không đụng React/SQLite ⇒ `ItemCard` chỉ render, còn kiểm thử thì chạy bằng `node` thuần
// (xem `scripts/test-refFormat.mjs`).
//
// NGUYÊN TẮC: không có dữ liệu ⇒ **ẩn**, không hiện `0`/`—`/`Chưa có` (INV-I1). Số hiệu là dữ liệu
// chỉ đọc từ packing list, app không tự bịa (INV-I2).

/**
 * Bỏ khoảng trắng và các ký tự rác, trả `null` nếu rỗng.
 * Trả `null` (không phải `''`) để phân biệt "không có" với "có chuỗi rỗng" — cả hai đều phải ẩn, nhưng
 * `null` cũng là giá trị mà `fetchItemsWithStats` trả về khi `GROUP_CONCAT` rỗng.
 */
function cleanRef(v) {
  const s = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * Chuẩn hoá `refs` từ tầng DB thành danh sách sạch đã sắp xếp.
 *
 * `fetchItemsWithStats` trả `refs: [{ ref_no, target }]` (đã ghép từ 2 chuỗi `GROUP_CONCAT`).
 * Hàm này:
 *   • bỏ dòng thiếu `ref_no`;
 *   • `target` không phải số hữu hạn ⇒ `0` (không phải `NaN` lọt ra màn hình);
 *   • loại trùng `ref_no` (giữ lần đầu) để một ref không bị hiện hai lần nếu view đổi;
 *   • sắp xếp theo `ref_no` để thứ tự **ổn định** giữa các lần mở app.
 *
 * @param {Array<{ref_no?: string, target?: number}>|null|undefined} refs
 * @returns {Array<{ref_no: string, target: number}>}
 */
export function normalizeRefs(refs) {
  if (!Array.isArray(refs)) return [];
  const seen = new Map();
  for (const r of refs) {
    const ref_no = cleanRef(r?.ref_no);
    if (!ref_no || seen.has(ref_no)) continue;
    const t = Number(r?.target);
    seen.set(ref_no, { ref_no, target: Number.isFinite(t) ? t : 0 });
  }
  return [...seen.values()].sort((a, b) => a.ref_no.localeCompare(b.ref_no));
}

/** Thẻ có cần hiện dòng số hiệu không? Rỗng ⇒ ẩn (INV-I1). */
export function hasRefs(refs) {
  return normalizeRefs(refs).length > 0;
}

/**
 * Nhãn tiêu đề của dòng số hiệu.
 *
 *   1 ref  → `Số hiệu` (gọn, không tạo cảm giác nhiều)
 *   N ref  → `Số hiệu (N)` — nói rõ đây là **nhiều** số hiệu, vì đó là trường hợp đặc biệt cần
 *             người dùng để ý (một mã, nhiều số hiệu trong cùng PO).
 *
 * @returns {string} chuỗi rỗng nếu không có ref
 */
export function refLabel(refs) {
  const list = normalizeRefs(refs);
  if (list.length === 0) return '';
  if (list.length === 1) return 'Số hiệu';
  return `Số hiệu (${list.length})`;
}

/**
 * Dòng hiển thị cho **mỗi** ref: `D980470 — 477 pcs`.
 *
 * Với 1 ref, số lượng vẫn hiện: người dùng cần biết ref đó gắn với bao nhiêu pcs để đối chiếu, và
 * tổng các dòng luôn bằng `Kế hoạch` của thẻ (`INV-D7`).
 *
 * @returns {string[]} rỗng nếu không có ref
 */
export function refLines(refs) {
  return normalizeRefs(refs).map(
    ({ ref_no, target }) =>
      `${ref_no} — ${target.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} pcs`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FEAT-23 — tiến độ và nhập số lượng THEO SỐ HIỆU (phương án A: thẻ cha giữ nguyên)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chuẩn hoá `refProgress` từ view: `[{ ref_no, produced, target }]`.
 *
 * Vì sao tách riêng `normalizeRefs` mà không dùng chung: hai đó là **hai nguồn** khác nhau —
 * `refs` là danh sách số hiệu (FEAT-22, có thể đọc khi chưa có nhật ký nào), còn `refProgress` là
 * tiến độ (FEAT-23, kèm `produced`). Trộn hai nguồn sẽ khiến "có số hiệu" bị nhầm thành "đã có nhập ký".
 *
 * `produced`/`target` không phải số hữu hạn ⇒ `0` (không để `NaN` lọt ra màn hình).
 *
 * Sắp xếp lại theo `ref_no` **giống hệt** `normalizeRefs`: khối "Số hiệu" (đọc `refs`) và khối
 * "Tiến độ & nhập theo số hiệu" (đọc `refProgress`) phải cùng thứ tự, nếu không người dùng thấy
 * hai danh sách cùng một bộ ref nhưng lệch dòng.
 */
export function normalizeRefProgress(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const r of list) {
    const ref_no = cleanRef(r?.ref_no);
    if (!ref_no || seen.has(ref_no)) continue;
    const produced = Number(r?.produced);
    const target = Number(r?.target);
    seen.add(ref_no);
    out.push({
      ref_no,
      produced: Number.isFinite(produced) ? produced : 0,
      target: Number.isFinite(target) ? target : 0,
    });
  }
  return out.sort((a, b) => a.ref_no.localeCompare(b.ref_no));
}

/** Thẻ có cần hiện khối nhập theo số hiệu không? Rỗng ⇒ ẩn (AC-RF-10). */
export function hasRefProgress(list) {
  return normalizeRefProgress(list).length > 0;
}

/**
 * Dòng tiến độ của một ref: `Đã làm 200/477 · Còn lại 277`.
 *
 * `Còn lại` là `max(target - produced, 0)` — không âm, vì `produced` vượt `target` là chuyện không
 * được phép xảy ra (INV-R5) nhưng hiển thị số âm thì đáng tin hơn là hiện số sai.
 *
 * **Tính từ `produced` ĐÃ LÀM TRÒN**, không phải giá trị thô: nếu lấy `100 − 12.345 = 87.655` thì
 * ra "12,35 / 100 · Còn lại 87,66" — người dùng cộng lại thấy 100,01 ≠ 100 và mất lòng tin vào
 * cả bảng số. Tròn `produced` trước rồi trừ thì ba số luôn khớp nhau.
 */
export function refProgressText(entry) {
  const shown = round2(entry.produced);
  const remaining = Math.max(round2(entry.target) - shown, 0);
  return `Đã làm ${fmt(shown)}/${fmt(entry.target)} · Còn lại ${fmt(remaining)}`;
}

/**
 * Dòng báo phần sản lượng **chưa gắn số hiệu** (AC-RF-08).
 *
 * Bắt buộc phải báo: nếu chỉ hiện tổng các ref thì `Σ` sẽ lệch với `Đã làm` ở thẻ cha mà không có
 * lý do. `0` ⇒ không hiện (không tạo dòng rỗng vô nghĩa).
 */
export function unattributedText(produced) {
  const n = Number(produced);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `chưa gắn số hiệu: ${fmt(n)} pcs`;
}

/**
 * Nhãn cột hạn mức khi nhập quá kế hoạch **của số hiệu** — tách khỏi `formatQtyError` của
 * `validateQty` (dành cho hạn mức tổng của mã) để người dùng biết đang vượt hạn mức nào.
 *
 * **Không** đòi `ok === false`: object lỗi từ `fail()` là `{ code, … }` (không có `ok`), còn kết quả
 * thô của `checkQtyLimit` có `ok`. Chỉ cần `code === 'OVER_TARGET'` là đủ và an toàn với cả hai.
 */
export function formatRefOverLimit(result) {
  if (!result || result.code !== 'OVER_TARGET' || !result.ref_no) return '';
  return `Số hiệu ${result.ref_no}: kế hoạch ${fmt(result.target)}, đã làm ${fmt(result.produced)}. `
    + `Chỉ còn nhập tối đa ${fmt(result.remaining)} `
    + `(bạn nhập ${fmt(result.incomingQty)}, vượt ${fmt(result.overBy)}).`;
}

/** Định dạng số kiểu Việt Nam (dấu chấm phân tách nghìn). */
function fmt(n) {
  return Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

/** Làm tròn về 2 chữ số thập phân, khớp `fmt` (tránh lệch 0,01 do float). */
function round2(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}