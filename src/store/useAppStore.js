// src/store/useAppStore.js
// FEAT-21 — Store trên **thiết kế DB mới** (xem specs/PLAN-db-redesign.md).
//
// Ba state biến mất so với bản cũ, và việc biến mất đó **là** bằng chứng thiết kế đã đúng:
//   • `itemPoRows` — bản cũ cần mảng `item_po` để biết mỗi PO của mã có bao nhiêu số lượng.
//     Nay `order_lines` **đã là** (PO × mã) nên `items` mang sẵn `target` của riêng PO.
//   • `palletDoneMap` — bản cũ cần map khoá mã hoá `${container}-${no}-${ntk}`. Nay trạng thái
//     tick là cột `pallet_lines.done`, đọc cùng cấu trúc container ⇒ không cần map riêng.
//   • `containerData` vẫn giữ **tên** (nhiều màn hình dùng) nhưng giờ là cây từ bảng thật,
//     không phải blob JSON.
//
// 🔒 Tên state/action **giữ nguyên** theo SPEC-rules §4.2 — chỉ đổi phần bên trong.
import { create } from 'zustand';
import { getDb, getActiveBatchId } from '@/db';
import * as q from '@/db/queries';
import { looksLikePackingV1 as isPackingV1 } from '@/utils/importFormat';

