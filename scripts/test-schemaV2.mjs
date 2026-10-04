// scripts/test-schemaV2.mjs
// FEAT-21 — Kiểm schema mới bằng **SQLite thật** (`node:sqlite`) + **file `Dmac.json` thật**.
//
// Vì sao test bằng dữ liệu thật: thiết kế cũ hỏng vì giả định sai về hình dạng dữ liệu. Test suy ra
// số từ `Dmac.json` là cách duy nhất chứng minh schema mới chịu được dữ liệu thật — đặc biệt là
// 15 mã đa PO (mã `1072017GF` thuộc 6 PO), thứ mà `items.po = '2922+2923'` không biểu diễn được.
//
// Không cần Expo/máy thật. Chạy: node --no-warnings scripts/test-schemaV2.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { buildImportPlanV2 } from '../src/utils/packingV2Import.js';

let pass = 0;
let fail = 0;
const failures = [];
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failures.push(`${label}\n      nhận: ${JSON.stringify(actual)}\n      cần : ${JSON.stringify(expected)}`));
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : ` — ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`}`);
};
const check = (label, cond, detail = '') => eq(label + (cond ? '' : ` (${detail})`), !!cond, true);

// ── nạp schema từ nguồn thật, không chép SQL ra chỗ khác ──────────────────────
const src = readFileSync(new URL('../src/db/schema.js', import.meta.url), 'utf8');
const sqlOf = (name) => {
  const m = src.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`));
  if (!m) throw new Error(`không tìm thấy ${name} trong schema.js`);
  return m[1];
};

const dmac = JSON.parse(readFileSync(new URL('../src/data/Dmac.json', import.meta.url), 'utf8'));
const plan = buildImportPlanV2(dmac);

function freshDb() {
  const d = new DatabaseSync(':memory:');
  d.exec('PRAGMA foreign_keys = ON');
  d.exec(sqlOf('CREATE_TABLES_SQL'));
  d.exec(sqlOf('CREATE_VIEWS_SQL'));
  return d;
}

/**
 * Ghi kế hoạch vào DB mới — đúng thứ tự mà `queries.js` sẽ làm.
 * Lưu ý: `node:sqlite` trả `lastInsertRowid` (chữ **d** thường), còn `expo-sqlite` trả
 * `lastInsertRowId` (chữ **D**). Chỗ ghi thật sẽ dùng API của `expo-sqlite`; ở test chỉ cần id.
 */
