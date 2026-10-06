// src/db/index.js
// FEAT-21 — Khởi tạo DB theo thiết kế mới (xem specs/PLAN-db-redesign.md).
//
// ============================================================================
// VÌ SAO KHÔNG CÒN `runMigrations` / `schemaColumns` / `ensureItemMetricColumns`
// ============================================================================
// Bản cũ có 5 migration vá dần: v2 dựng lại `pallet_status` (91 dòng, do BUG-01), v3 thêm 4 cột
// `items`, v4 tạo `item_po`, v5 thêm `entries.po`; thêm một `guard` đọc `PRAGMA table_info` phía
// sau vì `user_version` từng lệch với schema thật (BUG-08).
//
// Thiết kế mới **không cần migration**: chủ dự án chọn (2026-10-04) **xoá sạch** dữ liệu cũ thay
// vì viết script chuyển. Nên chỉ còn **một** schema, một `user_version`, không lệch bao giờ ⇒ hết
// luôn lớp guard và hết trường hợp "app không khởi động vì `no such column`".
//
// Cơ chế: nhận diện DB cũ (có `item_po` / `container_data`, hoặc thiếu `order_lines`) ⇒ **xoá file**
// rồi tạo lại. Xoá file thay vì `DROP TABLE` vì bản cũ có bảng/index không còn dùng tới và để sót
// lại sẽ làm DB phình to vô nghĩa. `deleteDatabaseAsync` có sẵn trong `expo-sqlite` 57.
import * as SQLite from 'expo-sqlite';
import {
  DB_FILE, SCHEMA_VERSION, CREATE_TABLES_SQL, CREATE_VIEWS_SQL, enableForeignKeys,
  REQUIRED_COLUMNS, ADDABLE_COLUMN_DECLS,
} from './schema';
import { todayLocal } from '@/utils/date';

// BUGFIX-08: cache **promise** khởi tạo, KHÔNG cache instance đã mở. Mọi lời gọi `getDb()` — kể cả
// chạy song song — đều phải chờ tới khi schema sẵn sàng, không ai query vào DB chưa tạo xong.
let dbReady = null;

/**
 * Mở (hoặc tạo mới) DB và bảo đảm schema đúng.
 *
 * Thứ tự có chủ đích: **mở file → xem schema → nếu là DB cũ thì xoá và mở lại → tạo schema**.
 * Không tạo schema trước rồi mới kiểm, vì khi đó DB cũ đã bị `CREATE TABLE IF NOT EXISTS` thêm bảng
 * mới vào bên cạnh bảng cũ ⇒ dữ liệu lẫn hai mô hình.
 */
export async function getDb() {
  if (!dbReady) {
    dbReady = (async () => {
      let db = await SQLite.openDatabaseAsync(DB_FILE);
      const reason = await legacyReason(db);
      if (reason) {
        // ⚠️ PHẢI `closeAsync()` trước khi xoá. SQLite giữ khoá file, và `deleteDatabaseAsync`
        // ném `Unable to delete database … that is currently open` nếu connection còn sống
        // (lỗi gặp thật khi chạy trên máy, 2026-10-04). Không đóng thì app **không khởi động
        // được**, tệ hơn cả việc giữ DB cũ.
        // Gộp nội dung WAL vào file chính và cắt file `-wal` còn lại: nếu để lại `-wal` của DB cũ,
        // DB mới tạo ra có thể đọc phải journal của DB cũ. Bỏ qua lỗi — nhiều bản SQLite không
        // bật WAL, và khi đó không có gì để cắt.
        try {
          await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
        } catch {
          // Không chặn reset.
        }
        await db.closeAsync();
        await SQLite.deleteDatabaseAsync(DB_FILE);
        db = await SQLite.openDatabaseAsync(DB_FILE);
        logReset(reason);
      }
      await enableForeignKeys(db);
      await repairMissingColumns(db);
      await db.execAsync(CREATE_TABLES_SQL);
      await db.execAsync(CREATE_VIEWS_SQL);
      await verifyShape(db);
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      await logSchemaState(db);
      await ensureActiveOrder(db);
      return db;
    })();
  }
  try {
    return await dbReady;
  } catch (e) {
    // Không giữ instance hỏng để lần gọi sau thử lại được (AC-DB-02).
    dbReady = null;
    throw e;
  }
}

