// src/db/queries.js
import { getDb, getActiveBatchId } from './index';
import { containersData, seedItems } from '@/data/seed';
import { checkQtyLimit, parseQty } from '@/utils/validateQty';
import {
  palletKey, isMultiItemPallet, remapPalletStatus, recalcPalletTotals,
} from '@/utils/palletKey';

const NTK_RE = /^[0-9A-Za-z]+$/;

// ---------- ITEMS ----------

export async function fetchItemsWithStats(batchId) {
  const db = await getDb();
  const items = await db.getAllAsync(
    `SELECT ntk, po, target FROM items WHERE order_batch_id = ? ORDER BY ntk`,
    [batchId]
  );
  const stats = await db.getAllAsync(
    `SELECT ntk, SUM(qty) as produced, SUM(defect_qty) as defect
     FROM entries WHERE order_batch_id = ? GROUP BY ntk`,
    [batchId]
  );
  const statMap = {};
  stats.forEach(s => { statMap[s.ntk] = s; });
  return items.map(it => ({
    ...it,
    order_batch_id: batchId,
    produced: statMap[it.ntk]?.produced || 0,
    defect: statMap[it.ntk]?.defect || 0,
  }));
}

export async function fetchEntriesForItem(batchId, ntk) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM entries WHERE order_batch_id = ? AND ntk = ? ORDER BY id DESC`,
    [batchId, ntk]
  );
}

// ---------- ENTRIES: kiểm tra hạn mức đơn đặt hàng (FEAT-09, INV-V1) ----------

/**
 * Hạn mức (items.target) và số lượng đã sản xuất (SUM(entries.qty)) của một mã hàng.
 * `excludeEntryId`: bỏ qua dòng đang sửa để tính "đã làm" như thể nó chưa tồn tại.
 */
export async function getItemTargetUsage(batchId, ntk, excludeEntryId = null) {
  const db = await getDb();
  const item = await db.getFirstAsync(
    `SELECT target FROM items WHERE ntk = ? AND order_batch_id = ?`,
    [ntk, batchId]
  );
  const target = item?.target ?? 0;

  let sql = `SELECT COALESCE(SUM(qty), 0) as produced
             FROM entries WHERE ntk = ? AND order_batch_id = ?`;
  const params = [ntk, batchId];
  if (excludeEntryId !== null && excludeEntryId !== undefined) {
    sql += ` AND id != ?`;
    params.push(excludeEntryId);
  }
  const row = await db.getFirstAsync(sql, params);
  const produced = row?.produced || 0;
  const hasLimit = target > 0;
  return { target, produced, remaining: hasLimit ? Math.max(target - produced, 0) : 0, hasLimit };
}

export async function addEntry(batchId, ntk, { date, qty, line, defectQty, defectTypes }) {
  const db = await getDb();
  const usage = await getItemTargetUsage(batchId, ntk);
  const check = checkQtyLimit({ ...usage, incomingQty: qty });
  if (!check.ok) return { ok: false, error: check };

  await db.runAsync(
    `INSERT INTO entries (ntk, order_batch_id, date, qty, line, defect_qty, defect_types)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ntk, batchId, date, qty, line || 'manual', defectQty || 0, (defectTypes || []).join(',')]
  );
  return { ok: true };
}

export async function updateEntry(entryId, { date, qty, line, defectQty, defectTypes }) {
  const db = await getDb();
  const current = await db.getFirstAsync(
    `SELECT ntk, order_batch_id FROM entries WHERE id = ?`,
    [entryId]
  );
  if (!current) return { ok: false, error: { ok: false, code: 'ENTRY_NOT_FOUND' } };

  const usage = await getItemTargetUsage(current.order_batch_id, current.ntk, entryId);
  const check = checkQtyLimit({ ...usage, incomingQty: qty });
  if (!check.ok) return { ok: false, error: check };

  await db.runAsync(
    `UPDATE entries SET date = ?, qty = ?, line = ?, defect_qty = ?, defect_types = ? WHERE id = ?`,
    [date, qty, line || 'manual', defectQty || 0, (defectTypes || []).join(','), entryId]
  );
  return { ok: true };
}

