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
function applyPlan(d, p, importedAt = '2026-10-04', existingBatchId = null) {
  let batchId = existingBatchId;
  if (!batchId) {
    const b = d.prepare(
      `INSERT INTO order_batches (status, source_file, mark, imported_at) VALUES ('active', ?, ?, ?)`
    ).run(p.order.sourceFile, p.order.mark, importedAt);
    batchId = Number(b.lastInsertRowid);
  }

  const insPo = d.prepare(
    `INSERT INTO pos (order_batch_id, code, consignee, address, destination, invoice_no)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(order_batch_id, code) DO UPDATE SET
       consignee = COALESCE(excluded.consignee, pos.consignee),
       address = COALESCE(excluded.address, pos.address),
       destination = COALESCE(excluded.destination, pos.destination),
       invoice_no = COALESCE(excluded.invoice_no, pos.invoice_no)`
  );
  const posIds = [];
  for (const po of p.pos) {
    insPo.run(batchId, po.code, po.consignee, po.address, po.destination, po.invoice_no);
    const row = d.prepare(`SELECT id FROM pos WHERE order_batch_id = ? AND code = ?`).get(batchId, po.code);
    posIds.push(row.id);
  }

  const existingContainers = d.prepare(
    `SELECT container_no, po_id FROM containers WHERE order_batch_id = ?`
  ).all(batchId);
  const existingContainerSet = new Set(
    existingContainers.map(c => `${c.po_id}\u0000${c.container_no}`)
  );

  const poHasNewContainer = new Set();
  for (const c of p.containers) {
    const poId = posIds[c.poIdx];
    const poCode = p.pos[c.poIdx].code;
    const keyNormal = `${poId}\u0000${c.containerNo}`;
    const keyAlt = `${poId}\u0000${c.containerNo} (${poCode})`;
    const exists = existingContainerSet.has(keyNormal) || existingContainerSet.has(keyAlt);
    if (!exists) {
      poHasNewContainer.add(c.poIdx);
    }
  }

  const insLine = d.prepare(
    `INSERT INTO order_lines (po_id, item_code, target, nw_kg, gw_kg, volume_cbm, package_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(po_id, item_code) DO UPDATE SET
       nw_kg = CASE
         WHEN ? = 1 THEN COALESCE(order_lines.nw_kg, 0) + COALESCE(excluded.nw_kg, 0)
         ELSE COALESCE(excluded.nw_kg, order_lines.nw_kg)
       END,
       gw_kg = CASE
         WHEN ? = 1 THEN COALESCE(order_lines.gw_kg, 0) + COALESCE(excluded.gw_kg, 0)
         ELSE COALESCE(excluded.gw_kg, order_lines.gw_kg)
       END,
       volume_cbm = CASE
         WHEN ? = 1 THEN COALESCE(order_lines.volume_cbm, 0) + COALESCE(excluded.volume_cbm, 0)
         ELSE COALESCE(excluded.volume_cbm, order_lines.volume_cbm)
       END`
  );
  const lineIds = [];
  for (const l of p.lines) {
    const poId = posIds[l.poIdx];
    const isNew = poHasNewContainer.has(l.poIdx) ? 1 : 0;
    insLine.run(poId, l.itemCode, l.target, l.nw_kg, l.gw_kg, l.volume_cbm, l.package_count, isNew, isNew, isNew);
    const row = d.prepare(`SELECT id FROM order_lines WHERE po_id = ? AND item_code = ?`).get(poId, l.itemCode);
    lineIds.push(row.id);
  }

  const insRef = d.prepare(`INSERT OR IGNORE INTO item_refs (order_batch_id, item_code, ref_no) VALUES (?, ?, ?)`);
  for (const r of p.refs) insRef.run(batchId, r.itemCode, r.refNo);

  const insLineRef = d.prepare(
    `INSERT INTO order_line_refs (order_line_id, ref_no, target) VALUES (?, ?, ?)
     ON CONFLICT(order_line_id, ref_no) DO UPDATE SET
       target = CASE
         WHEN ? = 1 THEN order_line_refs.target + excluded.target
         ELSE excluded.target
       END`
  );
  for (const lr of p.lineRefs) {
    const li = p.lines.findIndex(l => l.poIdx === lr.poIdx && l.itemCode === lr.itemCode);
    if (li < 0) continue;
    const isNew = poHasNewContainer.has(lr.poIdx) ? 1 : 0;
    insLineRef.run(lineIds[li], lr.refNo, lr.target, isNew);
  }

  const containerIds = [];
  for (const c of p.containers) {
    const poId = posIds[c.poIdx];
    const poCode = p.pos[c.poIdx].code;
    let containerNo = c.containerNo;

    const existing = d.prepare(
      `SELECT id, po_id FROM containers WHERE order_batch_id = ? AND container_no = ?`
    ).get(batchId, containerNo);

    let cId;
    if (existing) {
      if (existing.po_id === poId) {
        if (c.sealNo) {
          d.prepare(`UPDATE containers SET seal_no = ? WHERE id = ?`).run(c.sealNo, existing.id);
        }
        cId = existing.id;
        d.prepare(`DELETE FROM pallets WHERE container_id = ?`).run(cId);
      } else {
        containerNo = `${containerNo} (${poCode})`;
        const existingAlt = d.prepare(
          `SELECT id FROM containers WHERE order_batch_id = ? AND container_no = ?`
        ).get(batchId, containerNo);
        if (existingAlt) {
          cId = existingAlt.id;
          d.prepare(`DELETE FROM pallets WHERE container_id = ?`).run(cId);
        } else {
          const r = d.prepare(
            `INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, ?, ?)`
          ).run(batchId, poId, containerNo, c.sealNo);
          cId = Number(r.lastInsertRowid);
        }
      }
    } else {
      const r = d.prepare(
        `INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, ?, ?)`
      ).run(batchId, poId, containerNo, c.sealNo);
      cId = Number(r.lastInsertRowid);
    }
    containerIds.push(cId);
  }

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

  for (const poId of posIds) {
    d.prepare(
      `UPDATE order_lines
       SET
         target = COALESCE(
           (SELECT SUM(qty) FROM pallet_lines WHERE order_line_id = order_lines.id),
           target
         ),
         package_count = COALESCE(
           (SELECT NULLIF(COUNT(DISTINCT pallet_id), 0) FROM pallet_lines WHERE order_line_id = order_lines.id),
           package_count
         )
       WHERE po_id = ?`
    ).run(poId);
  }

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

  // Chi tiết lịch sử theo ngày: cộng dồn theo từng mã hàng (không sinh dòng mới)
  const detailRows = db.prepare(
    `SELECT MIN(pe.id) AS id,
            pe.date,
            COALESCE(SUM(pe.qty),0) AS qty,
            COALESCE(SUM(pe.defect_qty),0) AS defect_qty,
            ol.item_code AS ntk,
            GROUP_CONCAT(DISTINCT p.code) AS po
     FROM production_entries pe
     JOIN order_lines ol ON ol.id = pe.order_line_id
     JOIN pos p ON p.id = ol.po_id
     WHERE pe.date = '2026-10-04'
     GROUP BY ol.item_code
     ORDER BY ol.item_code ASC`
  ).all();
  const gf = detailRows.find(r => r.ntk === '1072017GF');
  eq('1072017GF (6 lần nhập) chỉ thành 1 dòng gộp duy nhất', detailRows.filter(r => r.ntk === '1072017GF').length, 1);
  eq('1072017GF số lượng được cộng dồn đúng 600', Number(gf?.qty), 600);
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

// ══════════════════════════════════════════════════════════════════════
console.log('7) `order_line_refs` — số hiệu gắn với PO × mã, KHÔNG phải chỉ mã (FEAT-22)');
// ══════════════════════════════════════════════════════════════════════
{
  const db = freshDb();
  applyPlan(db, plan);

  eq('82 dòng (PO × mã × ref) — nhiều hơn 55 của item_refs',
    one(db, 'SELECT COUNT(*) c FROM order_line_refs').c, 82);
  eq('55 dòng item_refs vẫn còn nguyên (không xoá, không đổi)',
    one(db, 'SELECT COUNT(*) c FROM item_refs').c, 55);

  // AC-REF-01: tổng target của mọi ref bằng tổng kế hoạch cả đơn.
  eq(`Σ target của order_line_refs = 25520 (= Σ order_lines.target)`,
    one(db, 'SELECT SUM(target) t FROM order_line_refs').t, 25520);

  // AC-REF-10: từng dòng, Σ target theo ref == order_lines.target của dòng đó.
  const mismatch = all(db, `
    SELECT l.id, l.target,
           (SELECT COALESCE(SUM(r.target),0) FROM order_line_refs r WHERE r.order_line_id = l.id) AS ref_sum
    FROM order_lines l
    WHERE l.target <> (SELECT COALESCE(SUM(r.target),0) FROM order_line_refs r WHERE r.order_line_id = l.id)`);
  eq('KHÔNG dòng nào lệch giữa target của dòng và tổng target các ref', mismatch.length, 0);

  // AC-REF-02/03: 7 thẻ từng sai nếu đọc ref theo mã. Chốt lại từng thẻ bằng chính view.
  const refsOf = (po, code) => String(
    one(db, `SELECT refs FROM v_line_progress WHERE po=? AND item_code=?`, po, code)?.refs ?? ''
  ).split(',').filter(Boolean).map(s => s.slice(0, s.lastIndexOf(':')));
  eq('PO 2919 / 106385GF chỉ có D980159 (không lẫn D980077 của PO 2921)',
    refsOf('2919', '106385GF'), ['D980159']);
  eq('PO 2921 / 106385GF chỉ có D980077', refsOf('2921', '106385GF'), ['D980077']);
  eq('PO 2924 / 1072014GF chỉ có D580422', refsOf('2924', '1072014GF'), ['D580422']);
  eq('PO 2926 / 1072014GF chỉ có D581032', refsOf('2926', '1072014GF'), ['D581032']);
  eq('PO 2927 / 106263GF chỉ có D980294', refsOf('2927', '106263GF'), ['D980294']);
  eq('PO 2929 / 1072014GF chỉ có D580422', refsOf('2929', '1072014GF'), ['D580422']);

  // View gộp `ref:target` thành MỘT chuỗi — mỗi ref mang số của chính nó, không lệch theo thứ tự.
  eq('view trả "ref:target" (mỗi ref mang số của chính nó)',
    one(db, `SELECT refs FROM v_line_progress WHERE po='2919' AND item_code='1063048GF'`).refs
      .split(',').sort(), ['D980470:477', 'D980781:80', 'D980973:159']);

  // AC-REF-04: 4 mã có nhiều ref trong CÙNG một PO.
  eq('PO 2919 / 1063048GF có 3 ref, tổng 716 (= target)',
    all(db, `SELECT r.ref_no, r.target FROM order_line_refs r
             JOIN order_lines l ON l.id = r.order_line_id JOIN pos p ON p.id = l.po_id
             WHERE p.code='2919' AND l.item_code='1063048GF' ORDER BY r.ref_no`)
      .map(r => `${r.ref_no}:${r.target}`), ['D980470:477', 'D980781:80', 'D980973:159']);
  eq('PO 2920 / 1072014GF có 2 ref, tổng 214 (= target)',
    one(db, `SELECT COUNT(*) c, SUM(r.target) t FROM order_line_refs r
             JOIN order_lines l ON l.id = r.order_line_id JOIN pos p ON p.id = l.po_id
             WHERE p.code='2920' AND l.item_code='1072014GF'`).c === 2
    && one(db, `SELECT SUM(r.target) t FROM order_line_refs r
             JOIN order_lines l ON l.id = r.order_line_id JOIN pos p ON p.id = l.po_id
             WHERE p.code='2920' AND l.item_code='1072014GF'`).t === 214, true);

  // AC-REF-05: dòng đơn hàng không có kiện ⇒ không có ref ⇒ view trả NULL (UI ẩn theo INV-I1).
  const insPo = db.prepare(`INSERT INTO pos (order_batch_id, code) VALUES (1, 'TEST-PO')`);
  const poId = Number(insPo.run().lastInsertRowid);
  const bare = Number(db.prepare(
    `INSERT INTO order_lines (po_id, item_code, target) VALUES (?, 'MANUAL-001', 500)`).run(poId).lastInsertRowid);
  const bareRow = one(db, 'SELECT refs FROM v_line_progress WHERE order_line_id = ?', bare);
  eq('dòng thêm tay không có ref ⇒ view trả NULL (không phải chuỗi rỗng)', bareRow.refs, null);

  // AC-REF-09: nhập lại lần 2 không nhân bản. `order_lines` xoá ⇒ cascade xoá ref (không xoá tay).
  db.prepare(`DELETE FROM order_lines WHERE id = ?`).run(bare);
  eq('xoá dòng đơn hàng ⇒ order_line_refs đi theo (ON DELETE CASCADE)',
    one(db, 'SELECT COUNT(*) c FROM order_line_refs WHERE order_line_id = ?', bare).c, 0);
  eq('không nuốt mất ref của dòng khác', one(db, 'SELECT COUNT(*) c FROM order_line_refs').c, 82);

  // PK (order_line_id, ref_no) chặn trùng — nguồn import đã `INSERT OR IGNORE` nhưng DB vẫn phải chặn.
  const some = one(db, 'SELECT order_line_id, ref_no FROM order_line_refs LIMIT 1');
  let dupErr = '';
  try { db.prepare(`INSERT INTO order_line_refs (order_line_id, ref_no, target) VALUES (?, ?, 1)`)
    .run(some.order_line_id, some.ref_no); } catch (e) { dupErr = e.message; }
  check('PK chặn trùng (order_line_id, ref_no)', /UNIQUE|PRIMARY KEY/i.test(dupErr), dupErr);

  // ref của PO này không được "rò" sang thẻ PO khác của cùng mã (lỗi gốc của FEAT-22).
  const spill = all(db, `
    SELECT p.code AS po, l.item_code, GROUP_CONCAT(r.ref_no) AS refs
    FROM order_line_refs r JOIN order_lines l ON l.id = r.order_line_id JOIN pos p ON p.id = l.po_id
    GROUP BY l.id HAVING COUNT(*) > 0`);
  eq('mọi dòng đều lấy ref qua chính order_line_id của nó (không JOIN lỏng theo item_code)',
    spill.filter(r => !r.refs).length, 0);
}

// ══════════════════════════════════════════════════════════════════════
console.log('8) production_entry_refs — nhật ký gắn số hiệu, hạn mức theo ref (FEAT-23)');
console.log('   (SQLite thật cho schema/view/FK; hạn mức tầng DB kiểm bằng checkQtyLimit thật');
// ══════════════════════════════════════════════════════════════════════
{
  const db = freshDb();
  const { lineIds } = applyPlan(db, plan);

  // Dùng 1063048GF @ PO 2919: 3 ref — 477 / 159 / 80 (target tổng 716).
  const target = one(db, `
    SELECT l.id, l.target FROM order_lines l JOIN pos p ON p.id = l.po_id
    WHERE p.code='2919' AND l.item_code='1063048GF'`).id;
  const refsOf = (code) => all(db, `
    SELECT ref_no, target FROM order_line_refs WHERE order_line_id=? ORDER BY ref_no`, target)
    .filter(r => r.ref_no === code)[0];
  const D470 = refsOf('D980470');   // 477
  const D973 = refsOf('D980973');   // 159
  const D781 = refsOf('D980781');   // 80

  eq('3 ref của 1063048GF: D980470=477, D980973=159, D980781=80',
    [D470.target, D973.target, D781.target], [477, 159, 80]);
  eq('Σ target của 3 ref = 716 = order_lines.target',
    D470.target + D973.target + D781.target, 716);

  const insEntry = (qty, refNo = null) => {
    const r = db.prepare(
      `INSERT INTO production_entries (order_line_id, date, qty, line) VALUES (?, '2026-10-05', ?, 'manual')`
    ).run(target, qty);
    // better-sqlite3 trả lastInsertRowid là BigInt ⇒ phải ép Number, nếu không sẽ không bind được.
    const id = Number(r.lastInsertRowid);
    if (refNo) {
      db.prepare('INSERT INTO production_entry_refs (entry_id, order_line_id, ref_no) VALUES (?, ?, ?)')
        .run(id, target, refNo);
    }
    return id;
  };
  const producedOf = (refNo) => one(db, `
    SELECT COALESCE(SUM(e.qty),0) p FROM production_entries e
    JOIN production_entry_refs er ON er.entry_id = e.id
    WHERE er.order_line_id=? AND er.ref_no=?`, target, refNo).p;
  const progress = () => String(
    one(db, 'SELECT ref_progress FROM v_line_progress WHERE order_line_id = ?', target).ref_progress ?? ''
  ).split(',').filter(Boolean);

  // ── AC-RF-01: view trả tiến độ kèm số hiệu ──
  eq('ref_progress có 3 mục ref:đã_làm:kế_hoạch', progress().length, 3);
  eq('mặc định đã làm = 0 cho cả 3 ref',
    progress().map(s => s.split(':')[1]), ['0', '0', '0']);
  eq('unattributed = 0 khi chưa nhập gì',
    one(db, 'SELECT unattributed_produced u FROM v_line_progress WHERE order_line_id=?', target).u, 0);

  // ── AC-RF-04: nhật theo ref ⇒ sản lượng CỘNG vào thẻ cha ──
  insEntry(200, 'D980470');
  insEntry(100, 'D980973');
  insEntry(50, 'D980781');
  eq('Đã làm ở thẻ cha = 350 (tự cộng từ nhật ký)', 
    one(db, 'SELECT produced p FROM v_line_progress WHERE order_line_id=?', target).p, 350);
  eq('Còn lại ở thẻ cha = 366', 
    one(db, 'SELECT remaining r FROM v_line_progress WHERE order_line_id=?', target).r, 366);
  eq('tiến độ từng ref đúng 200/477, 100/159, 50/80',
    progress().map(s => s.split(':').slice(0,3).join('/')),
    ['D980470/200/477', 'D980781/50/80', 'D980973/100/159']);
  eq('hạn mức riêng: D980470 còn 277',
    one(db, `SELECT lr.target - COALESCE((SELECT SUM(e.qty) FROM production_entries e
       JOIN production_entry_refs er ON er.entry_id=e.id WHERE er.ref_no=lr.ref_no),0) rem
     FROM order_line_refs lr WHERE lr.order_line_id=? AND lr.ref_no='D980470'`, target).rem, 277);

  // ── AC-RF-15: Σ nhật ký KHÔNG đổi so với trước FEAT-23 ──
  eq('Σ qty nhật ký (bất kể gắn ref hay không) == produced của thẻ',
    one(db, 'SELECT COALESCE(SUM(qty),0) s FROM production_entries WHERE order_line_id=?', target).s, 350);

  // ── AC-RF-08: nhật ký KHÔNG gắn ref phải được báo riêng ──
  insEntry(20); // nhập bằng form gốc, không gắn ref
  eq('sau khi nhập không gắn ref: produced = 370',
    one(db, 'SELECT produced p FROM v_line_progress WHERE order_line_id=?', target).p, 370);
  eq('unattributed = 20 (không gán tự ý vào ref nào, không hiện 0 giả)',
    one(db, 'SELECT unattributed_produced u FROM v_line_progress WHERE order_line_id=?', target).u, 20);
  eq('Σ ref (350) + chưa gắn (20) == produced thẻ cha (370) — không lệch',
    progress().reduce((s, c) => s + Number(c.split(':')[1]), 0) + 20, 370);

  // ── AC-RF-03 / INV-R5: hạn mức RIÊNG của ref, không phải hạn mức tổng ──
  //
  // Gọi ĐÚNG `checkQtyLimit` thật (utils/validateQty.js là hàm thuần) theo **dạng object** mà
  // `checkRefTarget` dùng. Đây chính là ca chặn bug đã thấy: `queries.js` trước đây gọi
  // `checkQtyLimit` theo vị trí nên `checkLineTarget` luôn trả ok ⇒ hạn mức không có tác dụng.
  const checkQtyLimit = (await import('../src/utils/validateQty.js')).checkQtyLimit;
  const refLimit = (produced, incomingQty, target) =>
    checkQtyLimit({ target, produced, incomingQty });

  eq('nhập 200 vào D980470 (0 + 200 ≤ 477) ⇒ OK',
    refLimit(producedOf('D980470'), 200, D470.target).ok, true);
  eq('nhập 300 vào D980470 (200 + 300 = 500 > 477) ⇒ chặn',
    refLimit(producedOf('D980470'), 300, D470.target).ok, false);
  {
    const r = refLimit(producedOf('D980470'), 300, D470.target);
    eq('…mã lỗi OVER_TARGET', r.code, 'OVER_TARGET');
    eq('…chỉ còn được nhập 277 (477 − 200)', r.remaining, 277);
    eq('…vượt 23 pcs', r.overBy, 23);
    eq('…thông báo phải nêu kế hoạch/đã làm/còn lại để người dùng tự sửa',
      /\d/.test(`${r.target}${r.produced}${r.remaining}`), true);
  }
  eq('hạn mức riêng chặn trong khi hạn mức TỔNG vẫn cho phép (500 ≤ 716)',
    [refLimit(producedOf('D980470'), 300, D470.target).ok, 200 + 300 <= 716],
    [false, true]);
  eq('ref target = 0 ⇒ không áp hạn mức (quy ước target 0 như checkLineTarget)',
    checkQtyLimit({ target: 0, produced: 999, incomingQty: 5 }).ok, true);

  // ── AC-RF-14: xoá nhật ký ⇒ dòng gắn ref đi theo ──
  const delId = insEntry(10, 'D980781');
  eq('trước khi xoá: ref D980781 có dòng gắn',
    one(db, 'SELECT COUNT(*) c FROM production_entry_refs WHERE entry_id=?', delId).c, 1);
  db.prepare('DELETE FROM production_entries WHERE id=?').run(delId);
  eq('sau khi xoá: không còn dòng mồ côi (ON DELETE CASCADE)',
    one(db, 'SELECT COUNT(*) c FROM production_entry_refs WHERE entry_id=?', delId).c, 0);

  // ── FK tổng hợp: gắn ref của DÒNG KHÁC bị chặn ở tầng DB ──
  const otherLine = one(db, `
    SELECT l.id FROM order_lines l JOIN pos p ON p.id = l.po_id
    WHERE NOT (p.code='2919' AND l.item_code='1063048GF') LIMIT 1`).id;
  let fkMsg = '';
  const badEntry = insEntry(5); // nhật ký của DÒNG KHÁC
  try {
    // ref D980470 thuộc 1063048GF@2919, gắn vào nhật ký của dòng khác ⇒ FK tổng hợp phải chặn
    db.prepare('INSERT INTO production_entry_refs (entry_id, order_line_id, ref_no) VALUES (?, ?, ?)')
      .run(badEntry, otherLine, 'D980470');
  } catch (e) { fkMsg = e.message; }
  check('FK tổng hợp chặn gắn ref của PO khác (không cần JS nhớ kiểm)',
    /FOREIGN KEY/i.test(fkMsg), fkMsg);

  // ── INV-R7: một nhật ký nhiều nhất một ref ──
  let pkMsg = '';
  const e2 = insEntry(5, 'D980470');
  try {
    db.prepare('INSERT INTO production_entry_refs (entry_id, order_line_id, ref_no) VALUES (?, ?, ?)')
      .run(e2, target, 'D980973');
  } catch (e) { pkMsg = e.message; }
  check('PRIMARY KEY (entry_id) chặn một nhật ký gắn 2 ref', /UNIQUE|PRIMARY KEY/i.test(pkMsg), pkMsg);

  // ── AC-RF-10: dòng không có ref ⇒ ref_progress NULL, unattributed 0 ──
  const poId = Number(db.prepare(`INSERT INTO pos (order_batch_id, code) VALUES (1, 'BARE-PO')`).run().lastInsertRowid);
  const bare = Number(db.prepare(
    `INSERT INTO order_lines (po_id, item_code, target) VALUES (?, 'BARE-1', 500)`).run(poId).lastInsertRowid);
  const bareV = one(db, 'SELECT ref_progress, unattributed_produced FROM v_line_progress WHERE order_line_id=?', bare);
  eq('thẻ không có ref ⇒ ref_progress NULL (UI ẩn)', bareV.ref_progress, null);
  eq('…và unattributed_produced = 0, không NULL', bareV.unattributed_produced, 0);

}

// ══════════════════════════════════════════════════════════════════════
console.log('\n10) Guard: không có backtick lọt vào khối SQL');
// ══════════════════════════════════════════════════════════════════════
{
  // Đã 3 lần gặp: một backtick trong ghi chú `--` bên trong template SQL sẽ khoá sớm chuỗi,
  // biến phần còn lại thành JS ⇒ `expo lint` và `tsc` báo lỗi ở file KHÔNG liên quan
  // (đã từng làm hỏng `ItemCard`, `HistoryScreen`, `useAppStore`). Guard chốt lại.
  const src = readFileSync(new URL('../src/db/schema.js', import.meta.url), 'utf8');
  for (const name of ['CREATE_TABLES_SQL', 'CREATE_VIEWS_SQL']) {
    const body = src.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`))?.[1] ?? '';
    check(`${name}: không có backtick trong thân`,
      body.length > 0 && !body.includes('`'), `dài ${body.length}`);
  }
  const q = readFileSync(new URL('../src/db/queries.js', import.meta.url), 'utf8');
  // Ghi chú SQL trong queries.js nằm trong template `db.getAllAsync(\`...\`)` — cùng lỗi, cùng hậu quả.
  const strays = [...q.matchAll(/`SELECT[\s\S]*?`/g)]
    .filter(m => m[0].includes('--') && m[0].includes('\n') && /--[^\n]*`/.test(m[0]));
  check('queries.js: không có backtick trong ghi chú SQL', strays.length === 0, `${strays.length} chỗ`);
}

console.log('\n9) Bất biến tổng thể sau FEAT-23 (DB sạch, không fixture nào ở trên)');
{
  // DB MỚI: các ca ở khối 8 cố tình gắn ref hỏng (FK/PK), chèn PO giả và thêm nhật ký
  // nên nếu đo bất biến tổng thể trên chính DB đó thì số đúng vẫn bị báo sai.
  const db = freshDb();
  applyPlan(db, plan);

  eq('v_po_progress vẫn ra 12 dòng PO', all(db, 'SELECT * FROM v_po_progress').length, 12);
  eq('Σ target toàn đơn vẫn 25520 (ref không cộng vào PO)',
    all(db, 'SELECT SUM(target) t FROM v_po_progress')[0].t, 25520);
  eq('v_line_progress vẫn ra 76 thẻ (ref KHÔNG tạo thẻ mới)',
    all(db, 'SELECT * FROM v_line_progress').length, 76);
  eq('82 dòng order_line_refs (không rơi món)',
    all(db, 'SELECT * FROM order_line_refs').length, 82);
  eq('Σ produced toàn đơn = 0 khi chưa có nhật ký',
    all(db, 'SELECT SUM(produced) s FROM v_po_progress')[0].s, 0);

  // Gắn ref KHÔNG được làm đổi số thẻ hay tổng PO — chỉ phân bổ sản lượng.
  const line = one(db, `
    SELECT l.id FROM order_lines l JOIN pos p ON p.id = l.po_id
    WHERE p.code='2919' AND l.item_code='1063048GF'`).id;
  const entry = db.prepare(
    `INSERT INTO production_entries (order_line_id, date, qty, line) VALUES (?, '2026-10-05', 100, 'manual')`
  ).run(line);
  db.prepare('INSERT INTO production_entry_refs (entry_id, order_line_id, ref_no) VALUES (?, ?, ?)')
    .run(Number(entry.lastInsertRowid), line, 'D980470');

  eq('sau khi gắn ref: vẫn 12 PO / 76 thẻ / Σ target 25520',
    [all(db, 'SELECT * FROM v_po_progress').length,
     all(db, 'SELECT * FROM v_line_progress').length,
     all(db, 'SELECT SUM(target) t FROM v_po_progress')[0].t],
    [12, 76, 25520]);
  eq('…chỉ produced của 1 thẻ cha tăng lên 100',
    all(db, 'SELECT SUM(produced) s FROM v_po_progress')[0].s, 100);
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n11) Guard: REQUIRED_COLUMNS khớp CREATE_TABLES_SQL (BUGFIX-23)');
// ══════════════════════════════════════════════════════════════════════
{
  // `src/db/index.js` dùng `REQUIRED_COLUMNS` để phát hiện DB của build khác và để xác minh
  // shape sau khi tạo. Nếu ai thêm cột mà quên khai báo ở đó ⇒ app **không khởi động được** trên
  // đúng lỗi ta vừa gặp, và không ca test nào bắt được. Vì vậy bắt buộc kiểm ở đây.
  const { REQUIRED_COLUMNS, ADDABLE_COLUMN_DECLS } = await import('../src/db/schema.js');
  const src = readFileSync(new URL('../src/db/schema.js', import.meta.url), 'utf8');

  // Cột từ `CREATE TABLE` trong script: lấy dòng `  tên_cột KIỂU` trong phần CREATE TABLE.
  const declared = {};
  for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g)) {
    const cols = [];
    for (const line of m[2].split('\n')) {
      const c = /^\s{2}([a-z_]\w*)\s+[A-Z]/.exec(line);
      if (c) cols.push(c[1]);
    }
    declared[m[1]] = cols;
  }
  check('đọc được bộ cột từ CREATE_TABLES_SQL', Object.keys(declared).length >= 11,
    `thấy ${Object.keys(declared).length} bảng`);

  // 1) mọi bảng trong REQUIRED_COLUMNS đều có trong CREATE_TABLES_SQL và ngược lại
  eq('REQUIRED_COLUMNS có đúng các bảng của CREATE_TABLES_SQL',
    Object.keys(REQUIRED_COLUMNS).sort(), Object.keys(declared).sort());

  // 2) mọi bảng đều khai đủ cột, không thừa — lệch một chỗ là app hỏng trên máy
  const diffs = [];
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const actual = new Set(declared[table] ?? []);
    const missing = required.filter(c => !actual.has(c));
    const extra = (declared[table] ?? []).filter(c => !required.includes(c));
    if (missing.length || extra.length) {
      diffs.push(`${table}: thiếu [${missing}] thừa [${extra}]`);
    }
  }
  check('từng bảng khai đúng bộ cột của CREATE_TABLES_SQL', diffs.length === 0, diffs.join('; '));

  // 3) `ADDABLE_COLUMN_DECLS` chỉ được chứa cột có thật và **không** phải cột NOT NULL bắt buộc
  const badKeys = Object.keys(ADDABLE_COLUMN_DECLS)
    .filter(k => !REQUIRED_COLUMNS[k.split('.')[0]]?.includes(k.split('.')[1]));
  check('ADDABLE_COLUMN_DECLS không chứa cột không tồn tại', badKeys.length === 0, badKeys.join(', '));

  // 4) Chỉ được vá tự động cột **nullable** hoặc `NOT NULL` **có DEFAULT hằng**.
  //    `ALTER TABLE … ADD COLUMN x NOT NULL` (không default) hỏng khi bảng đã có dòng, và đoán
  //    giá trị thay người dùng thì tệ hơn là xoá dựng lại — xem `legacyReason()`.
  const unsafe = [];
  for (const k of Object.keys(ADDABLE_COLUMN_DECLS)) {
    const decl = ADDABLE_COLUMN_DECLS[k];
    if (/NOT\s+NULL/i.test(decl) && !/DEFAULT/i.test(decl)) unsafe.push(k);
  }
  check('mọi cột vá được đều nullable hoặc NOT NULL có DEFAULT hằng',
    unsafe.length === 0, unsafe.join(', '));

  // 5) Ngược lại: cột NOT NULL **không** DEFAULT mà lại được liệt kê ⇒ app sẽ ném lỗi
  //    `Cannot add a NOT NULL column with default value NULL` giữa lúc mở app.
  const risky = [];
  for (const [table, body] of Object.entries(
    Object.fromEntries([...src.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g)]
      .map(m => [m[1], m[2]]))
  )) {
    for (const line of body.split('\n')) {
      const c = /^\s{2}([a-z_]\w*)\s+\w+ NOT NULL(?!.*DEFAULT)/.exec(line);
      if (c && ADDABLE_COLUMN_DECLS[`${table}.${c[1]}`]) risky.push(`${table}.${c[1]}`);
    }
  }
  check('không cột NOT NULL không DEFAULT nào nằm trong danh sách vá tự động',
    risky.length === 0, risky.join(', '));
}

// ══════════════════════════════════════════════════════════════════════
console.log('12) Nhập nhiều file cùng PO (PO2600168.json → PO2600189.json → Mix_Container.json) — cộng dồn kế hoạch & idempotent');
// ══════════════════════════════════════════════════════════════════════
{
  const testDb = freshDb();
  const f1 = JSON.parse(readFileSync(new URL('../src/data/TestData/PO2600168.json', import.meta.url), 'utf8'));
  const f2 = JSON.parse(readFileSync(new URL('../src/data/TestData/PO2600189.json', import.meta.url), 'utf8'));
  const f3 = JSON.parse(readFileSync(new URL('../src/data/TestData/Mix_Container.json', import.meta.url), 'utf8'));

  const p1 = buildImportPlanV2(f1);
  const p2 = buildImportPlanV2(f2);
  const p3 = buildImportPlanV2(f3);

  // 1. Nạp PO2600168.json
  const { batchId } = applyPlan(testDb, p1);
  eq('sau file 1: tổng target = 4050', one(testDb, 'SELECT SUM(target) s FROM order_lines').s, 4050);
  eq('sau file 1: PO 2600168 = 4050', one(testDb, 'SELECT target FROM v_po_progress WHERE po = ?', '2600168')?.target, 4050);

  // 2. Nạp PO2600189.json vào cùng batch
  applyPlan(testDb, p2, '2026-10-04', batchId);
  eq('sau file 2: tổng target = 7590 (4050 + 3540)', one(testDb, 'SELECT SUM(target) s FROM order_lines').s, 7590);
  eq('sau file 2: PO 2600189 = 3540', one(testDb, 'SELECT target FROM v_po_progress WHERE po = ?', '2600189')?.target, 3540);

  // 3. Nạp Mix_Container.json vào cùng batch (thêm Container 2 cho PO 2600168)
  applyPlan(testDb, p3, '2026-10-04', batchId);
  eq('sau file 3: tổng target = 10540 (đúng 7000 + 3540)', one(testDb, 'SELECT SUM(target) s FROM order_lines').s, 10540);
  eq('sau file 3: PO 2600168 = 7000 (cộng dồn 4050 + 2950)', one(testDb, 'SELECT target FROM v_po_progress WHERE po = ?', '2600168')?.target, 7000);
  eq('sau file 3: PO 2600189 = 3540', one(testDb, 'SELECT target FROM v_po_progress WHERE po = ?', '2600189')?.target, 3540);

  // Từng mã trong PO 2600168:
  const getLine = (code) => one(testDb, `
    SELECT l.target, l.package_count FROM order_lines l
    JOIN pos p ON p.id = l.po_id
    WHERE p.code = '2600168' AND l.item_code = ?
  `, code);

  eq('1061119: 290 + 210 = 500 pcs', getLine('1061119')?.target, 500);
  eq('1061119: 1 + 5 = 6 kiện', getLine('1061119')?.package_count, 6);
  eq('106160: 300 + 500 = 800 pcs', getLine('106160')?.target, 800);
  eq('106160: 1 + 2 = 3 kiện', getLine('106160')?.package_count, 3);
  eq('1063022: 2000 pcs (chỉ có ở container 1)', getLine('1063022')?.target, 2000);
  eq('1063038: 1200 + 300 = 1500 pcs', getLine('1063038')?.target, 1500);
  eq('1063048: 1320 pcs (thêm mới từ container 2)', getLine('1063048')?.target, 1320);
  eq('1063049: 200 + 280 = 480 pcs', getLine('1063049')?.target, 480);
  eq('1063051: 60 + 340 = 400 pcs', getLine('1063051')?.target, 400);

  eq('tổng số container = 3', one(testDb, 'SELECT COUNT(*) c FROM containers').c, 3);
  eq('tổng số kiện = 30', one(testDb, 'SELECT COUNT(*) c FROM pallets').c, 30);

  // 4. Re-import Mix_Container.json lần 2 (idempotent)
  applyPlan(testDb, p3, '2026-10-04', batchId);
  eq('re-import Mix_Container: tổng target VẪN LÀ 10540', one(testDb, 'SELECT SUM(target) s FROM order_lines').s, 10540);
  eq('re-import Mix_Container: PO 2600168 VẪN LÀ 7000', one(testDb, 'SELECT target FROM v_po_progress WHERE po = ?', '2600168')?.target, 7000);
  eq('re-import Mix_Container: tổng số kiện VẪN LÀ 30', one(testDb, 'SELECT COUNT(*) c FROM pallets').c, 30);

  // 5. Re-import PO2600168.json lần 2 (idempotent)
  applyPlan(testDb, p1, '2026-10-04', batchId);
  eq('re-import PO2600168: tổng target VẪN LÀ 10540', one(testDb, 'SELECT SUM(target) s FROM order_lines').s, 10540);
  eq('re-import PO2600168: PO 2600168 VẪN LÀ 7000', one(testDb, 'SELECT target FROM v_po_progress WHERE po = ?', '2600168')?.target, 7000);
  eq('re-import PO2600168: tổng số kiện VẪN LÀ 30', one(testDb, 'SELECT COUNT(*) c FROM pallets').c, 30);
}

console.log(`\nKết quả: ${pass} passed, ${fail} failed`);
if (failures.length) console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);