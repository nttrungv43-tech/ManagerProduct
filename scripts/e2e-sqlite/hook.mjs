// scripts/e2e-sqlite/hook.mjs
// Nạp `expo-sqlite` bằng adapter trên `node:sqlite` — xem `register.mjs` để biết vì sao cần.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// `node:sqlite` chỉ có `prepare().all()/get()/run()` — bọc thành API promise của `expo-sqlite`.
// Không `await` trong tầng này: `expo-sqlite` cũng trả promise, và `getDb()` của app đã cache
// promise nên thứ tự thực thi vẫn đúng.
function wrap(fileName) {
  let raw;
  try {
    raw = new DatabaseSync(fileName === ':memory:' ? fileName : fileName);
  } catch {
    // `expo-sqlite` tự tạo file nếu chưa có; `node:sqlite` cũng vậy ⇒ không cần xử lý riêng.
    throw new Error(`không mở được DB: ${fileName}`);
  }
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
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
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
  const { rmSync } = await import('node:fs');
  for (const suffix of ['', '-wal', '-shm']) {
    try { rmSync(fileName + suffix); } catch { /* chưa tồn tại */ }
  }
  return true;
}

export default { openDatabaseAsync, deleteDatabaseAsync };
void fileURLToPath; void dirname; void join;