export async function removeEntry(entryId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM entries WHERE id = ?`, [entryId]);
}

// ---------- ITEMS CRUD (FEAT-10) ----------

function normalizeNtk(raw) {
  if (typeof raw !== 'string') return null;
  const ntk = raw.trim();
  return NTK_RE.test(ntk) ? ntk : null;
}

async function recalcBatchTargetInTx(db, batchId) {
  const row = await db.getFirstAsync(
    `SELECT COALESCE(SUM(target), 0) as total FROM items WHERE order_batch_id = ?`,
    [batchId]
  );
  await db.runAsync(
    `UPDATE order_batches SET total_target = ? WHERE id = ?`,
    [row?.total || 0, batchId]
  );
}

export async function recalcBatchTarget(batchId) {
  const db = await getDb();
  await recalcBatchTargetInTx(db, batchId);
}

export async function addItem(batchId, { ntk, po, target }) {
  const db = await getDb();
  const code = normalizeNtk(ntk);
  if (!code) return { ok: false, error: { code: 'INVALID_NTK' } };
  const t = parseQty(target);
  if (t === null) return { ok: false, error: { code: 'INVALID_TARGET' } };

  const existing = await db.getFirstAsync(
    `SELECT ntk FROM items WHERE ntk = ? AND order_batch_id = ?`,
    [code, batchId]
  );
  if (existing) return { ok: false, error: { code: 'ITEM_EXISTS', ntk: code } };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO items (ntk, po, target, order_batch_id) VALUES (?, ?, ?, ?)`,
      [code, (po || '').trim(), t, batchId]
    );
    await recalcBatchTargetInTx(db, batchId);
  });
  return { ok: true };
}

export async function updateItem(batchId, ntk, { po, target }) {
  const db = await getDb();
  const code = normalizeNtk(ntk);
  if (!code) return { ok: false, error: { code: 'INVALID_NTK' } };

  const current = await db.getFirstAsync(
    `SELECT ntk, po, target FROM items WHERE ntk = ? AND order_batch_id = ?`,
    [code, batchId]
  );
  if (!current) return { ok: false, error: { code: 'ITEM_NOT_FOUND', ntk: code } };

  const newTarget = parseQty(target);
  if (newTarget === null) return { ok: false, error: { code: 'INVALID_TARGET' } };

  // Không cho hạ mức xuống dưới số đã sản xuất — bảo vệ INV-V1 của FEAT-09.
  if (newTarget > 0) {
    const produced = await db.getFirstAsync(
      `SELECT COALESCE(SUM(qty), 0) as produced FROM entries WHERE ntk = ? AND order_batch_id = ?`,
      [code, batchId]
    );
    const producedQty = produced?.produced || 0;
    if (newTarget < producedQty) {
      return { ok: false, error: { code: 'TARGET_BELOW_PRODUCED', ntk: code, target: newTarget, produced: producedQty } };
    }
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE items SET po = ?, target = ? WHERE ntk = ? AND order_batch_id = ?`,
      [(po || '').trim(), newTarget, code, batchId]
    );
    await recalcBatchTargetInTx(db, batchId);
  });
  return { ok: true };
}

export async function removeItem(batchId, ntk) {
  const db = await getDb();
  const code = normalizeNtk(ntk);
  if (!code) return { ok: false, error: { code: 'INVALID_NTK' } };

  const current = await db.getFirstAsync(
    `SELECT ntk FROM items WHERE ntk = ? AND order_batch_id = ?`,
    [code, batchId]
  );
  if (!current) return { ok: false, error: { code: 'ITEM_NOT_FOUND', ntk: code } };

  const produced = await db.getFirstAsync(
    `SELECT COALESCE(SUM(qty), 0) as produced FROM entries WHERE ntk = ? AND order_batch_id = ?`,
    [code, batchId]
  );
  const producedQty = produced?.produced || 0;
  if (producedQty > 0) {
    return { ok: false, error: { code: 'ITEM_HAS_ENTRIES', ntk: code, produced: producedQty } };
  }

  // INV-V2: mã hàng còn nằm trong kiện thì không được xoá.
  // Dùng đường đọc chỉ-để-kiểm-tra để không vô tình vật chất hoá seed vào DB.
  const containers = await fetchContainersView(batchId);
  const inPallets = countPalletsWithNtk(containers, code);
  if (inPallets > 0) {
    return { ok: false, error: { code: 'ITEM_IN_PALLETS', ntk: code, pallets: inPallets } };
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM items WHERE ntk = ? AND order_batch_id = ?`,
      [code, batchId]
    );
    await recalcBatchTargetInTx(db, batchId);
  });
  return { ok: true };
}

