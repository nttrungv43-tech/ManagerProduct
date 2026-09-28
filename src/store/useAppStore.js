// src/store/useAppStore.js
import { create } from 'zustand';
import { getDb, getActiveBatchId } from '@/db';
import * as q from '@/db/queries';
import { containersData } from '@/data/seed';

export const useAppStore = create((set, get) => ({
  ready: false,
  batchId: null,
  items: [],
  palletDoneMap: {},
  archives: [],

  activeFilter: 'all',
  activeStatusFilter: 'all',
  activeContainerFilter: 'all',
  searchQuery: '',
  historyGroup: 'day',
  historyFilterValue: '',

  init: async () => {
    const db = await getDb();
    const batchId = await getActiveBatchId(db);
    const items = await q.fetchItemsWithStats(batchId);
    const palletDoneMap = await q.fetchPalletStatus(batchId);
    const archives = await q.fetchArchives();
    set({ ready: true, batchId, items, palletDoneMap, archives });
  },

  refreshItems: async () => {
    const { batchId } = get();
    const items = await q.fetchItemsWithStats(batchId);
    set({ items });
  },

  addEntry: async (ntk, payload) => {
    const { batchId } = get();
    await q.addEntry(batchId, ntk, payload);
    await get().refreshItems();
  },

  updateEntry: async (entryId, payload) => {
    await q.updateEntry(entryId, payload);
    await get().refreshItems();
  },

  removeEntry: async (entryId) => {
    await q.removeEntry(entryId);
    await get().refreshItems();
  },

  togglePallet: async (key, currentlyDone) => {
    const { batchId } = get();
    await q.setPalletStatus(batchId, key, !currentlyDone);
    const palletDoneMap = await q.fetchPalletStatus(batchId);
    set({ palletDoneMap });
  },

  finishOrder: async () => {
    const newBatchId = await q.finishOrder();
    const items = await q.fetchItemsWithStats(newBatchId);
    const archives = await q.fetchArchives();
    set({ batchId: newBatchId, items, palletDoneMap: {}, archives });
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

export function allPOs(items) {
  const s = new Set();
  items.forEach(it => it.po.split('+').forEach(p => s.add(p)));
  return [...s];
}

export function filteredItems(state) {
  const q_ = state.searchQuery.trim().toLowerCase();
  return state.items.filter(it => {
    const poOk = state.activeFilter === 'all' || it.po.split('+').includes(state.activeFilter);
    const searchOk = q_ === '' || it.ntk.toLowerCase().includes(q_);
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

export { containersData };