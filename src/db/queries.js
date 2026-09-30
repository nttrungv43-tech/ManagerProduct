// src/db/queries.js
import { getDb, getActiveBatchId } from './index';
import { containersData, seedItems } from '@/data/seed';
import { checkQtyLimit } from '@/utils/validateQty';

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