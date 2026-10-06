// scripts/db-init-e2e/expo-sqlite-stub.mjs
// Bản sao tối giản của `expo-sqlite` cho E2E tầng khởi tạo DB (BUGFIX-08).
//
// Mục tiêu: **tái hiện đúng lỗi `no such column: nw_kg`** trên file DB đã bị đóng dấu
// `user_version = 3` từ bản build cũ. Vì vậy stub có một luật quan trọng:
//
//   Thực thi `SELECT`/`WHERE` có nhắc tới cột đang theo dõi (`nw_kg`, `gw_kg`,
//   `volume_cbm`, `package_count`) mà bảng `items` **chưa** có cột đó ⇒ ném
//   `Error: no such column: <tên>` — giống hệt SQLite.
//
// ⚠️ Giới hạn: stub **không** phải SQLite thật. Nó chỉ mô phỏng đúng những gì tầng khởi tạo
// (`getDb` → `CREATE TABLE` → `runMigrations` → guard → `ensureActiveBatch` → `fetchItemsWithStats`)
// và `SELECT` đầu tiên của màn hình. Mọi câu lạ đều trả mảng rỗng, không phải kết quả tính đúng.

/** Cột của `items` do migration v1 tạo ra — tức DB được tạo **trước** FEAT-17. */
const V1_ITEM_COLUMNS = ['ntk', 'po', 'target', 'order_batch_id'];

/** Cột của `entries` do migration v1 tạo ra — tức DB được tạo **trước** FEAT-20 (chưa có `po`). */
const V1_ENTRY_COLUMNS = [
  'id', 'ntk', 'order_batch_id', 'date', 'qty', 'line', 'defect_qty', 'defect_types',
];

/** Cột FEAT-17 (migration v3). Stub dùng danh sách này để kiểm tra `SELECT`. */
const METRIC_COLUMNS = ['nw_kg', 'gw_kg', 'volume_cbm', 'package_count'];

/**
 * BUGFIX-23 — cột **đầy đủ** của từng bảng trong thiết kế mới (FEAT-21+), dùng để mô phỏng
 * file DB của một build **trung gian**: đúng *tên bảng* nhưng thiếu *cột*.
 *
 * Nhân vật chính của lỗi `no such column: order_line_id` (2026-10-05): `isLegacyDb()` cũ chỉ
 * nhìn tên bảng nên cho file đó là "đúng schema", `CREATE TABLE IF NOT EXISTS` thành no-op, rồi
 * `CREATE INDEX … (order_line_id)` nổ. Stub phải **ném đúng lỗi đó** thì test mới có tác dụng.
 */
const NEW_DESIGN_COLUMNS = {
  order_batches: ['id', 'status', 'finished_date', 'source_file', 'mark', 'imported_at'],
  pos: ['id', 'order_batch_id', 'code', 'consignee', 'address', 'destination', 'invoice_no'],
  order_lines: ['id', 'po_id', 'item_code', 'target', 'nw_kg', 'gw_kg', 'volume_cbm', 'package_count'],
  item_refs: ['id', 'order_batch_id', 'item_code', 'ref_no'],
  order_line_refs: ['order_line_id', 'ref_no', 'target'],
  production_entries: ['id', 'order_line_id', 'date', 'qty', 'line', 'defect_qty'],
  production_defects: ['entry_id', 'type'],
  production_entry_refs: ['entry_id', 'order_line_id', 'ref_no'],
  containers: ['id', 'order_batch_id', 'po_id', 'container_no', 'seal_no'],
  pallets: [
    'id', 'container_id', 'po_id', 'pallet_no', 'c_no', 'is_mixed',
    'length_m', 'width_m', 'height_m', 'volume_cbm', 'nw_kg', 'gw_kg',
  ],
  pallet_lines: ['id', 'pallet_id', 'order_line_id', 'qty', 'done'],
};

/** Tên file DB đang giả lập — nhiều kịch bản E2E chạy song song cần tách instance. */
let targetFile = null;
/** Đếm số lần `openDatabaseAsync` của từng file. */
export const openCounts = new Map();