/**
 * DB phải xoá dựng lại không? Trả về **lý do bằng chữ** (để log lấy làm bằng chứng) hoặc `null`.
 *
 * Cố tình **không** so `user_version`: đó chính là nguồn gốc của BUG-08 (số phiên bản khớp nhưng
 * schema thật thì không). Trả lời bằng **quan sát schema** — cùng nguyên tắc với guard cũ nhưng giờ
 * đơn giản hơn nhiều vì chỉ có một schema.
 *
 * ⚠️ Phải kiểm **cả cột**, không chỉ tên bảng — đây là chỗ BUGFIX-23 sửa. Lỗi `no such column:
 * order_line_id` trên thiết bị (2026-10-05) xảy ra vì file DB của một build trung gian có **đúng
 * tên bảng** của schema mới nhưng thiếu cột; chỉ nhìn tên bảng thì cho là "đúng schema" ⇒ không
 * xoá ⇒ `CREATE TABLE IF NOT EXISTS` no-op ⇒ `CREATE INDEX`/view nổ.
 */
async function legacyReason(db) {
  // ⚠️ Phải hỏi **hai** lần, không lấy chung một danh sách:
  //   • `known` — lọc `name IN (…)` để áp hai quy tắc legacy cũ (bảng riêng của bản cũ / bảng riêng
  //     của bản mới).
  //   • `all`  — **không** lọc, dùng cho vòng kiểm cột bắt buộc.
  // Lấy chung một danh sách đã lọc thì `pallet_lines`/`production_entries` không có trong danh
  // sách ⇒ vòng kiểm cột bị **bỏ qua** ⇒ lại đẩy app vào đúng lỗi `no such column` (đã dính
  // một lần 2026-10-05: fix có vẻ đúng nhưng không bao giờ chạy tới nhánh đó).
  const known = await tableNames(db, true);
  if (known.size === 0) return null; // DB mới (không có bảng nào) ⇒ tạo schema, không reset
  const hasOldOnly = ['items', 'item_po', 'pallet_status', 'container_data'].some(n => known.has(n));
  const missingNew = !known.has('order_lines') || !known.has('pos');
  if (hasOldOnly) return 'thiết kế cũ (có bảng items/item_po/pallet_status/container_data)';
  if (missingNew) return 'thiết kế cũ (thiếu bảng order_lines/pos)';

  // Bảng có đúng tên nhưng thiếu cột bắt buộc — chỉ biết được bằng cách hỏi `PRAGMA`.
  const all = await tableNames(db, false);
  const gaps = [];
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    if (!all.has(table)) continue;
    const have = new Set((await db.getAllAsync(`PRAGMA table_info(${table})`)).map(c => c.name));
    const missing = required.filter(c => !have.has(c));
    // Cột vá được thì để `repairMissingColumns()` xử lý, không xoá cả DB.
    const fatal = missing.filter(c => !ADDABLE_COLUMN_DECLS[`${table}.${c}`]);
    if (fatal.length) gaps.push(`${table} thiếu ${fatal.join(', ')}`);
  }
  if (gaps.length) return `schema của một build khác (${gaps.join('; ')})`;
  return null;
}

/** Danh sách bảng trong file DB. `onlyKnown=true` thì lọc theo danh sách bảng mà `legacyReason()` biết. */
async function tableNames(db, onlyKnown) {
  const sql = onlyKnown
    ? `SELECT name FROM sqlite_master WHERE type='table' AND name IN
         ('items','item_po','entries','pallet_status','container_data','order_lines','pos')`
    : `SELECT name FROM sqlite_master WHERE type='table'`;
  return new Set((await db.getAllAsync(sql)).map(r => r.name));
}

/**
 * Tự vá cột **nullable** còn thiếu, không mất dữ liệu (AC-DB-12).
 *
 * Chỉ vá loại an toàn: `ALTER TABLE … ADD COLUMN` với `NULL` cho phép hoặc `DEFAULT` hằng.
 * Cột `NOT NULL`/khoá ngoại không nằm trong `ADDABLE_COLUMN_DECLS` — nếu thiếu thì
 * `legacyReason()` đã kết luận phải xoá dựng lại, vì đoán giá trị thay người dùng còn tệ hơn.
 *
 * Bổ sung: **bằng chứng** vì sao vá (dòng log) — cùng tinh thần AC-DB-10.
 */
async function repairMissingColumns(db) {
  const names = await tableNames(db, false);
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    if (!names.has(table)) continue; // chưa có ⇒ `CREATE TABLE IF NOT EXISTS` sẽ tạo đủ
    const have = new Set((await db.getAllAsync(`PRAGMA table_info(${table})`)).map(c => c.name));
    for (const col of required) {
      if (have.has(col)) continue;
      const decl = ADDABLE_COLUMN_DECLS[`${table}.${col}`];
      if (!decl) continue; // `legacyReason()` đã loại trường hợp này
      try {
        await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
      } catch (e) {
        // Nêu **tên bảng + tên cột** thay vì trả nguyên lỗi SQL (`database is locked`) — lỗi mơ
        // hồ không giúp chẩn đoán được, đó chính là bài học của `no such column: order_line_id`.
        throw new Error(
          `Không bổ sung được cột ${table}.${col} (còn thiếu, cần ${decl}): ${e?.message || e}`
        );
      }
      console.log(`[db] Đã bổ sung cột còn thiếu: ${table}.${col} ${decl}`);
    }
  }
}