// ---------- PALLETS ----------

export async function fetchPalletStatus(batchId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT key, done FROM pallet_status WHERE order_batch_id = ?`,
    [batchId]
  );
  const map = {};
  rows.forEach(r => { map[r.key] = !!r.done; });
  return map;
}

export async function setPalletStatus(batchId, key, done) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO pallet_status (key, order_batch_id, done) VALUES (?, ?, ?)
     ON CONFLICT(key, order_batch_id) DO UPDATE SET done = excluded.done`,
    [key, batchId, done ? 1 : 0]
  );
}

export function isPalletDone(cid, pallet, palletDoneMap) {
  if (isMultiItemPallet(pallet)) {
    return pallet.items.every(it => !!palletDoneMap[palletKey(cid, pallet.no, it)]);
  }
  return !!palletDoneMap[palletKey(cid, pallet.no)];
}

export function countPalletsDone(palletDoneMap) {
  return countPalletsDoneWithData(palletDoneMap, containersData);
}

export function countPalletsDoneWithData(palletDoneMap, containers) {
  const data = containers || containersData;
  let done = 0, total = 0;
  data.forEach(c => {
    c.pallets.forEach(p => {
      total++;
      if (isPalletDone(c.id, p, palletDoneMap)) done++;
    });
  });
  return { done, total };
}

// ---------- PALLET CRUD (FEAT-10) ----------

function countPalletsWithNtk(containers, ntk) {
  let count = 0;
  (containers || []).forEach(c => {
    (c.pallets || []).forEach(p => {
      if ((p.items || []).some(it => it.ntk === ntk)) count++;
    });
  });
  return count;
}

async function writeContainerDataInTx(db, batchId, containers) {
  await db.runAsync(
    `INSERT OR REPLACE INTO container_data (batch_id, data, created_at) VALUES (?, ?, ?)`,
    [batchId, JSON.stringify(containers), new Date().toISOString().slice(0, 10)]
  );
  await db.runAsync(
    `UPDATE order_batches SET pallets_total = ? WHERE id = ?`,
    [recalcPalletTotals(containers).count, batchId]
  );
}

async function replacePalletStatusInTx(db, batchId, doneMap) {
  await db.runAsync(`DELETE FROM pallet_status WHERE order_batch_id = ?`, [batchId]);
  for (const [key, done] of Object.entries(doneMap)) {
    await db.runAsync(
      `INSERT OR REPLACE INTO pallet_status (key, order_batch_id, done) VALUES (?, ?, ?)`,
      [key, batchId, done ? 1 : 0]
    );
  }
}

/**
 * Vật chất hoá cấu trúc container từ seed vào DB (giữ nguyên `id` c1/c2/c3)
 * để các dòng `pallet_status` đang tồn tại không bị mất. AC-EDIT-22.
 */