export const useAppStore = create((set, get) => ({
  ready: false,
  batchId: null,
  items: [],
  // Bảng "Tổng theo PO" — đọc thẳng từ view `v_po_progress`, không dựng trong JS.
  poRows: [],
  archives: [],
  // Cấu trúc container → kiện → dòng hàng, đọc từ 3 bảng thật (thay blob JSON).
  containerData: [],

  activeFilter: 'all',
  activeStatusFilter: 'all',
  activeContainerFilter: 'all',
  searchQuery: '',
  historyGroup: 'day',
  historyFilterValue: '',
  dataVersion: 0,
  importStatus: 'idle',
  importResult: null,
  // Đang chạy `finishOrder` — dùng để khoá nút "Hoàn tất" chống gọi song song (INV-B1).
  finishing: false,
  // Đang chạy `deleteArchive` — khoá nút `🗑` chống xoá hai đơn cùng lúc (FEAT-15, RC-98).
  archivesBusy: false,
  // FEAT-26: Thông tin thẻ mã hàng vừa được cập nhật gần nhất
  lastUpdatedInfo: null,
  setLastUpdatedInfo: (info) => set({ lastUpdatedInfo: info }),


  init: async () => {
    const db = await getDb();
    const batchId = await getActiveBatchId(db);
    const [items, poRows, archives, containerData] = await Promise.all([
      q.fetchItemsWithStats(batchId),
      q.fetchPoSummaries(batchId),
      q.fetchArchives(),
      q.fetchContainersView(batchId),
    ]);
    set({ ready: true, batchId, items, poRows, archives, containerData });
  },

  // FEAT-15: nạp lại danh sách đơn lưu trữ (dùng sau khi xoá hẳn một đơn).
  refreshArchives: async () => {
    set({ archives: await q.fetchArchives() });
  },

  // Nạp lại `items`. Đây là **phễu duy nhất** cho mọi thay đổi mã hàng/nhật ký nên số liệu
  // màn hình và số liệu bảng "Tổng theo PO" luôn khớp — cùng nguồn `v_line_progress`.
  refreshItems: async () => {
    const { batchId } = get();
    // Nạp `items` và `poRows` **cùng lúc** từ cùng nguồn `v_line_progress` ⇒ bảng "Tổng theo PO"
    // không bao giờ lệch với danh sách thẻ (bản cũ phải cộng tay nên có thể lệch).
    const [items, poRows] = await Promise.all([
      q.fetchItemsWithStats(batchId),
      q.fetchPoSummaries(batchId),
    ]);
    set({ items, poRows });
  },

  refreshContainerData: async () => {
    set({ containerData: await q.fetchContainersView(get().batchId) });
  },

  // ---------- NHẬT KÝ SẢN XUẤT ----------
  // `orderLineId` = một **thẻ** (PO × mã). Nhật ký luôn thuộc đúng thẻ đó ⇒ không còn
  // trường hợp "chưa gắn PO" (FEAT-20) và không cần chọn PO trong UI.

  addEntry: async (orderLineId, payload) => {
    const res = await q.addEntry(orderLineId, payload);
    if (res && res.ok === false) return res;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    set({
      lastUpdatedInfo: {
        orderLineId,
        qty: payload?.qty,
        refNo: payload?.refNo,
        time: timeStr,
        timestamp: Date.now(),
      },
    });
    await get().refreshItems();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true };
  },

  updateEntry: async (entryId, payload) => {
    const res = await q.updateEntry(entryId, payload);
    if (res && res.ok === false) return res;
    await get().refreshItems();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true };
  },

  removeEntry: async (entryId) => {
    await q.removeEntry(entryId);
    await get().refreshItems();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
  },

  // ---------- ITEMS CRUD (FEAT-10) ----------

  addItem: async (payload) => {
    const res = await q.addItem(get().batchId, payload);
    if (res && res.ok === false) return res;
    await get().refreshItems();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true };
  },

  updateItem: async (orderLineId, payload) => {
    const res = await q.updateItem(get().batchId, orderLineId, payload);
    if (res && res.ok === false) return res;
    await get().refreshItems();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true };
  },

  removeItem: async (orderLineId) => {
    const res = await q.removeItem(get().batchId, orderLineId);
    if (res && res.ok === false) return res;
    await get().refreshItems();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true };
  },

  // ---------- ITEMS: xoá theo PO (FEAT-13) ----------

  /** Xem trước khi xoá theo PO — chỉ đọc, không ghi (AC-DEL-02). */
  previewDeleteByPo: async (po) => q.previewItemsByPo(get().batchId, po),

  removeItemsByPo: async (po) => {
    const res = await q.removeItemsByPo(get().batchId, po);
    if (res && res.ok === false) return res;
    await get().refreshItems();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return res;
  },

  // ---------- PALLETS CRUD (FEAT-10) ----------

  addPallet: async (containerId, payload) => {
    const res = await q.addPallet(get().batchId, containerId, payload);
    if (res && res.ok === false) return res;
    await get().refreshContainerData();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true };
  },

  updatePallet: async (containerId, palletNo, payload) => {
    const res = await q.updatePallet(get().batchId, containerId, palletNo, payload);
    if (res && res.ok === false) return res;
    await get().refreshContainerData();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true };
  },

  removePallet: async (containerId, palletNo) => {
    const res = await q.removePallet(get().batchId, containerId, palletNo);
    if (res && res.ok === false) return res;
    await get().refreshContainerData();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true };
  },

  // ---------- CONTAINERS CRUD (FEAT-25) ----------

  updateContainer: async (containerId, payload) => {
    const res = await q.updateContainer(get().batchId, containerId, payload);
    if (res && res.ok === false) return res;
    await get().refreshContainerData();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true, ...res };
  },

  removeContainer: async (containerId) => {
    const res = await q.removeContainer(get().batchId, containerId);
    if (res && res.ok === false) return res;
    await get().refreshContainerData();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true, ...res };
  },

  addContainer: async (poCode, payload) => {
    const res = await q.addContainer(get().batchId, poCode, payload);
    if (res && res.ok === false) return res;
    await get().refreshContainerData();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return { ok: true, ...res };
  },


  /**
   * Bật/tắt một dòng hàng trong kiện.
   *
   * Bản cũ truyền **khoá mã hoá** rồi phải `remapPalletStatus` dựng lại toàn bộ map. Nay chỉ
   * `UPDATE pallet_lines SET done` trên đúng một dòng ⇒ thêm/xoá dòng trong kiện không bao giờ
   * làm mất trạng thái (hết INV-P1, hết nguồn gốc của BUG-01).
   *
   * @param {number} palletLineId id của `pallet_lines`
   */
  togglePalletLine: async (palletLineId, currentlyDone) => {
    const res = await q.setPalletLineDone(palletLineId, !currentlyDone);
    if (res && res.ok === false) return res;
    await get().refreshContainerData();
    return { ok: true };
  },

  /**
   * Hoàn tất đơn hàng (AC-CONT-07, FEAT-24).
   * Hỗ trợ hoàn tất toàn bộ hoặc một phần các PO được chọn (`poCodes`).
   * Cờ `finishing` chặn **gọi song song**: hai lần bấm "Xác nhận" liên tiếp sẽ tạo ra hai đơn
   * `active` ⇒ vi phạm INV-B1. Lần thứ hai trả `{ok:false, code:'BUSY'}` ngay.
   *
   * @param {string[]|null} [poCodes=null] - Danh sách mã PO cần hoàn tất.
   */
  finishOrder: async (poCodes = null) => {
    if (get().finishing) return { ok: false, error: { code: 'BUSY' } };
    set({ finishing: true });
    try {
      const res = await q.finishOrder(poCodes);
      if (!res.ok) return res;
      if (res.partial) {
        // FEAT-24: Hoàn tất một phần PO → đơn active vẫn tiếp tục với các PO còn lại
        await Promise.all([
          get().refreshItems(),
          get().refreshContainerData(),
          get().refreshArchives(),
        ]);
        set((s) => ({ dataVersion: s.dataVersion + 1 }));
        return { ok: true, batchId: res.id, partial: true, completedPos: res.completedPos };
      } else {
        // FEAT-14: đơn mới luôn **trắng** ⇒ không nạp lại gì cả, chỉ đổi id.
        set({ batchId: res.id, items: [], poRows: [], containerData: [] });
        await get().refreshArchives();
        set((s) => ({ dataVersion: s.dataVersion + 1 }));
        return { ok: true, batchId: res.id, partial: false };
      }
    } finally {
      set({ finishing: false });
    }
  },

  /**
   * Xoá hẳn đơn hàng đã lưu trữ (FEAT-15, INV-B2).
   * `dataVersion++` để tab Lịch sử tự cập nhật (xoá nhật ký làm tổng nhóm ngày giảm theo —
   * đã được `Alert` cảnh báo trước, INV-B4).
   */
  deleteArchive: async (batchId) => {
    if (get().archivesBusy) return { ok: false, error: { code: 'BUSY' } };
    set({ archivesBusy: true });
    try {
      const res = await q.deleteArchive(batchId);
      if (!res.ok) return res;
      await get().refreshArchives();
      set((s) => ({ dataVersion: s.dataVersion + 1 }));
      return res;
    } finally {
      set({ archivesBusy: false });
    }
  },

  importFromJson: async (jsonData) => {
    set({ importStatus: 'loading', importResult: null });
    const { batchId } = get();
    try {
      const parsed = JSON.parse(jsonData);

      let result;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (parsed.entries) {
          result = await q.importEntriesFromJson(batchId, parsed.entries);
        } else if (isPackingV1(parsed)) {
          // Định dạng `packing_data.json` (schema_version 1) — nạp thẳng cả PO, mã, kiện.
          // Phải kiểm TRƯỚC nhánh `總表` vì file này cũng có mảng ở top-level.
          result = await q.importPackingV1(batchId, parsed);
          await get().refreshContainerData();
        } else if (parsed['總表'] || Object.keys(parsed).some(k => Array.isArray(parsed[k]))) {
          result = await q.importItemsFromJson(batchId, parsed);
        } else {
          result = await q.importEntriesFromJson(batchId, parsed);
        }
      } else if (Array.isArray(parsed)) {
        result = await q.importEntriesFromJson(batchId, parsed);
      } else {
        throw new Error('Định dạng JSON không hợp lệ.');
      }

      await get().refreshItems();
      set((s) => ({ dataVersion: s.dataVersion + 1 }));
      set({ importStatus: 'success', importResult: result });
      return result;
    } catch (e) {
      set({ importStatus: 'error', importResult: null });
      throw e;
    }
  },

  exportBackup: async () => {
    return q.exportDatabaseBackup();
  },

  restoreBackup: async (backupPayload) => {
    const res = await q.restoreDatabaseBackup(backupPayload);
    if (res && res.ok === false) return res;
    await get().init();
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
    return res;
  },

  setFilter: (v) => set({ activeFilter: v }),
  setStatusFilter: (v) => set({ activeStatusFilter: v }),
  setContainerFilter: (v) => set({ activeContainerFilter: v }),
  setSearchQuery: (v) => set({ searchQuery: v }),
  setHistoryGroup: (v) => set({ historyGroup: v, historyFilterValue: '' }),
  setHistoryFilterValue: (v) => set({ historyFilterValue: v }),
}));