/**
 * Xác minh **bằng quan sát** rằng schema sau khi tạo đã đủ bảng và cột — đọc lại `PRAGMA`
 * chứ không tin lời `CREATE TABLE` vừa chạy (cùng nguyên tắc `ensureItemMetricColumns` cũ của
 * BUGFIX-08: "xác minh bằng quan sát").
 *
 * Nếu vẫn thiếu thì báo **tên bảng và tên cột**. Lỗi SQL mơ hồ kiểu `no such column: order_line_id`
 * không nói được file DB đó do build nào tạo ra — đó chính là lý do lần này mất thời gian.
 */
async function verifyShape(db) {
  const names = await tableNames(db, false);
  const problems = [];
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    if (!names.has(table)) { problems.push(`thiếu bảng ${table}`); continue; }
    const have = new Set((await db.getAllAsync(`PRAGMA table_info(${table})`)).map(c => c.name));
    const missing = required.filter(c => !have.has(c));
    if (missing.length) problems.push(`${table} thiếu cột ${missing.join(', ')}`);
  }
  if (problems.length) {
    throw new Error(
      `Schema DB không đúng sau khi khởi tạo: ${problems.join('; ')}. `
      + 'File DB này do một build khác tạo ra — hãy xoá file DB của app rồi mở lại để nó dựng mới.'
    );
  }
}

function logReset(reason) {
  // Dòng log này là **bằng chứng** cho người dùng biết dữ liệu cũ đã bị xoá (chủ dự án đã chấp
  // nhận mất dữ liệu cũ ngày 2026-10-04). Không chặn app.
  console.log(`[db] Phát hiện DB không đúng thiết kế (${reason}) → đã xoá và tạo lại (FEAT-21).`);
}

async function logSchemaState(db) {
  try {
    const v = await db.getFirstAsync('PRAGMA user_version');
    const tables = await db.getAllAsync(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    const fk = await db.getFirstAsync('PRAGMA foreign_keys');
    console.log(
      `[db] user_version=${v?.user_version ?? 0} · foreign_keys=${fk?.foreign_keys ?? 0} · ` +
        `bảng=[${tables.map(t => t.name).join(', ')}]`
    );
  } catch {
    // Chỉ là log chẩn đoán, không được làm hỏng quá trình khởi tạo.
  }
}

/**
 * Bảo đảm đúng **một** đơn `status='active'` (INV-B1).
 *
 * Khác bản cũ: **không nạp seed**. Lý do — `seedItems` có shape `{ntk, po, target}` với `po` là
 * chuỗi nối `+` và `target` là tổng, tức đúng cách biểu diễn sai mà thiết kế mới bỏ; nạp nó vào
 * bảng mới là tạo ra dữ liệu sai từ đầu. Đơn mới phải **trắng** (FEAT-14) và dữ liệu chỉ đến từ
 * lần nhập file nguồn. Việc nạp seed (nếu còn muốn) là phần của phase nhập, không phải khởi tạo.
 */
async function ensureActiveOrder(db) {
  const actives = await db.getAllAsync(
    `SELECT id FROM order_batches WHERE status = 'active' ORDER BY id DESC`
  );
  if (actives.length > 0) {
    if (actives.length > 1) {
      // Batch active thừa (app bị tắt đúng lúc dở transaction, hoặc bản build cũ) ⇒ giữ batch
      // **mới nhất** là đơn người dùng đang làm, chuyển các batch cũ sang `archived`.
      // ⚠️ Không xoá gì: dữ liệu chúng vẫn xem được ở tab Lịch sử (quy tắc vàng #1).
      const staleIds = actives.slice(1).map(r => r.id);
      await db.withTransactionAsync(async () => {
        for (const id of staleIds) {
          await db.runAsync(
            `UPDATE order_batches SET status='archived', finished_date=COALESCE(finished_date, ?)
             WHERE id = ? AND status='active'`,
            [todayLocal(), id]
          );
        }
      });
    }
    return actives[0].id;
  }
  await db.runAsync(
    `INSERT INTO order_batches (status, imported_at) VALUES ('active', ?)`,
    [todayLocal()]
  );
}

export async function getActiveBatchId(db) {
  const row = await db.getFirstAsync(
    `SELECT id FROM order_batches WHERE status = 'active' ORDER BY id DESC LIMIT 1`
  );
  return row?.id;
}