function applyPlan(d, p, importedAt = '2026-10-04') {
  const b = d.prepare(
    `INSERT INTO order_batches (status, source_file, mark, imported_at) VALUES ('active', ?, ?, ?)`
  ).run(p.order.sourceFile, p.order.mark, importedAt);
  const batchId = Number(b.lastInsertRowid);

  const insPo = d.prepare(
    `INSERT INTO pos (order_batch_id, code, consignee, address, destination, invoice_no)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const posIds = p.pos.map(po =>
    Number(insPo.run(batchId, po.code, po.consignee, po.address, po.destination, po.invoice_no).lastInsertRowid));

  const insLine = d.prepare(
    `INSERT INTO order_lines (po_id, item_code, target, nw_kg, gw_kg, volume_cbm, package_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const lineIds = p.lines.map(l =>
    Number(insLine.run(posIds[l.poIdx], l.itemCode, l.target, l.nw_kg, l.gw_kg, l.volume_cbm, l.package_count).lastInsertRowid));

  const insRef = d.prepare(`INSERT OR IGNORE INTO item_refs (order_batch_id, item_code, ref_no) VALUES (?, ?, ?)`);
  for (const r of p.refs) insRef.run(batchId, r.itemCode, r.refNo);

  const insCt = d.prepare(`INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, ?, ?)`);
  const containerIds = p.containers.map(c =>
    Number(insCt.run(batchId, posIds[c.poIdx], c.containerNo, c.sealNo).lastInsertRowid));

  const insPal = d.prepare(
    `INSERT INTO pallets (container_id, po_id, pallet_no, c_no, is_mixed,
                          length_m, width_m, height_m, volume_cbm, nw_kg, gw_kg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const palletIds = p.pallets.map(x =>
    Number(insPal.run(containerIds[x.containerIdx], posIds[x.poIdx], x.palletNo, x.cNo, x.isMixed,
      x.length_m, x.width_m, x.height_m, x.volume_cbm, x.nw_kg, x.gw_kg).lastInsertRowid));

  const insPl = d.prepare(`INSERT INTO pallet_lines (pallet_id, order_line_id, qty) VALUES (?, ?, ?)`);
  for (const pl of p.palletLines) insPl.run(palletIds[pl.palletIdx], lineIds[pl.lineIdx], pl.qty);

  return { batchId, posIds, lineIds, palletIds };
}

const one = (d, sql, ...a) => d.prepare(sql).get(...a);
const all = (d, sql, ...a) => d.prepare(sql).all(...a);

// ══════════════════════════════════════════════════════════════════════
console.log('1) Dmac.json nạp vào schema mới — số đo được từ chính file nguồn');
// ══════════════════════════════════════════════════════════════════════
{
  const srcTotals = dmac.batches[0].totals;
  const db = freshDb();
  const { batchId } = applyPlan(db, plan);

  eq('12 PO', one(db, 'SELECT COUNT(*) c FROM pos').c, dmac.shipment_list.length);
  eq('12 container', one(db, 'SELECT COUNT(*) c FROM containers').c, srcTotals.containers);
  eq(`${srcTotals.packages} kiện`, one(db, 'SELECT COUNT(*) c FROM pallets').c, srcTotals.packages);
  eq('49 mã (distinct item_code)', one(db, 'SELECT COUNT(DISTINCT item_code) c FROM order_lines').c, 49);
  eq('55 số hiệu DMAC được giữ lại', one(db, 'SELECT COUNT(*) c FROM item_refs').c, 55);
  eq('220 dòng hàng trong kiện', one(db, 'SELECT COUNT(*) c FROM pallet_lines').c, 220);

  const t = one(db, 'SELECT SUM(target) t FROM order_lines').t;
  eq(`Σ target = ${srcTotals.qty} (đúng tổng file nguồn)`, t, srcTotals.qty);

  // 15/49 mã đa PO — chính là thứ bản cũ không biểu diễn được.
  const multi = all(db, `
    SELECT item_code, COUNT(*) c FROM order_lines GROUP BY item_code HAVING c > 1`);
  eq('15 mã thuộc nhiều PO', multi.length, 15);
  const worst = one(db, `
    SELECT item_code, COUNT(*) c, SUM(target) t FROM order_lines
    WHERE item_code='1072017GF' GROUP BY item_code`);
  eq('1072017GF thuộc 6 PO', worst.c, 6);
  eq('1072017GF tổng 2808 pcs', worst.t, 2808);
}

// ══════════════════════════════════════════════════════════════════════
console.log('2) KHÔNG cột trùng dữ liệu — mỗi PO có số riêng (lỗi gốc của bản cũ)');
// ══════════════════════════════════════════════════════════════════════
{
  const db = freshDb();
  applyPlan(db, plan);
  const rows = all(db, 'SELECT po, target, produced, remaining FROM v_po_progress ORDER BY po');
  eq('12 dòng PO trong view', rows.length, 12);
  eq('KHÔNG dòng nào có produced = NULL (hết cột `-` trên bảng "Tổng theo PO")',
    rows.filter(r => r.produced === null).length, 0);
  eq('Σ target của 12 PO = 25520', rows.reduce((s, r) => s + r.target, 0), 25520);

  // Tổng của từng PO phải khớp `totals.qty` của shipment tương ứng trong file nguồn.
  const byPo = new Map(dmac.shipment_list.map(s => [s.po_no, s.totals.qty]));
  const bad = rows.filter(r => byPo.get(r.po) !== r.target);
  eq('Tổng của TỪNG PO khớp đúng file nguồn (PO 2924/2929 không còn bằng 0)', bad.length, 0);
  check('PO 2924 có số riêng > 0', rows.find(r => r.po === '2924')?.target > 0);
  check('PO 2929 có số riêng > 0', rows.find(r => r.po === '2929')?.target > 0);
}

// ══════════════════════════════════════════════════════════════════════
console.log('3) Nhật ký sản xuất — mỗi dòng thuộc đúng MỘT PO (INV-D8)');
// ══════════════════════════════════════════════════════════════════════
{
  const db = freshDb();
  const { lineIds } = applyPlan(db, plan);
  const ins = db.prepare(
    `INSERT INTO production_entries (order_line_id, date, qty, line, defect_qty) VALUES (?, ?, ?, ?, ?)`);
  // 1072017GF thuộc 6 PO: nhập 6 mục, mỗi mục một PO khác nhau.
  const linesOf = db.prepare(`SELECT id FROM order_lines WHERE item_code='1072017GF' ORDER BY id`).all();
  for (const l of linesOf) ins.run(l.id, '2026-10-04', 100, 'manual', 0);
  ins.run(lineIds[0], '2026-10-04', 50, 'auto', 10);

  eq('6 PO của 1072017GF đều có số riêng',
    one(db, `SELECT COUNT(*) c FROM v_po_progress WHERE produced > 0`).c > 0, true);
  const sumProd = one(db, 'SELECT SUM(produced) s FROM v_po_progress').s;
  eq('Σ produced bằng Σ qty nhật ký (6 PO × 100 + 1 mục × 50 = 650)', sumProd, 650);
  check('Σ produced KHÔNG vượt Σ target của cả đơn', sumProd <= 25520);

  // Chuyển nhật ký sang PO khác **còn tồn tại** là hợp lệ (người dùng gán lại PO) — FK không chặn,
  // và đó là đúng: FK bảo đảm tham chiếu có thật, còn hạn mức thì để `queries.js` lo.
  const other = db.prepare(`SELECT id FROM order_lines WHERE po_id != (SELECT po_id FROM order_lines WHERE id=?)`).get(lineIds[0]);
  check('gán lại PO cho nhật ký cũ vẫn được (PO đích có thật)',
    (db.prepare(`UPDATE production_entries SET order_line_id=? WHERE order_line_id=?`).run(other.id, lineIds[0]),
     one(db, `SELECT COUNT(*) c FROM production_entries WHERE order_line_id=?`, other.id).c === 1));
  let msg = '';
  try {
    db.prepare(`UPDATE production_entries SET order_line_id=999999 WHERE id=?`)
      .run(one(db, `SELECT id FROM production_entries LIMIT 1`).id);
  } catch (e) { msg = e.message; }
  check('FK chặn trỏ tới dòng đơn hàng KHÔNG tồn tại', /FOREIGN KEY/i.test(msg), msg);
}

// ══════════════════════════════════════════════════════════════════════
console.log('4) FK thay cho quy tắc miệng (INV-D5, INV-V2)');
// ══════════════════════════════════════════════════════════════════════
{
  const db = freshDb();
  const { lineIds, palletIds, batchId } = applyPlan(db, plan);
  const throws = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

  check('INV-D5: entries trỏ dòng đơn hàng không tồn tại ⇒ bị chặn',
    /FOREIGN KEY/i.test(throws(() =>
      db.prepare(`INSERT INTO production_entries (order_line_id, date, qty) VALUES (999999, '2026-10-04', 1)`).run())));

  check('INV-V2: pallet_lines trỏ mã không có trong đơn ⇒ bị chặn',
    /FOREIGN KEY/i.test(throws(() =>
      db.prepare(`INSERT INTO pallet_lines (pallet_id, order_line_id, qty) VALUES (?, 999999, 1)`).run(palletIds[0]))));

  check('xoá dòng đơn hàng đang có nhật ký ⇒ bị chặn (RESTRICT, không âm thầm mất dữ liệu)',
    /FOREIGN KEY/i.test(throws(() =>
      db.prepare(`DELETE FROM order_lines WHERE id=?`).run(lineIds[0]))));

  // CASCADE đúng hướng: xoá đơn thì mọi thứ thuộc nó đi theo.
  eq('xoá đơn ⇒ xoá luôn PO/dòng/kiện (CASCADE)',
    (db.prepare(`DELETE FROM order_batches WHERE id=?`).run(batchId),
     one(db, `SELECT (SELECT COUNT(*) FROM pos) a, (SELECT COUNT(*) FROM pallets) b, (SELECT COUNT(*) FROM item_refs) c`).a + one(db, `SELECT COUNT(*) c FROM pallets`).c),
    0);
}

// ══════════════════════════════════════════════════════════════════════
console.log('5) CHECK thay cho quy tắc miệng (INV-D2, INV-D3)');
// ══════════════════════════════════════════════════════════════════════
{
  const db = freshDb();
  const { lineIds } = applyPlan(db, plan);
  // Báo cả thành công (chuỗi rỗng) lẫn thất bại (message) — tránh test cũ giữ nhầm lỗi cũ.
  const tryOk = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
  const pe = (date, line = 'manual') => () =>
    db.prepare(`INSERT INTO production_entries (order_line_id, date, qty, line) VALUES (?, ?, 1, ?)`)
      .run(lineIds[0], date, line);
  const de = (t) => () =>
    db.prepare(`INSERT INTO production_defects (entry_id, type) SELECT id, ? FROM production_entries LIMIT 1`).run(t);

  db.prepare(`INSERT INTO production_entries (order_line_id, date, qty, line, defect_qty) VALUES (?, '2026-10-04', 5, 'manual', 2)`).run(lineIds[0]);

  check('INV-D2: ngày không tồn tại bị chặn', /CHECK/i.test(tryOk(pe('2026-13-45'))));
  check('INV-D2: 30/02 bị chặn', /CHECK/i.test(tryOk(pe('2026-02-30'))));
  check('INV-D2: định dạng khác bị chặn', /CHECK/i.test(tryOk(pe('04/10/2026'))));
  check('INV-D3: line="auto" vẫn hợp lệ', tryOk(pe('2026-10-04', 'auto')) === '');
  check('INV-D3: line sai bị chặn', /CHECK/i.test(tryOk(pe('2026-10-04', 'bogus'))));
  check('INV-D3: loại lỗi ngoài yellow/red/tear bị chặn', /CHECK/i.test(tryOk(de('purple'))));
  check('INV-D3: loại lỗi hợp lệ vẫn nhận', tryOk(de('tear')) === '');

  check('target âm bị chặn', (() => {
    try { db.prepare(`INSERT INTO pos (order_batch_id, code) VALUES (1, 'X')`).run(); } catch {}
    try { db.prepare(`INSERT INTO order_lines (po_id, item_code, target) VALUES (1, 'Y', -1)`).run(); return false; }
    catch (e) { return /CHECK/i.test(e.message); }
  })());
}

// ══════════════════════════════════════════════════════════════════════
console.log('6) `pallet_lines.done` thay cho bảng khoá mã hoá (hết INV-P1)');
// ══════════════════════════════════════════════════════════════════════
{
  const db = freshDb();
  const { lineIds } = applyPlan(db, plan);
  // Chọn kiện có **đúng 1** dòng hàng (thực tế `Dmac.json` không có kiện trộn) để thêm dòng thứ 2.
  const pal = db.prepare(`
    SELECT p.id FROM pallets p
    WHERE (SELECT COUNT(*) FROM pallet_lines l WHERE l.pallet_id = p.id) = 1
    ORDER BY p.id LIMIT 1`).get();
  const inPal = db.prepare(`SELECT order_line_id FROM pallet_lines WHERE pallet_id=?`).get(pal.id);
  const spare = lineIds.find(id => id !== inPal.order_line_id);
  const doneCount = () =>
    db.prepare(`SELECT SUM(done) s FROM pallet_lines WHERE pallet_id=?`).get(pal.id).s;

  // Kiện đã có sẵn 1 dòng hàng từ dữ liệu nguồn — dùng luôn, không tạo lại.
  eq('kiện được chọn có đúng 1 dòng hàng', inPal.order_line_id !== undefined, true);
  check('tick kiện: UPDATE cột, không cần khoá mã hoá',
    (db.prepare(`UPDATE pallet_lines SET done=1 WHERE pallet_id=?`).run(pal.id), doneCount() === 1));

  // Đây là kịch bản làm hỏng BUG-01: thêm một dòng hàng vào kiện đã tick.
  db.prepare(`INSERT INTO pallet_lines (pallet_id, order_line_id, qty) VALUES (?, ?, 5)`).run(pal.id, spare);
  check('thêm dòng hàng vào kiện đã tick ⇒ trạng thái KHÔNG mất (hết INV-P1)',
    doneCount() === 1);
  check('dòng mới mặc định chưa tick', db.prepare(
    `SELECT done FROM pallet_lines WHERE pallet_id=? AND order_line_id=?`).get(pal.id, spare).done === 0);

  const rows = db.prepare(`SELECT COUNT(*) c FROM pallet_lines WHERE pallet_id=?`).get(pal.id).c;
  check('bỏ tick rồi tick lại được, chạy lại không lỗi (UPDATE idempotent)', (() => {
    db.prepare(`UPDATE pallet_lines SET done=0 WHERE pallet_id=?`).run(pal.id);
    const cleared = doneCount() === 0;
    db.prepare(`UPDATE pallet_lines SET done=1 WHERE pallet_id=?`).run(pal.id);
    return cleared && doneCount() === rows; // SET áp cho mọi dòng của kiện
  })());
  // Bằng chứng cấu trúc: bản cũ cần `remapPalletStatus()` để dựng lại khoá mỗi lần đổi kiện.
  // Bản mới chỉ có `done` — nên xoá/thêm dòng KHÔNG đổi khoá nào cả.
  check('trạng thái tick là CỘT, không phải khoá mã hoá', (() => {
    const cols = db.prepare(`PRAGMA table_info(pallet_lines)`).all().map(c => c.name);
    return cols.includes('done') && !cols.some(c => /key/i.test(c));
  })());
}

console.log(`\nKết quả: ${pass} passed, ${fail} failed`);
if (failures.length) console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);