/**
 * Chuẩn bị instance DB giả cho đúng tên file và trạng thái ban đầu.
 * Phải gọi **trước** khi import app (module `src/db/index.js` mở DB ngay khi `getDb()` chạy).
 *
 * @param {string} fileName
 * @param {{
 *   tables?: string[],          // FEAT-21: các bảng ĐANG CÓ trong file (mô phỏng sqlite_master)
 *   tables?: string[],          // FEAT-21: các bảng ĐANG CÓ trong file (mô phỏng sqlite_master)
 *   userVersion?: number,
 *   itemColumns?: string[],
 *   entryColumns?: string[],     // FEAT-20: mặc định cột của `entries` trước khi thêm `po`
 *   columnSets?: Record<string, string[]>, // BUGFIX-23: cột của từng bảng (mô phỏng build trung gian)
 *   activeBatchIds?: number[],
 *   failAlter?: 'all' | string,   // cột (hoặc 'all') mà `ALTER TABLE … ADD COLUMN` phải hỏng
 * }} [initial]
 */
export function useFakeDatabase(fileName, initial = {}) {
  targetFile = fileName;
  state.initial = initial;
  state.tables = new Set(initial.tables ?? []);
  deleteLog.length = 0;
}

/**
 * FEAT-21: `src/db/index.js` nhận diện "DB thiết kế cũ" bằng cách đọc `sqlite_master` (không so
 * `user_version` — đó là nguồn gốc của BUG-08). Stub phải mô phỏng được điều đó, nếu không kịch bản
 * reset sẽ pass một cách giả và không bắt được lỗi "xoá file DB đang mở".
 */
const deleteLog = [];