export function pctClass(pct) {
  if (pct >= 100) return 'ok';
  if (pct >= 60) return 'mid';
  return 'low';
}

/**
 * Danh sách PO của đơn — mỗi thẻ mang **đúng một** PO nên không còn tách chuỗi `+`.
 *
 * FEAT-23 §sort: sắp xếp **tăng dần theo số**. `po` là số dạng chuỗi (`'2919'`) nên `localeCompare`
 * sẽ sai với các mã khác độ dài (`'60' > '500'` trong so sánh chuỗi). So sánh số trước, chỉ tới
 * `localeCompare` khi một trong hai không phải số — tránh sai với PO lẻ không mang số.
 */
export function allPOs(items) {
  return Array.from(new Set(items.flatMap(it => (it.po ? [it.po] : []))))
    .sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)));
}

export function filteredItems(state) {
  const needle = state.searchQuery.trim().toLowerCase();
  return state.items.filter(it => {
    const poOk = state.activeFilter === 'all' || it.po === state.activeFilter;
    const searchOk = needle === '' || it.ntk.toLowerCase().includes(needle);
    const isDone = it.target > 0 && it.produced >= it.target;
    const statusOk =
      state.activeStatusFilter === 'all' ||
      (state.activeStatusFilter === 'done' && isDone) ||
      (state.activeStatusFilter === 'incomplete' && !isDone);
    return poOk && searchOk && statusOk;
  });
}

export function summaryTotals(items) {
  const totalTarget = items.reduce((s, it) => s + it.target, 0);
  const totalProduced = items.reduce((s, it) => s + it.produced, 0);
  const totalDefect = items.reduce((s, it) => s + it.defect, 0);
  const overallPct = totalTarget ? Math.round((totalProduced / totalTarget) * 1000) / 10 : 0;
  return { totalTarget, totalProduced, totalDefect, overallPct };
}