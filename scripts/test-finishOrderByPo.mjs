// scripts/test-finishOrderByPo.mjs
// FEAT-24 — Kiểm tra chức năng hoàn tất đơn hàng theo mã PO được chọn.
//
// Chạy: node --no-warnings scripts/test-finishOrderByPo.mjs
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

// Nạp SQL từ schema.js
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

  const insContainer = d.prepare(
    `INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, ?, ?)`
  );
  const containerIds = p.containers.map(c =>
    Number(insContainer.run(batchId, posIds[c.poIdx], c.containerNo, c.sealNo).lastInsertRowid));

  const insPallet = d.prepare(
    `INSERT INTO pallets (container_id, po_id, pallet_no, c_no, is_mixed, length_m, width_m, height_m, volume_cbm, nw_kg, gw_kg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const palletIds = p.pallets.map(pa =>
    Number(insPallet.run(
      containerIds[pa.containerIdx], posIds[pa.poIdx], pa.palletNo, pa.cNo, pa.isMixed ? 1 : 0,
      pa.length_m, pa.width_m, pa.height_m, pa.volume_cbm, pa.nw_kg, pa.gw_kg,
    ).lastInsertRowid));

  const insPalletLine = d.prepare(
    `INSERT INTO pallet_lines (pallet_id, order_line_id, qty, done) VALUES (?, ?, ?, 0)`
  );
  p.palletLines.forEach(pl => {
    insPalletLine.run(palletIds[pl.palletIdx], lineIds[pl.lineIdx], pl.qty);
  });

  return { batchId, posIds, lineIds };
}

// ── Bắt đầu kiểm thử ──────────────────────────────────────────────────────────
console.log('\n--- FEAT-24: Hoàn tất đơn hàng theo mã PO được chọn ---');

const db = freshDb();
const { batchId } = applyPlan(db, plan);

// 1. Kiểm tra ban đầu: batch active có 12 PO
const initialPos = db.prepare('SELECT code FROM pos WHERE order_batch_id = ?').all(batchId);
eq('Batch active ban đầu có 12 PO', initialPos.length, 12);

// Giả lập logic finishOrder(poCodes) giống queries.js
function runFinishOrder(d, poCodes = null) {
  const active = d.prepare(
    `SELECT id, source_file, mark FROM order_batches WHERE status = 'active' ORDER BY id DESC LIMIT 1`
  ).get();
  if (!active) return { ok: false, error: { code: 'NO_ACTIVE_BATCH' } };

  const allPos = d.prepare(`SELECT id, code FROM pos WHERE order_batch_id = ?`).all(active.id);
  if (allPos.length === 0) {
    d.prepare(`UPDATE order_batches SET status='archived', finished_date='2026-10-07' WHERE id = ?`).run(active.id);
    const r = d.prepare(`INSERT INTO order_batches (status, imported_at) VALUES ('active', '2026-10-07')`).run();
    return { ok: true, id: Number(r.lastInsertRowid), partial: false };
  }

  const selectedCodes = Array.isArray(poCodes) ? poCodes.filter(Boolean) : null;
  const isAll = !selectedCodes || selectedCodes.length === 0 || selectedCodes.length >= allPos.length;

  if (isAll) {
    d.prepare(`UPDATE order_batches SET status='archived', finished_date='2026-10-07' WHERE id = ?`).run(active.id);
    const r = d.prepare(`INSERT INTO order_batches (status, imported_at) VALUES ('active', '2026-10-07')`).run();
    return { ok: true, id: Number(r.lastInsertRowid), partial: false };
  }

  const selectedPos = allPos.filter(p => selectedCodes.includes(p.code));
  if (selectedPos.length === 0) {
    return { ok: false, error: { code: 'NO_MATCHING_POS' } };
  }

  const today = '2026-10-07';
  const poListStr = selectedPos.map(p => p.code).join(', ');
  const newMark = active.mark ? `${active.mark} (${poListStr})` : `PO: ${poListStr}`;

  const res = d.prepare(
    `INSERT INTO order_batches (status, finished_date, source_file, mark, imported_at)
     VALUES ('archived', ?, ?, ?, ?)`
  ).run(today, active.source_file || null, newMark, today);
  const archivedBatchId = Number(res.lastInsertRowid);
  const selectedPoIds = selectedPos.map(p => p.id);
  const placeholders = selectedPoIds.map(() => '?').join(',');

  d.prepare(`UPDATE pos SET order_batch_id = ? WHERE id IN (${placeholders})`).run(archivedBatchId, ...selectedPoIds);
  d.prepare(`UPDATE containers SET order_batch_id = ? WHERE po_id IN (${placeholders})`).run(archivedBatchId, ...selectedPoIds);

  return {
    ok: true,
    id: active.id,
    archivedBatchId,
    partial: true,
    completedPos: selectedPos.map(p => p.code),
  };
}

// 2. Hoàn tất PO '2919'
const res1 = runFinishOrder(db, ['2919']);
check('finishOrder PO 2919 thành công', res1.ok);
check('res1 là partial = true', res1.partial === true);
eq('res1.completedPos gồm 2919', res1.completedPos, ['2919']);

// Kiểm tra batch active sau khi tách PO 2919:
const activePosAfter = db.prepare('SELECT code FROM pos WHERE order_batch_id = ?').all(batchId);
eq('Batch active chỉ còn lại 11 PO', activePosAfter.length, 11);
check('PO 2919 không còn ở batch active', !activePosAfter.some(p => p.code === '2919'));

// Kiểm tra batch archived mới:
const archivedPos = db.prepare('SELECT code FROM pos WHERE order_batch_id = ?').all(res1.archivedBatchId);
eq('Batch archived có đúng 1 PO', archivedPos.length, 1);
eq('Batch archived đúng là PO 2919', archivedPos[0].code, '2919');

// Kiểm tra container của PO 2919:
const archivedContainers = db.prepare('SELECT container_no FROM containers WHERE order_batch_id = ?').all(res1.archivedBatchId);
eq('Container của PO 2919 đã chuyển sang archived batch', archivedContainers.length, 1);
eq('Tên container đúng là MCCU1123643', archivedContainers[0].container_no, 'MCCU1123643');

// Kiểm tra container của các PO còn lại ở batch active:
const activeContainers = db.prepare('SELECT container_no FROM containers WHERE order_batch_id = ?').all(batchId);
eq('Batch active còn đúng 11 container', activeContainers.length, 11);

// 3. Hoàn tất tiếp 2 PO nữa: '2920' và '2921'
const res2 = runFinishOrder(db, ['2920', '2921']);
check('Hoàn tất tiếp PO 2920, 2921 thành công', res2.ok);
eq('Batch active nay còn lại 9 PO', db.prepare('SELECT count(*) as c FROM pos WHERE order_batch_id = ?').get(batchId).c, 9);

// 4. Kiểm tra view v_po_progress trên batch active:
const poProgressActive = db.prepare('SELECT po FROM v_po_progress WHERE order_batch_id = ?').all(batchId);
eq('v_po_progress batch active chỉ trả về 9 PO', poProgressActive.length, 9);
check('2919 không có trong v_po_progress active', !poProgressActive.some(r => r.po === '2919'));
check('2920 không có trong v_po_progress active', !poProgressActive.some(r => r.po === '2920'));
check('2921 không có trong v_po_progress active', !poProgressActive.some(r => r.po === '2921'));

// 5. Kiểm tra view v_po_progress trên batch archived:
const poProgressArchived = db.prepare('SELECT po FROM v_po_progress WHERE order_batch_id = ?').all(res1.archivedBatchId);
eq('v_po_progress batch archived 1 trả đúng PO 2919', poProgressArchived.map(r => r.po), ['2919']);

// 6. Hoàn tất toàn bộ các PO còn lại
const remainingPos = db.prepare('SELECT code FROM pos WHERE order_batch_id = ?').all(batchId).map(p => p.code);
const resAll = runFinishOrder(db, remainingPos);
check('Hoàn tất tất cả các PO còn lại trả partial = false', resAll.partial === false);

// Kiểm tra batch active mới:
const newActive = db.prepare("SELECT id, status FROM order_batches WHERE status = 'active'").get();
check('Có đúng 1 batch active mới', !!newActive);
check('Batch active mới có ID khác batch cũ', newActive.id !== batchId);
const newActivePos = db.prepare('SELECT count(*) as c FROM pos WHERE order_batch_id = ?').get(newActive.id).c;
eq('Batch active mới hoàn toàn trắng (0 PO)', newActivePos, 0);

// 7. Bất biến INV-B1: Luôn có đúng 1 dòng order_batches.status='active'
const totalActive = db.prepare("SELECT count(*) as c FROM order_batches WHERE status = 'active'").get().c;
eq('INV-B1: Luôn có đúng 1 batch active', totalActive, 1);

console.log(`\nKết quả test-finishOrderByPo: ${pass} passed, ${fail} failed`);
if (failures.length) console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
