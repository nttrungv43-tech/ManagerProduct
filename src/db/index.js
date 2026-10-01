// src/db/index.js
import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES_SQL } from './schema';
import { runMigrations } from './migrations';
import { seedItems, containersData } from '@/data/seed';

let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync('production_tracker.db');
  await dbInstance.execAsync(CREATE_TABLES_SQL);
  await runMigrations(dbInstance);
  await ensureActiveBatch(dbInstance);
  return dbInstance;
}

async function ensureActiveBatch(db) {
  const existing = await db.getFirstAsync(
    `SELECT id FROM order_batches WHERE status = 'active' LIMIT 1`
  );
  if (existing) return existing.id;

  const result = await db.runAsync(
    `INSERT INTO order_batches (status, total_target, pallets_total) VALUES ('active', 0, ?)`,
    [containersData.reduce((s, c) => s + c.pallets.length, 0)]
  );
  const batchId = result.lastInsertRowId;

  let totalTarget = 0;
  for (const it of seedItems) {
    await db.runAsync(
      `INSERT INTO items (ntk, po, target, order_batch_id) VALUES (?, ?, ?, ?)`,
      [it.ntk, it.po, it.target, batchId]
    );
    totalTarget += it.target;
  }
  await db.runAsync(
    `UPDATE order_batches SET total_target = ? WHERE id = ?`,
    [totalTarget, batchId]
  );
  return batchId;
}

export async function getActiveBatchId(db) {
  const row = await db.getFirstAsync(
    `SELECT id FROM order_batches WHERE status = 'active' LIMIT 1`
  );
  return row?.id;
}