function createFakeDb(fileName, initial) {
  const items = new Set(initial.itemColumns ?? V1_ITEM_COLUMNS);
  // FEAT-20: `entries` cũng cần bộ cột riêng — migration v5 thêm `po`, stub phải biết để
  // `PRAGMA table_info(entries)` trả đúng và để `ALTER TABLE entries …` có hiệu lực.
  const entries = new Set(initial.entryColumns ?? V1_ENTRY_COLUMNS);
  // BUGFIX-23: bảng của thiết kế mới. `initial.columnSets` cho phép kịch bản mô phỏng DB của
  // build trung gian (thiếu `order_line_id`…) — mặc định thì đủ cột.
  const columnSets = { entries, items };
  for (const [table, cols] of Object.entries(NEW_DESIGN_COLUMNS)) {
    columnSets[table] = new Set(cols);
  }
  for (const [table, cols] of Object.entries(initial.columnSets ?? {})) {
    columnSets[table] = new Set(cols);
  }
  /** Cột của bảng, hoặc `null` nếu stub không theo dõi bảng đó. */
  const columnsOf = table => columnSets[table] ?? null;
  const userVersion = { value: initial.userVersion ?? 0 };
  const activeBatches = [...(initial.activeBatchIds ?? [])];

  /**
   * Tách tên cột từ thân `CREATE TABLE (...)`. Cần để bảng **mới tạo** có đúng bộ cột khai báo,
   * và để `CREATE TABLE IF NOT EXISTS` trên bảng đã có là **no-op** đúng như SQLite.
   */
  const parseCreateColumns = q => {
    const body = /\(([\s\S]*)\)\s*$/.exec(q)?.[1] ?? '';
    const cols = [];
    for (const line of body.split('\n')) {
      const m = /^\s{2}([a-z_]\w*)\s+[A-Z]/.exec(line);
      if (m) cols.push(m[1]);
    }
    return cols;
  };

  const db = {
    fileName,
    /** Nhật ký mọi câu SQL đã thực thi, theo đúng thứ tự. */
    log: [],

    /** SQLite ném lỗi khi câu SQL tham chiếu cột không tồn tại — luật cốt lõi của stub. */
    _assertColumns(sql) {
      if (!/\bitems\b/.test(sql)) return;
      for (const col of METRIC_COLUMNS) {
        if (new RegExp(`\\b${col}\\b`).test(sql) && !items.has(col)) {
          const e = new Error(`no such column: ${col}`);
          e.code = 'SQLITE_ERROR';
          throw e;
        }
      }
    },

    /**
     * BUGFIX-23 — `CREATE INDEX … ON <bảng>(<cột>…)` phải **ném** `no such column` khi bảng đó
     * thiếu cột. Đây chính xác là lỗi gặp thật trên thiết bị: `CREATE TABLE IF NOT EXISTS`
     * no-op vì bảng đã tồn tại (do build trung gian tạo) nhưng thiếu `order_line_id`.
     */
    _assertIndexColumns(q) {
      const m = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+\s+ON\s+(\w+)\s*\(([^)]*)\)/i.exec(q);
      if (!m) return;
      const cols = columnsOf(m[1]);
      if (!cols) return; // bảng stub không theo dõi ⇒ không giả vờ thành công cũng không giả vờ hỏng
      for (const col of m[2].split(',').map(s => s.trim().split(/\s+/)[0])) {
        if (!cols.has(col)) {
          const e = new Error(`no such column: ${col}`);
          e.code = 'SQLITE_ERROR';
          throw e;
        }
      }
    },

    async execAsync(sql) {
      for (const stmt of String(sql).split(';')) {
        const q = stmt.trim();
        if (!q) continue;
        db.log.push(q);

        let m;
        // Tổng quát hoá theo bảng: `ALTER TABLE items|entries … ADD COLUMN` đều phải có hiệu
        // lực, nếu không `ensureColumnsFor` xác minh lại bằng `PRAGMA` sẽ luôn thấy thiếu cột.
        if ((m = /^ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)\s+(\w+)/i.exec(q))) {
          const cols = columnsOf(m[1]);
          if (!cols) continue; // bảng stub không theo dõi ⇒ bỏ qua, không giả vờ thành công
          if (cols.has(m[2])) throw new Error(`duplicate column name: ${m[2]}`);
          // `failAlter: 'nw_kg' | 'entries.po' | 'all'` để mô phỏng "vá hỏng" (AC-DB-09).
          const tag = `${m[1]}.${m[2]}`;
          if (initial.failAlter === 'all' || initial.failAlter === m[2] || initial.failAlter === tag) {
            throw new Error('database is locked');
          }
          cols.add(m[2]);
          continue;
        }
        if ((m = /^PRAGMA\s+user_version\s*=\s*(\d+)/i.exec(q))) {
          userVersion.value = Number(m[1]);
          continue;
        }
        // BUGFIX-23: `CREATE INDEX` có thể hỏng vì thiếu cột — phải ném trước khi ta cảnh báo.
        if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(q)) db._assertIndexColumns(q);
        // FEAT-21: ghi nhận bảng mới tạo để lần đọc `sqlite_master` sau trả về đúng.
        if ((m = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i.exec(q))) {
          const existed = state.tables?.has(m[1]);
          state.tables = state.tables ?? new Set();
          state.tables.add(m[1]);
          // Bảng **đã có** ⇒ `IF NOT EXISTS` là no-op: giữ nguyên bộ cột thiếu (đây chính là
          // cách lỗi `no such column` lọt qua trước BUGFIX-23). Bảng mới ⇒ lấy đúng cột khai báo.
          if (!existed) {
            const cols = parseCreateColumns(q);
            if (cols.length) columnSets[m[1]] = new Set(cols);
          }
        }
        // `DROP` / `INSERT …` …: không ảnh hưởng bộ cột theo dõi.
      }
    },

    async getAllAsync(sql) {
      db.log.push(String(sql).trim());
      db._assertColumns(sql);

      let m;
      // FEAT-21: `sqlite_master` để `isLegacyDb()` nhận diện DB cũ.
      if (/sqlite_master/i.test(sql)) {
        let names = [...(state.tables ?? [])];
        // ⚠️ BUGFIX-23: stub **phải** tôn trọng `WHERE … name IN (…)`. Trước đây nó trả về **mọi**
        // bảng bất kể `WHERE`, nên `legacyReason()` lấy danh sách đã lọc mà vẫn "thấy" được
        // `pallet_lines` ⇒ vòng kiểm cột chạy đúng ⇒ **test xanh giả**, trong khi app thật thì
        // `pallet_lines` không có trong danh sách ⇒ vòng kiểm cột bị bỏ qua ⇒ vẫn lỗi
        // `no such column` trên máy. Giả lập thiếu chính xác làm cho lỗi đó lọt vào test.
        const inList = /name\s+IN\s*\(([^)]*)\)/i.exec(sql);
        if (inList) {
          const allowed = new Set(inList[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')));
          names = names.filter(n => allowed.has(n));
        }
        return names.map(name => ({ name, type: 'table' }));
      }
      if (/PRAGMA\s+foreign_keys/i.test(sql)) return [{ foreign_keys: 1 }];
      if (/PRAGMA\s+user_version/i.test(sql)) return [{ user_version: userVersion.value }];
      if ((m = /^PRAGMA\s+table_info\(\s*(\w+)\s*\)/i.exec(String(sql).trim()))) {
        const cols = columnsOf(m[1]);
        return cols ? [...cols].map(name => ({ name })) : [];
      }
      if (/FROM\s+order_batches/i.test(sql)) {
        return activeBatches.map(id => ({ id, status: 'active' }));
      }
      // `pallet_status` / `container_data` / `entries`: rỗng trong DB giả này.
      if (/FROM\s+entries/i.test(sql)) return [];
      return [];
    },

    async getFirstAsync(sql) {
      const rows = await db.getAllAsync(sql);
      return rows[0] ?? null;
    },

    async runAsync(sql, params = []) {
      db.log.push(String(sql).trim());
      if (/INSERT\s+INTO\s+order_batches/i.test(sql)) {
        const id = activeBatches.length ? Math.max(...activeBatches) + 1 : 1;
        activeBatches.push(id);
        return { lastInsertRowId: id, changes: 1 };
      }
      return { lastInsertRowId: 0, changes: 1 };
    },

    async withTransactionAsync(fn) {
      await fn();
    },

    /** FEAT-21 — SQLite giữ khoá file; xoá file khi connection còn mở sẽ ném lỗi. */
    async closeAsync() {
      db.isOpen = false;
      db.log.push('CLOSE');
    },
  };
  db.isOpen = true;
  return db;
}

