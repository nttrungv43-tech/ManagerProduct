// src/db/migrations.js
// FEAT-10 — Cơ chế migration có đánh số phiên bản (quy tắc vàng #2).
// Xem specs/SPEC-data.md §10.2 và specs/features/FEAT-10-edit-items-pallets.md §4.2
//
// v1: baseline — chạy CREATE TABLE IF NOT EXISTS (giống hành vi cũ, an toàn cho DB đã có).
// v2: sửa `pallet_status`:
//     a) PK đúng: `(key, order_batch_id)`  — BUG-01 (ON CONFLICT(key) trước đây ghi đè batch cũ)
//     b) đổi khoá kiện nhiều loại từ chỉ số sang `ntk` — FEAT-10 Q1
//        `${cid}-${no}-${idx}`  →  `${cid}-${no}-${ntk}`
//        Việc đổi khoá cần đọc `container_data.data` bằng JS để ánh xạ nên migration
//        không còn thuần SQL. Batch chưa có `container_data` (đang dùng seed) sẽ được
//        vật chất hoá từ `containersData` với **cùng id** để không mất trạng thái tick.

import { CREATE_TABLES_SQL } from './schema';
import { containersData } from '@/data/seed';
import { remapPalletStatus } from '@/utils/palletKey';

export const MIGRATIONS = [
  {
    version: 1,
    up: async (db) => {
      await db.execAsync(CREATE_TABLES_SQL);
    },
  },
  {
    version: 2,
    up: async (db) => {
      // 1) Bảo đảm mọi batch đang dùng seed đều có cấu trúc container trong DB,
      //    để có thể ánh xạ khoá cũ → khoá mới một cách đầy đủ.
      const batchesWithStatus = await db.getAllAsync(
        `SELECT DISTINCT order_batch_id FROM pallet_status`
      );
      for (const row of batchesWithStatus) {
        const hasData = await db.getFirstAsync(
          `SELECT batch_id FROM container_data WHERE batch_id = ?`,
          [row.order_batch_id]
        );
        if (!hasData) {
          await db.runAsync(
            `INSERT OR IGNORE INTO container_data (batch_id, data, created_at) VALUES (?, ?, ?)`,
            [row.order_batch_id, JSON.stringify(containersData), new Date().toISOString().slice(0, 10)]
          );
        }
      }

      // 2) Gom trạng thái tick hiện tại theo từng batch.
      const statusRows = await db.getAllAsync(
        `SELECT key, order_batch_id, done FROM pallet_status`
      );
      const doneByBatch = new Map();
      statusRows.forEach(r => {
        if (!doneByBatch.has(r.order_batch_id)) doneByBatch.set(r.order_batch_id, {});
        doneByBatch.get(r.order_batch_id)[r.key] = !!r.done;
      });

      // 3) Ánh xạ khoá cũ → khoá mới cho từng batch có cấu trúc container.
      const converted = new Map();
      for (const [batchId, doneMap] of doneByBatch.entries()) {
        const dataRow = await db.getFirstAsync(
          `SELECT data FROM container_data WHERE batch_id = ?`,
          [batchId]
        );
        if (!dataRow || !dataRow.data) {
          converted.set(batchId, doneMap); // không có cấu trúc ⇒ giữ khoá cũ
          continue;
        }
        let containers;
        try {
          containers = JSON.parse(dataRow.data);
        } catch {
          converted.set(batchId, doneMap); // JSON hỏng ⇒ giữ nguyên, không mất dữ liệu
          continue;
        }
        // Cấu trúc không đổi, chỉ đổi định dạng khoá.
        converted.set(batchId, remapPalletStatus(containers, containers, doneMap));
      }

      // 4) Dựng lại bảng với PK đúng và khoá đã chuyển.
      await db.withTransactionAsync(async () => {
        // Đường lùi: giữ nguyên bản cũ (khoá theo chỉ số) trước khi DROP.
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS pallet_status_bak_v1 (
            key TEXT,
            order_batch_id INTEGER NOT NULL,
            done INTEGER DEFAULT 0
          );
          INSERT INTO pallet_status_bak_v1 (key, order_batch_id, done)
            SELECT key, order_batch_id, done FROM pallet_status
            WHERE NOT EXISTS (SELECT 1 FROM pallet_status_bak_v1);
        `);
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS pallet_status_new (
            key TEXT NOT NULL,
            order_batch_id INTEGER NOT NULL,
            done INTEGER DEFAULT 0,
            PRIMARY KEY (key, order_batch_id)
          );
        `);
        for (const [batchId, doneMap] of converted.entries()) {
          for (const [key, done] of Object.entries(doneMap)) {
            await db.runAsync(
              `INSERT OR REPLACE INTO pallet_status_new (key, order_batch_id, done) VALUES (?, ?, ?)`,
              [key, batchId, done ? 1 : 0]
            );
          }
        }
        await db.execAsync(`DROP TABLE pallet_status`);
        await db.execAsync(`ALTER TABLE pallet_status_new RENAME TO pallet_status`);
        await db.execAsync(
          `CREATE INDEX IF NOT EXISTS idx_pallet_batch ON pallet_status(order_batch_id)`
        );
      });
    },
  },
];

/** Chạy các migration còn thiếu, theo `PRAGMA user_version`. */
export async function runMigrations(db) {
  const row = await db.getFirstAsync('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      await m.up(db);
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    }
  }
}
