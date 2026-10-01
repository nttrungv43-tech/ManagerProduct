// src/utils/poSummary.js
// FEAT-12 — Tính tổng số lượng theo từng đơn hàng PO.
// Dữ liệu **dẫn xuất**: không lưu DB, tính lại từ `items` mỗi lần hiển thị.
//
// Không phụ thuộc DB/React nên chạy được bằng
// `node scripts/test-poSummary.mjs` mà không cần Expo (SPEC-test.md §11.2).

export const MULTI_PO_LABEL = 'Nhiều PO';

/** Khoá nội bộ của nhóm "nhiều PO" — không đụng tên PO thật. */
const MULTI_KEY = '__multi__';

/** Khoá riêng cho từng PO thật, tránh trùng với khoá đặc biệt của Object. */
const poKey = po => `po:${po}`;

/**
 * Nhãn hiển thị của một dòng bảng (INV-U2).
 * @param {{isMulti: boolean, label?: string, itemCount?: number}} group
 * @returns {string}
 */
export function poRowLabel(group) {
  if (!group) return '';
  if (group.isMulti) return `${MULTI_PO_LABEL} (${group.itemCount} mã)`;
  return group.label;
}

/**
 * Gom `items` thành các nhóm PO kèm tổng số lượng.
 *
 * Quy tắc gom nhóm (xem `SPEC-data.md` §5.6):
 *  - `po` **không** chứa `+`  → cộng vào nhóm tên `po`.
 *  - `po` **có** `+` (mã thuộc nhiều PO) → **không** cộng vào PO nào,
 *    tất cả gom vào MỘT nhóm `Nhiều PO`. Vì vậy `A+B` và `B+A` cùng nhóm.
 *
 * Bất biến INV-D6: `Σ target` của mọi nhóm luôn bằng `Σ target` của `items`
 * ⇒ bảng PO không bao giờ cộng trùng.
 *
 * AC-ITEM-24: **mọi PO của đơn đều có dòng**, kể cả PO không có mã nào thuộc riêng
 * ⇒ bảng khớp đúng chip lọc PO. `allPos` truyền vào là `allPOs(items)`; nếu bỏ trống
 * thì hàm tự tách từ `items` theo đúng quy tắc của `allPOs`.
 *
 * @param {Array<{ntk: string, po: string, target?: number, produced?: number, defect?: number}>} items
 * @param {string[]} [allPos] Danh sách PO của đơn (thường là `allPOs(items)`).
 * @returns {Array<{key: string, label: string, isMulti: boolean, itemCount: number,
 *                  target: number, produced: number, remaining: number, defect: number, pct: number}>}
 *          Đã sắp xếp: `target` giảm dần, bằng nhau thì `label` tăng dần.
 *          Mảng rỗng ⇒ `[]`.
 */
export function poSummaries(items, allPos) {
  const list = Array.isArray(items) ? items : [];
  const groups = new Map();

  // Bảo đảm mọi PO của đơn đều có dòng, kể cả khi không có mã nào thuộc riêng.
  const pos = Array.isArray(allPos)
    ? allPos
    : [...new Set(list.map(it => String(it?.po ?? '').split('+')).flat())];
  pos.forEach(po => {
    const key = poKey(po);
    if (key !== MULTI_KEY && !groups.has(key)) {
      groups.set(key, { key, label: po, isMulti: false, itemCount: 0, target: 0, produced: 0, remaining: 0, defect: 0, pct: 0 });
    }
  });

  for (const it of list) {
    const po = String(it?.po ?? '').trim();
    const isMulti = po.includes('+');
    const key = isMulti ? MULTI_KEY : poKey(po);

    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: isMulti ? MULTI_PO_LABEL : po,
        isMulti,
        itemCount: 0,
        target: 0,
        produced: 0,
        remaining: 0,
        defect: 0,
        pct: 0,
      };
      groups.set(key, g);
    }

    // Ép `|| 0` để an toàn khi dữ liệu ngoài `fetchItemsWithStats` trả null.
    const target = Number(it?.target) || 0;
    const produced = Number(it?.produced) || 0;

    g.itemCount += 1;
    g.target += target;
    g.produced += produced;
    g.remaining += Math.max(target - produced, 0);
    g.defect += Number(it?.defect) || 0;
  }

  for (const g of groups.values()) {
    g.pct = g.target > 0 ? Math.round((g.produced / g.target) * 1000) / 10 : 0;
    g.label = poRowLabel(g);
  }

  return [...groups.values()].sort(
    (a, b) => b.target - a.target || a.label.localeCompare(b.label)
  );
}