export async function materializeContainers(batchId) {
  const db = await getDb();
  const hasData = await db.getFirstAsync(
    `SELECT batch_id FROM container_data WHERE batch_id = ?`,
    [batchId]
  );
  if (hasData) return false;
  await db.runAsync(
    `INSERT OR REPLACE INTO container_data (batch_id, data, created_at) VALUES (?, ?, ?)`,
    [batchId, JSON.stringify(containersData), new Date().toISOString().slice(0, 10)]
  );
  const { count } = recalcPalletTotals(containersData);
  await db.runAsync(
    `UPDATE order_batches SET pallets_total = ? WHERE id = ?`,
    [count, batchId]
  );
  return true;
}

/** Đọc cấu trúc container CHỈ ĐỂ KIỂM TRA — không ghi gì, fallback seed trong bộ nhớ. */
export async function fetchContainersView(batchId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT data FROM container_data WHERE batch_id = ?`,
    [batchId]
  );
  if (!row || !row.data) return containersData;
  try {
    const parsed = JSON.parse(row.data);
    return Array.isArray(parsed) ? parsed : containersData;
  } catch {
    return containersData;
  }
}

/** Đọc cấu trúc container để ghi. Tự vật chất hoá seed nếu batch chưa có. Ném lỗi nếu JSON hỏng. */
export async function getContainerDataForWrite(batchId) {
  const db = await getDb();
  let row = await db.getFirstAsync(
    `SELECT data FROM container_data WHERE batch_id = ?`,
    [batchId]
  );
  if (!row) {
    await materializeContainers(batchId);
    row = await db.getFirstAsync(
      `SELECT data FROM container_data WHERE batch_id = ?`,
      [batchId]
    );
  }
  if (!row || !row.data) throw new Error('Không đọc được cấu trúc container.');
  try {
    const parsed = JSON.parse(row.data);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    throw new Error('Dữ liệu container bị lỗi, không thể chỉnh sửa.');
  }
}

async function validatePalletItems(db, batchId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: { code: 'PALLET_EMPTY' } };
  }
  const seen = new Set();
  for (const it of items) {
    const ntk = normalizeNtk(it?.ntk);
    if (!ntk) return { ok: false, error: { code: 'INVALID_NTK' } };
    if (seen.has(ntk)) return { ok: false, error: { code: 'DUPLICATE_NTK', ntk } };
    seen.add(ntk);
    const qty = parseQty(it?.qty);
    if (qty === null || qty <= 0) return { ok: false, error: { code: 'INVALID_PALLET_QTY', ntk } };

    const row = await db.getFirstAsync(
      `SELECT ntk FROM items WHERE ntk = ? AND order_batch_id = ?`,
      [ntk, batchId]
    );
    if (!row) return { ok: false, error: { code: 'ITEM_NOT_IN_ORDER', ntk } };
  }
  return { ok: true };
}

function normalizePalletItems(items) {
  return items.map(it => ({ ntk: normalizeNtk(it.ntk), qty: parseQty(it.qty) }));
}

export async function addPallet(batchId, containerId, { no, items }) {
  const db = await getDb();
  const palletNo = parseQty(no);
  if (palletNo === null || palletNo <= 0) return { ok: false, error: { code: 'INVALID_PALLET_NO' } };

  const check = await validatePalletItems(db, batchId, items);
  if (!check.ok) return check;

  const containers = await getContainerDataForWrite(batchId);
  const container = (containers || []).find(c => c.id === containerId);
  if (!container) return { ok: false, error: { code: 'CONTAINER_NOT_FOUND' } };
  if ((container.pallets || []).some(p => p.no === palletNo)) {
    return { ok: false, error: { code: 'PALLET_EXISTS', no: palletNo } };
  }

  const nextContainers = containers.map(c => (
    c.id === containerId
      ? { ...c, pallets: [...(c.pallets || []), { no: palletNo, items: normalizePalletItems(items) }] }
      : c
  ));

  const doneMap = await fetchPalletStatus(batchId);
  const nextDone = remapPalletStatus(containers, nextContainers, doneMap);

  await db.withTransactionAsync(async () => {
    await writeContainerDataInTx(db, batchId, nextContainers);
    await replacePalletStatusInTx(db, batchId, nextDone);
  });
  return { ok: true, no: palletNo };
}

export async function updatePallet(batchId, containerId, palletNo, { no, items }) {
  const db = await getDb();
  const currentNo = parseQty(palletNo);
  if (currentNo === null || currentNo <= 0) return { ok: false, error: { code: 'INVALID_PALLET_NO' } };

  // Q4: v1 cấm đổi số hiệu kiện (sẽ phải di chuyển khoá pallet_status).
  const newNo = no === undefined || no === null ? currentNo : parseQty(no);
  if (newNo === null || newNo <= 0) return { ok: false, error: { code: 'INVALID_PALLET_NO' } };
  if (newNo !== currentNo) return { ok: false, error: { code: 'PALLET_NO_IMMUTABLE' } };

  const check = await validatePalletItems(db, batchId, items);
  if (!check.ok) return check;

  const containers = await getContainerDataForWrite(batchId);
  const container = (containers || []).find(c => c.id === containerId);
  if (!container) return { ok: false, error: { code: 'CONTAINER_NOT_FOUND' } };
  if (!(container.pallets || []).some(p => p.no === currentNo)) {
    return { ok: false, error: { code: 'PALLET_NOT_FOUND', no: currentNo } };
  }

  const nextContainers = containers.map(c => (
    c.id === containerId
      ? {
        ...c,
        pallets: (c.pallets || []).map(p => (
          p.no === currentNo ? { ...p, items: normalizePalletItems(items) } : p
        )),
      }
      : c
  ));

  const doneMap = await fetchPalletStatus(batchId);
  // INV-P1: di chuyển trạng thái tick sang khoá mới theo ntk.
  const nextDone = remapPalletStatus(containers, nextContainers, doneMap);

  await db.withTransactionAsync(async () => {
    await writeContainerDataInTx(db, batchId, nextContainers);
    await replacePalletStatusInTx(db, batchId, nextDone);
  });
  return { ok: true, no: currentNo };
}

export async function removePallet(batchId, containerId, palletNo) {
  const db = await getDb();
  const currentNo = parseQty(palletNo);
  if (currentNo === null || currentNo <= 0) return { ok: false, error: { code: 'INVALID_PALLET_NO' } };

  const containers = await getContainerDataForWrite(batchId);
  const container = (containers || []).find(c => c.id === containerId);
  if (!container) return { ok: false, error: { code: 'CONTAINER_NOT_FOUND' } };
  const pallet = (container.pallets || []).find(p => p.no === currentNo);
  if (!pallet) return { ok: false, error: { code: 'PALLET_NOT_FOUND', no: currentNo } };

  // AC-EDIT-20: giữ nguyên số hiệu các kiện còn lại, chỉ gỡ đúng kiện này.
  const nextContainers = containers.map(c => (
    c.id === containerId
      ? { ...c, pallets: (c.pallets || []).filter(p => p.no !== currentNo) }
      : c
  ));

  const doneMap = await fetchPalletStatus(batchId);
  const nextDone = remapPalletStatus(containers, nextContainers, doneMap);

  await db.withTransactionAsync(async () => {
    await writeContainerDataInTx(db, batchId, nextContainers);
    await replacePalletStatusInTx(db, batchId, nextDone);
  });
  return { ok: true, no: currentNo };
}

// ---------- HISTORY ----------

export async function fetchHistoryGrouped(groupBy, filterValue) {
  const db = await getDb();
  let keyExpr;
  if (groupBy === 'month') keyExpr = `substr(date, 1, 7)`;
  else if (groupBy === 'year') keyExpr = `substr(date, 1, 4)`;
  else keyExpr = `date`;

  let sql = `
    SELECT ${keyExpr} as groupKey,
           SUM(qty) as total,
           SUM(CASE WHEN line = 'manual' THEN qty ELSE 0 END) as manualTotal,
           SUM(CASE WHEN line = 'auto' THEN qty ELSE 0 END) as autoTotal,
           SUM(defect_qty) as defectTotal
    FROM entries
  `;
  const params = [];
  if (filterValue) {
    sql += ` WHERE ${keyExpr} = ?`;
    params.push(filterValue);
  }
  sql += ` GROUP BY groupKey ORDER BY groupKey DESC`;
  return db.getAllAsync(sql, params);
}

export async function fetchHistoryDetail(groupBy, groupKey) {
  const db = await getDb();
  if (groupBy === 'day') {
    return db.getAllAsync(
      `SELECT id, ntk, date, qty, line, defect_qty, defect_types, order_batch_id
       FROM entries WHERE date = ? ORDER BY id DESC`,
      [groupKey]
    );
  }
  const keyExpr = groupBy === 'month' ? `substr(date,1,7)` : `substr(date,1,4)`;
  return db.getAllAsync(
    `SELECT ntk, SUM(qty) as qty, SUM(defect_qty) as defect_qty
     FROM entries WHERE ${keyExpr} = ? GROUP BY ntk ORDER BY ntk`,
    [groupKey]
  );
}

export async function fetchAvailableYears() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT DISTINCT substr(date,1,4) as y FROM entries ORDER BY y DESC`
  );
  return rows.map(r => r.y);
}

