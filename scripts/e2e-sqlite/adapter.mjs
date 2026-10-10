// scripts/e2e-sqlite/adapter.mjs
// Nạp `expo-sqlite` bằng adapter trên `node:sqlite` — xem `register.mjs` để biết vì sao cần.
import { DatabaseSync } from 'node:sqlite';

function wrap(fileName) {
  const actual = process.env.EXPO_SQLITE_FILE || fileName;
  let raw;
  try {
    raw = new DatabaseSync(actual);
  } catch {
    throw new Error(`không mở được DB: ${actual}`);
  }
    let txLock = Promise.resolve();
    const db = {
      fileName,
      isOpen: true,
      log: [],
      async execAsync(sql) {
        db.log.push(String(sql));
        raw.exec(String(sql));
      },
      async getAllAsync(sql, params = []) {
        db.log.push(String(sql));
        return raw.prepare(String(sql)).all(...params);
      },
      async getFirstAsync(sql, params = []) {
        db.log.push(String(sql));
        return raw.prepare(String(sql)).get(...params) ?? null;
      },
      async runAsync(sql, params = []) {
        db.log.push(String(sql));
        const r = raw.prepare(String(sql)).run(...params);
        return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
      },
      async withTransactionAsync(fn) {
        const prev = txLock;
        let release;
        txLock = new Promise(r => { release = r; });
        await prev;
        raw.exec('BEGIN');
        try {
          await fn();
          raw.exec('COMMIT');
        } catch (e) {
          raw.exec('ROLLBACK');
          throw e;
        } finally {
          release();
        }
      },
      async closeAsync() {
        db.isOpen = false;
        raw.close();
      },
      /** Chỉ để test đọc, app không dùng. */
      _raw: raw,
    };
    return db;
}

export async function openDatabaseAsync(fileName) {
  return wrap(fileName);
}

export async function deleteDatabaseAsync(fileName) {
  const actual = process.env.EXPO_SQLITE_FILE || fileName;
  const { rmSync } = await import('node:fs');
  for (const suffix of ['', '-wal', '-shm']) {
    try { rmSync(actual + suffix); } catch { /* chưa tồn tại */ }
  }
  return true;
}

export default { openDatabaseAsync, deleteDatabaseAsync };
