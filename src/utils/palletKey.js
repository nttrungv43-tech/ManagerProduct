// src/utils/palletKey.js
// FEAT-10 — Khoá trạng thái đóng kiện theo `ntk` (quyết định Q1 = phương án A).
// Hàm thuần: không phụ thuộc React/SQLite ⇒ test được bằng Node thuần.
// Xem specs/features/FEAT-10-edit-items-pallets.md §6.2
//
// Định dạng khoá (thay cho `${cid}-${no}-${idx}` của INV-D4 cũ):
//   kiện 1 loại hàng  → `${containerId}-${palletNo}`
//   kiện nhiều loại   → `${containerId}-${palletNo}-${ntk}`
// Dùng `ntk` (định danh tự nhiên) thay vì chỉ số để trạng thái tick không bị mất
// khi thêm/xoá một dòng hàng trong kiện (AC-EDIT-17, AC-EDIT-18).

/** Khoá của 1 kiện. Bỏ `item` khi kiện chỉ có 1 loại hàng. */
export function palletKey(containerId, palletNo, item) {
  if (!item) return `${containerId}-${palletNo}`;
  return `${containerId}-${palletNo}-${item.ntk}`;
}

/** Kiện có nhiều loại hàng không (quyết định dùng khoá có `ntk` hay không). */
export function isMultiItemPallet(pallet) {
  return !!pallet && Array.isArray(pallet.items) && pallet.items.length > 1;
}

/** Danh sách khoá của một kiện. */
export function palletKeyList(containerId, pallet) {
  if (!pallet) return [];
  if (!isMultiItemPallet(pallet)) return [palletKey(containerId, pallet.no)];
  return pallet.items.map(it => palletKey(containerId, pallet.no, it));
}

function hasKey(map, key) {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/**
 * Đọc trạng thái done của một dòng hàng trong cấu trúc CŨ.
 * Chấp nhận cả khoá mới (theo ntk) lẫn khoá cũ (theo chỉ số) để migration không mất tick.
 */
function readItemDone(containerId, pallet, idx, item, doneMap) {
  if (!isMultiItemPallet(pallet)) {
    return !!doneMap[palletKey(containerId, pallet.no)];
  }
  const ntkKey = palletKey(containerId, pallet.no, item);
  if (hasKey(doneMap, ntkKey)) return !!doneMap[ntkKey];
  return !!doneMap[`${containerId}-${pallet.no}-${idx}`];
}

/**
 * Chuyển trạng thái tick từ cấu trúc `before` sang `after` theo **định danh ntk**.
 * Khoá của kiện đã bị xoá, hoặc dòng hàng đã bị xoá, sẽ không còn trong kết quả.
 *
 * @param {Array} beforeContainers cấu trúc container trước khi sửa
 * @param {Array} afterContainers  cấu trúc container sau khi sửa
 * @param {Object} doneMap         `{ [key]: boolean }` hiện tại
 * @returns {Object} bản `doneMap` mới (khoá theo định dạng mới)
 */
export function remapPalletStatus(beforeContainers, afterContainers, doneMap) {
  const beforeById = new Map();
  (beforeContainers || []).forEach(c => beforeById.set(c.id, c));

  const out = {};
  (afterContainers || []).forEach(c => {
    const beforeContainer = beforeById.get(c.id);
    const beforeByNo = new Map();
    if (beforeContainer) (beforeContainer.pallets || []).forEach(p => beforeByNo.set(p.no, p));

    (c.pallets || []).forEach(pallet => {
      const beforePallet = beforeByNo.get(pallet.no);

      // Trạng thái cũ theo ntk của kiện này.
      const oldByNtk = new Map();
      if (beforePallet) {
        (beforePallet.items || []).forEach((it, idx) => {
          oldByNtk.set(it.ntk, readItemDone(c.id, beforePallet, idx, it, doneMap));
        });
      }

      const multi = isMultiItemPallet(pallet);
      (pallet.items || []).forEach(it => {
        const wasDone = oldByNtk.has(it.ntk) ? oldByNtk.get(it.ntk) : false;
        out[palletKey(c.id, pallet.no, multi ? it : undefined)] = wasDone;
      });
    });
  });

  return out;
}

/** Tổng số kiện và tổng số pcs của một cấu trúc container. */
export function recalcPalletTotals(containers) {
  let count = 0;
  let totalQty = 0;
  (containers || []).forEach(c => {
    (c.pallets || []).forEach(p => {
      count++;
      (p.items || []).forEach(it => { totalQty += it.qty || 0; });
    });
  });
  return { count, totalQty };
}