// ---------- ARCHIVES ----------

export async function fetchArchives() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM order_batches WHERE status = 'archived' ORDER BY id DESC`
  );
}

export async function fetchArchiveItems(batchId) {
  const db = await getDb();
  const items = await db.getAllAsync(
    `SELECT ntk, target FROM items WHERE order_batch_id = ?`, [batchId]
  );
  const stats = await db.getAllAsync(
    `SELECT ntk, SUM(qty) as produced, SUM(defect_qty) as defect
     FROM entries WHERE order_batch_id = ? GROUP BY ntk`, [batchId]
  );
  const statMap = {};
  stats.forEach(s => { statMap[s.ntk] = s; });
  return items.map(it => ({
    ...it,
    produced: statMap[it.ntk]?.produced || 0,
    defect: statMap[it.ntk]?.defect || 0,
  }));
}

// "Hoàn tất đơn hàng": chỉ đổi trạng thái batch, KHÔNG copy dữ liệu.
export async function finishOrder(containers) {
  const db = await getDb();
  const batchId = await getActiveBatchId(db);

  const totals = await db.getFirstAsync(
    `SELECT SUM(qty) as produced, SUM(defect_qty) as defect
     FROM entries WHERE order_batch_id = ?`, [batchId]
  );
  const targetRow = await db.getFirstAsync(
    `SELECT SUM(target) as target FROM items WHERE order_batch_id = ?`, [batchId]
  );
  const palletMap = await fetchPalletStatus(batchId);
  const { done: donePallets, total: totalPallets } = countPalletsDoneWithData(palletMap, containers);

  await db.runAsync(
    `UPDATE order_batches
     SET status='archived', finished_date=?, total_target=?, total_produced=?, total_defect=?,
         pallets_done=?, pallets_total=?
     WHERE id=?`,
    [
      new Date().toISOString().slice(0, 10),
      targetRow?.target || 0,
      totals?.produced || 0,
      totals?.defect || 0,
      donePallets, totalPallets, batchId,
    ]
  );

  const seedTotal = containersData.reduce((s, c) => s + c.pallets.length, 0);
  const newBatch = await db.runAsync(
    `INSERT INTO order_batches (status, pallets_total) VALUES ('active', ?)`,
    [seedTotal]
  );
  const newBatchId = newBatch.lastInsertRowId;
  let newTarget = 0;
  for (const it of seedItems) {
    await db.runAsync(
      `INSERT INTO items (ntk, po, target, order_batch_id) VALUES (?, ?, ?, ?)`,
      [it.ntk, it.po, it.target, newBatchId]
    );
    newTarget += it.target;
  }
  await db.runAsync(`UPDATE order_batches SET total_target=? WHERE id=?`, [newTarget, newBatchId]);

  return newBatchId;
}

// ---------- IMPORT ----------

export async function importEntriesFromJson(batchId, entries) {
  const db = await getDb();
  let imported = 0;
  let skipped = 0;
  let skippedOver = 0;

  await db.withTransactionAsync(async () => {
    // FEAT-09: hạn mức + số lượng đã có, nạp 1 lần để kiểm tra tích luỹ trong transaction.
    // Dùng Map: ntk từ file JSON không kiểm soát được, tránh trùng key của Object.prototype.
    const usageMap = new Map();
    const targetRows = await db.getAllAsync(
      `SELECT ntk, target FROM items WHERE order_batch_id = ?`, [batchId]
    );
    targetRows.forEach(r => usageMap.set(r.ntk, { target: r.target, produced: 0, hasLimit: r.target > 0 }));
    const producedRows = await db.getAllAsync(
      `SELECT ntk, COALESCE(SUM(qty), 0) as produced
       FROM entries WHERE order_batch_id = ? GROUP BY ntk`, [batchId]
    );
    producedRows.forEach(r => {
      const u = usageMap.get(r.ntk);
      if (u) u.produced = r.produced;
    });

    for (const entry of entries) {
      const { ntk, date, qty, line, defectQty, defectTypes } = entry;
      const q = parseFloat(qty) || 0;
      const dq = parseFloat(defectQty) || 0;

      if (q <= 0 && dq <= 0) {
        skipped++;
        continue;
      }

      const usage = usageMap.get(ntk);
      if (!usage) {
        skipped++;
        continue;
      }

      const check = checkQtyLimit({ ...usage, incomingQty: q });
      if (!check.ok) {
        skippedOver++;
        continue;
      }
      usage.produced = usage.produced + q;

      await db.runAsync(
        `INSERT INTO entries (ntk, order_batch_id, date, qty, line, defect_qty, defect_types)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ntk, batchId, date, q, line || 'manual', dq, (defectTypes || []).join(',')]
      );
      imported++;
    }
  });

  return { imported, skipped, skippedOver };
}

