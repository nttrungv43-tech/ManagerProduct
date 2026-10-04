// scripts/db-init-e2e/scenario.mjs
// Một kịch bản E2E = MỘT process. Chạy:
//   node --import ./scripts/db-init-e2e/register.mjs ./scripts/db-init-e2e/scenario.mjs <tên>
//
// Vì sao mỗi kịch bản một process: `src/db/index.js` cache `dbReady` ở **phạm vi module**.
// Nếu chạy nhiều kịch bản trong một process thì phải cache-bust `?v=N`, nhưng các module khác
// (`queries.js`) import `./index` **không** kèm query ⇒ vẫn dùng module gốc ⇒ assert sai.
// Process riêng ⇒ module registry sạch, không cần hack gì.
import { useFakeDatabase, openCounts, state } from './expo-sqlite-stub.mjs';
import { check, eq, report, captureLog } from './assert.mjs';
import { deletes } from './expo-sqlite-stub.mjs';
import { DB_FILE } from '../../src/db/schema.js';

const V1 = ['ntk', 'po', 'target', 'order_batch_id'];
const ADDED = ['nw_kg', 'gw_kg', 'volume_cbm', 'package_count'];
/** Cột `entries` trước FEAT-20 (migration v5 thêm `po`). */
const V1_ENTRY = [
  'id', 'ntk', 'order_batch_id', 'date', 'qty', 'line', 'defect_qty', 'defect_types',
];