/** Kết quả thực thi của kịch bản gần nhất (do test đọc). */
export const state = {
  /** Instance cuối cùng được `openDatabaseAsync` trả về. */
  lastDb: null,
  /** Tập bảng đang tồn tại trong file giả — `src/db/index.js` đọc để nhận diện DB thiết kế cũ. */
  tables: new Set(),
};

/** Danh sách file đã bị xoá (FEAT-21) — test dùng để chứng minh đã gọi `deleteDatabaseAsync`. */
export const deletes = deleteLog;

export async function openDatabaseAsync(fileName) {
  if (targetFile && fileName !== targetFile) {
    throw new Error(
      `Stub chỉ phục vụ "${targetFile}", nhưng app mở "${fileName}". ` +
        `Gọi useFakeDatabase() TRƯỚC khi import app.`
    );
  }
  openCounts.set(fileName, (openCounts.get(fileName) ?? 0) + 1);

  const db = createFakeDb(fileName, state.initial ?? {});
  state.lastDb = db;
  // App giữ instance trong closure `dbReady`, test không tự tạo ⇒ export sẵn để test đọc log.
  return db;
}

/**
 * FEAT-21 — Xoá file DB. **Bắt đúng lỗi thật** (gặp trên máy 2026-10-04): `expo-sqlite` ném
 * `Unable to delete database … that is currently open` nếu chưa `closeAsync()`.
 * Stub mô phỏng điều đó để test bắt được trường hợp quên đóng connection.
 */
export async function deleteDatabaseAsync(fileName) {
  const db = state.lastDb;
  if (db && db.isOpen && db.fileName === fileName) {
    const e = new Error(
      `Unable to delete database '${fileName}' that is currently open. Close it prior to deletion.`
    );
    e.code = 'ERR_SQLITE';
    throw e;
  }
  deleteLog.push(fileName);
  state.tables = new Set();
  return true;
}

export default {
  openDatabaseAsync,
  deleteDatabaseAsync,
  useFakeDatabase,
  openCounts,
  state,
};