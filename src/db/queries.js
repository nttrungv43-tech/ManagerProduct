// src/db/queries.js
import { getDb, getActiveBatchId } from './index';
import { containersData, seedItems } from '@/data/seed';

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

export async function addEntry(batchId, ntk, { date, qty, line, defectQty, defectTypes }) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO entries (ntk, order_batch_id, date, qty, line, defect_qty, defect_types)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ntk, batchId, date, qty, line || 'manual', defectQty || 0, (defectTypes || []).join(',')]
  );
}

export async function updateEntry(entryId, { date, qty, line, defectQty, defectTypes }) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE entries SET date = ?, qty = ?, line = ?, defect_qty = ?, defect_types = ? WHERE id = ?`,
    [date, qty, line, defectQty || 0, (defectTypes || []).join(','), entryId]
  );
}

export async function removeEntry(entryId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM entries WHERE id = ?`, [entryId]);
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
     ON CONFLICT(key) DO UPDATE SET done = excluded.done`,
    [key, batchId, done ? 1 : 0]
  );
}

export function isPalletDone(cid, pallet, palletDoneMap) {
  if (pallet.items.length > 1) {
    return pallet.items.every((_, idx) => !!palletDoneMap[`${cid}-${pallet.no}-${idx}`]);
  }
  return !!palletDoneMap[`${cid}-${pallet.no}`];
}

export function countPalletsDone(palletDoneMap) {
  let done = 0, total = 0;
  containersData.forEach(c => {
    c.pallets.forEach(p => {
      total++;
      if (isPalletDone(c.id, p, palletDoneMap)) done++;
    });
  });
  return { done, total };
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
export async function finishOrder() {
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
  const { done, total } = countPalletsDone(palletMap);

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
      done, total, batchId,
    ]
  );

  const newBatch = await db.runAsync(
    `INSERT INTO order_batches (status, pallets_total) VALUES ('active', ?)`,
    [total]
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