const SCENARIOS = {
  /**
   * FEAT-21 — DB thiết kế CŨ (có `items`/`item_po`/`container_data`) phải được xoá và tạo lại.
   *
   * Lỗi gặp thật trên máy (2026-10-04): `deleteDatabaseAsync` ném
   * `Unable to delete database … that is currently open` ⇒ **app không khởi động được**.
   * Nguyên nhân: quên `closeAsync()` trước khi xoá. Kịch bản này bắt đúng lỗi đó.
   */
  async 'reset-legacy'() {
    const { getDb } = await loadApp({
      tables: ['order_batches', 'items', 'entries', 'item_po', 'pallet_status', 'container_data'],
      userVersion: 5,
    });
    const db = await getDb(); // phải KHÔNG ném, nếu không app chết ngay lúc mở

    check('getDb() không ném lỗi', !!db);
    check('đã đóng DB cũ trước khi xoá', deletes.includes(DB_FILE),
      `deletes=${JSON.stringify(deletes)} · log=${JSON.stringify(state.lastDb.log)}`);
    check('mở lại sau khi xoá', openCounts.get(DB_FILE) === 2, `openCounts=${openCounts.get(DB_FILE)}`);
    check('DB mới đã có bảng của thiết kế mới', state.tables.has('order_lines'),
      `tables=${JSON.stringify([...state.tables])}`);
    check('KHÔNG còn bảng của thiết kế cũ', !state.tables.has('items') && !state.tables.has('container_data'),
      `tables=${JSON.stringify([...state.tables])}`);
    check('không tạo bảng cũ lại sau khi xoá',
      !state.lastDb.log.some(sq => /CREATE TABLE IF NOT EXISTS items/i.test(sq)));
  },

  /** FEAT-21 — DB đã đúng thiết kế mới ⇒ KHÔNG xoá (không mất dữ liệu nhập tay). */
  async 'reset-not-needed'() {
    const { getDb } = await loadApp({
      tables: ['order_batches', 'pos', 'order_lines', 'production_entries', 'containers', 'pallets'],
      userVersion: 1,
    });
    await getDb();
    eq('KHÔNG xoá file DB khi schema đã đúng', deletes.length, 0);
    eq('chỉ mở 1 lần', openCounts.get(DB_FILE), 1);
  },

  /**
   * AC-DB-08 + AC-DB-10 — đúng tình huống máy thật: `user_version = 3` nhưng `items` vẫn thiếu
   * 4 cột, vì `3 > 3` ⇒ `runMigrations` bỏ qua v3. Guard phải tự vá (đó chính là lỗi
   * `no such column: nw_kg` đã gặp). FEAT-18: v4 vẫn chạy (4 > 3) nên `item_po` được tạo.
   */
  async 'stale-version'() {
    const { getDb, queries } = await loadApp({ userVersion: 3, itemColumns: V1 });
    const { lines, value: db, error } = await captureLog(() => getDb());

    check('getDb() không lỗi dù migration KHÔNG chạy (version > user_version là sai)',
      !!db && !error, `lỗi: ${error?.message}`);
    if (!db) return;

    eq('guard vá đủ 4 cột', alters(), 4);

    // AC-DB-03: câu `SELECT` thật của màn hình không còn lỗi `no such column`.
    let items = null, fetchErr = null;
    try { items = await queries.fetchItemsWithStats(1); } catch (e) { fetchErr = e; }
    check('fetchItemsWithStats() không lỗi no such column', Array.isArray(items),
      `lỗi: ${fetchErr?.message}`);

    const log = state.lastDb.log;
    eq('migration v2 bị bỏ qua do user_version = 3',
      log.filter(s => /^ALTER TABLE pallet_status/i.test(s)).length, 0);
    check('FEAT-18: migration v4 tạo bảng item_po',
      log.some(s => /CREATE TABLE IF NOT EXISTS item_po/i.test(s)), `log: ${log.join(' || ')}`);
    const firstAlter = log.findIndex(s => /ALTER TABLE items ADD COLUMN/i.test(s));
    const metric = log.findIndex(s => /SELECT ntk, po, target, nw_kg/i.test(s));
    check('mọi ALTER diễn ra TRƯỚC câu SELECT dùng cột mới', firstAlter >= 0 && metric > firstAlter,
      `ALTER@${firstAlter} · SELECT@${metric}`);

    const diag = lines.find(l => l.includes('[db] user_version='));
    check('AC-DB-10: có dòng log chẩn đoán [db] user_version=…', !!diag,
      `log: ${JSON.stringify(lines)}`);
    check('AC-DB-10: log nêu user_version=5 và các cột vừa vá',
      /user_version=5/.test(diag || '') && /đã vá thêm:/.test(diag || ''), `log: ${diag}`);
  },

  /** AC-DB-04 — DB đã đủ 4 cột ⇒ không sinh ALTER, không lỗi `duplicate column name`. */
  async complete() {
    const { getDb, queries } = await loadApp({
      // `userVersion: 5` = đã qua hết v1..v5; `entryColumns` có `po` = v5 đã vá xong.
      userVersion: 5, itemColumns: [...V1, ...ADDED], entryColumns: [...V1_ENTRY, 'po'],
    });
    await getDb();
    eq('không phát sinh ALTER nào (idempotent)', alters(), 0);
    // FEAT-20: `alters()` chỉ đếm ALTER của `items` — phải đếm **mọi** bảng, nếu không kịch bản
    // này vẫn xanh dù v5 vá lại `entries.po` mỗi lần mở app (lỗi `duplicate column name`).
    eq('không ALTER bảng nào (kể cả entries.po)', altersAll(), 0);
    let items = null, err = null;
    try { items = await queries.fetchItemsWithStats(1); } catch (e) { err = e; }
    check('fetchItemsWithStats() chạy được', Array.isArray(items), `lỗi: ${err?.message}`);
  },

  /** AC-DB-05 — app bị tắt giữa lúc migrate: chỉ thêm được 2/4 cột. */
  async partial() {
    const { getDb, queries } = await loadApp({
      userVersion: 4, itemColumns: [...V1, 'nw_kg', 'gw_kg'],
    });
    await getDb();
    const added = addedColumns();
    eq('chỉ thêm đúng 2 cột còn thiếu', added.join(','), 'volume_cbm,package_count');
    let items = null, err = null;
    try { items = await queries.fetchItemsWithStats(1); } catch (e) { err = e; }
    check('fetchItemsWithStats() chạy được', Array.isArray(items), `lỗi: ${err?.message}`);
  },

  /** AC-DB-01 — `getDb()` gọi song song N lần. */
  async parallel() {
    const { getDb, queries } = await loadApp({ userVersion: 3, itemColumns: V1 });
    const all = await Promise.all([getDb(), getDb(), getDb(), getDb(), getDb()]);
    eq('chỉ mở DB đúng 1 lần', openCounts.get('production_tracker.db'), 1);
    check('cả 5 trả cùng một instance', new Set(all).size === 1);
    eq('vá đủ 4 cột, không vá trùng', alters(), 4);

    const log = state.lastDb.log;
    const firstAlter = log.findIndex(s => /ALTER TABLE items ADD COLUMN/i.test(s));
    const firstSelect = log.findIndex(s => /^select/i.test(s) && /\bitems\b/i.test(s));
    check('không câu SELECT nào chạy trước câu ALTER đầu tiên',
      firstAlter >= 0 && firstSelect > firstAlter, `ALTER@${firstAlter} · SELECT@${firstSelect}`);

    let items = null, err = null;
    try { items = await queries.fetchItemsWithStats(1); } catch (e) { err = e; }
    check('fetchItemsWithStats() chạy được', Array.isArray(items), `lỗi: ${err?.message}`);
  },

  /** AC-DB-09 — vá hỏng: phải báo lỗi nêu tên cột, không âm thầm chạy tiếp. */
  async 'alter-fails'() {
    const { getDb, queries } = await loadApp({
      userVersion: 3, itemColumns: V1, failAlter: 'all',
    });
    let err = null;
    try { await getDb(); } catch (e) { err = e; }
    const msg = String(err?.message || '');
    check('getDb() phải ném lỗi, không trả DB chưa vá', err !== null);
    // Không khẳng định cứng "4 cột của items": v3 không chạy lại (3 > 3 sai) nên lỗi đầu tiên
    // là v5. Điều AC-DB-09 thật sự đòi là **nêu đích danh cột thiếu + lý do**, không phải
    // SQL mơ hồ. Chi tiết cột nào bị vá hỏng thì `alter-fails-items`/`alter-fails-entry` kiểm.
    check('lỗi nêu đích danh cột còn thiếu', /còn thiếu:\s*po\b|entries\b/.test(msg)
      && /entries/.test(msg), `message: ${msg}`);
    check('lỗi nêu lý do để chẩn đoán được', /database is locked/.test(msg), `message: ${msg}`);
    check('KHÔNG phải lỗi SQL mơ hồ "no such column"', !/no such column/.test(msg));

    // AC-DB-02: lần gọi sau được thử lại, không giữ instance hỏng.
    let retry = null;
    try { retry = await getDb(); } catch { /* vẫn lỗi là đúng: DB vẫn hỏng */ }
    check('lần gọi sau không trả instance hỏng', retry === null);
    void queries;
  },

  /** AC-DB-09 — vá hỏng riêng ở `items`: phải nêu đủ tên 4 cột để chẩn đoán được. */
  async 'alter-fails-items'() {
    const { getDb } = await loadApp({
      userVersion: 3, itemColumns: V1, failAlter: 'nw_kg',
    });
    let err = null;
    try { await getDb(); } catch (e) { err = e; }
    const msg = String(err?.message || '');
    check('getDb() phải ném lỗi', err !== null);
    check('lỗi nêu đích danh 4 cột còn thiếu', /nw_kg, gw_kg, volume_cbm, package_count/.test(msg),
      `message: ${msg}`);
    check('lỗi nêu lý do để chẩn đoán được', /database is locked/.test(msg), `message: ${msg}`);
  },

  /** AC-DB-03 + AC-DB-06 — DB `user_version = 2`: v3, v4 chạy bình thường và đóng dấu 4. */
  async 'version-2'() {
    const { getDb, queries } = await loadApp({ userVersion: 2, itemColumns: V1 });
    await getDb();
    eq('vá đủ 4 cột qua migration v3', alters(), 4);
    eq('ghi đúng một lần PRAGMA user_version = 3',
      state.lastDb.log.filter(s => /PRAGMA user_version = 3/i.test(s)).length, 1);
    eq('ghi đúng một lần PRAGMA user_version = 4 (FEAT-18)',
      state.lastDb.log.filter(s => /PRAGMA user_version = 4/i.test(s)).length, 1);
    let items = null, err = null;
    try { items = await queries.fetchItemsWithStats(1); } catch (e) { err = e; }
    check('fetchItemsWithStats() chạy được', Array.isArray(items), `lỗi: ${err?.message}`);
  },
};

// ---------- tiện ích ----------
async function loadApp(initial, fileName = 'production_tracker.db') {
  useFakeDatabase(fileName, initial);
  state.lastDb = null;
  openCounts.clear();
  const [db, queries] = await Promise.all([
    import('../../src/db/index.js'),
    import('../../src/db/queries.js'),
  ]);
  return { getDb: db.getDb, queries };
}

const alters = () =>
  state.lastDb.log.filter(s => /ALTER TABLE items ADD COLUMN/i.test(s)).length;
/** Đếm ALTER của **mọi** bảng — bắt được cả vá lặp của `entries.po` (migration v5). */
const altersAll = () =>
  state.lastDb.log.filter(s => /ALTER TABLE \w+ ADD COLUMN/i.test(s)).length;
const addedColumns = () =>
  state.lastDb.log
    .filter(s => /ALTER TABLE items ADD COLUMN/i.test(s))
    .map(s => /ADD COLUMN (\w+)/i.exec(s)[1]);

// ---------- chạy ----------
const name = process.argv[2];
const run = SCENARIOS[name];
if (!run) {
  console.error(`Kịch bản không hợp lệ: "${name}". Có: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(2);
}
console.log(`${name})`);
await run();
process.exit(report(name));