// ---------- IMPORT PACKING LIST ----------

export async function importItemsFromJson(batchId, jsonData) {
  const db = await getDb();
  const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

  let summaryKey = '\u7e3d\u8868';
  let summaryData = data[summaryKey];
  if (!Array.isArray(summaryData)) {
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        summaryData = data[key];
        summaryKey = key;
        break;
      }
    }
  }
  if (!Array.isArray(summaryData)) {
    throw new Error('Không tìm thấy dữ liệu sản phẩm trong file JSON.');
  }

  const itemsMap = {};
  let po = null;

  for (const row of summaryData) {
    if (!row || typeof row !== 'object') continue;
    const ntk = row.Column4;
    const qty = row.Column6;
    const col10 = row.Column10;

    if (ntk && typeof ntk === 'string' && /^[0-9A-Za-z]+$/.test(ntk)
        && qty !== undefined && typeof qty === 'number' && qty > 0) {
      if (!itemsMap[ntk]) {
        itemsMap[ntk] = { qty: 0 };
      }
      itemsMap[ntk].qty += qty;
    }
    if (col10 !== undefined && typeof col10 === 'number' && po === null) {
      po = String(col10);
    }
  }

  const count = Object.keys(itemsMap).length;
  if (count === 0) {
    throw new Error('Không tìm thấy mã hàng nào trong file JSON.');
  }

  let imported = 0;
  await db.withTransactionAsync(async () => {
    for (const ntk of Object.keys(itemsMap)) {
      await db.runAsync(
        `INSERT OR REPLACE INTO items (ntk, po, target, order_batch_id) VALUES (?, ?, ?, ?)`,
        [ntk, po || '', itemsMap[ntk].qty, batchId]
      );
      imported++;
    }
    const total = await db.getFirstAsync(
      `SELECT SUM(target) as total FROM items WHERE order_batch_id = ?`,
      [batchId]
    );
    await db.runAsync(
      `UPDATE order_batches SET total_target = ? WHERE id = ?`,
      [total?.total || 0, batchId]
    );
  });

  return { imported, totalItems: count };
}

// ---------- CONTAINER DATA ----------

export async function fetchContainerData(batchId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT data FROM container_data WHERE batch_id = ?`,
    [batchId]
  );
  if (!row || !row.data) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

function parsePackingListContainers(data) {
  const dataObj = typeof data === 'string' ? JSON.parse(data) : data;

  const summaryKey = '\u7e3d\u8868';
  const summaryData = dataObj[summaryKey];

  const palletItems = {};
  let po = null;

  if (Array.isArray(summaryData)) {
    for (const row of summaryData) {
      if (!row || typeof row !== 'object') continue;
      const palletNo = row.Column2;
      const ntk = row.Column4;
      const qty = row.Column6;
      const col10 = row.Column10;

      if (palletNo !== undefined && typeof palletNo === 'number' &&
          ntk && typeof ntk === 'string' && /^[0-9A-Za-z]+$/.test(ntk) &&
          qty !== undefined && typeof qty === 'number' && qty > 0) {
        if (!palletItems[palletNo]) palletItems[palletNo] = [];
        palletItems[palletNo].push({ ntk, qty });
      }
      if (col10 !== undefined && typeof col10 === 'number' && po === null) {
        po = String(col10);
      }
    }
  }

  const containerKeys = Object.keys(dataObj).filter(
    k => k !== summaryKey && Array.isArray(dataObj[k])
  );

  const containers = [];
  for (const ckey of containerKeys) {
    const containerRows = dataObj[ckey];
    let palletRange = null;

    for (const row of containerRows) {
      if (!row || typeof row !== 'object') continue;
      const col1 = row.Column1;
      if (col1 && typeof col1 === 'string' && col1.includes('Pallet')) {
        const match = col1.match(/Pallet\s+(\d+)-(\d+)/);
        if (match) {
          palletRange = { start: parseInt(match[1]), end: parseInt(match[2]) };
        }
      }
    }

    if (palletRange) {
      const pallets = [];
      for (let p = palletRange.start; p <= palletRange.end; p++) {
        const items = palletItems[p] || [];
        if (items.length > 0) {
          pallets.push({ no: p, items });
        }
      }
      if (pallets.length > 0) {
        containers.push({
          id: ckey,
          label: `Container ${containers.length + 1}`,
          po: po || '',
          pallets
        });
      }
    }
  }

  return containers;
}

export async function importContainerData(batchId, jsonData) {
  const db = await getDb();
  const containers = parsePackingListContainers(jsonData);

  if (containers.length === 0) {
    throw new Error('Không tìm thấy dữ liệu container trong file JSON.');
  }

  const palletsTotal = containers.reduce((s, c) => s + c.pallets.length, 0);
  const now = new Date().toISOString().slice(0, 10);
  const containerJson = JSON.stringify(containers);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO container_data (batch_id, data, created_at) VALUES (?, ?, ?)`,
      [batchId, containerJson, now]
    );
    await db.runAsync(
      `UPDATE order_batches SET pallets_total = ? WHERE id = ?`,
      [palletsTotal, batchId]
    );
  });

  return { containers: containers.length, pallets: palletsTotal };
}