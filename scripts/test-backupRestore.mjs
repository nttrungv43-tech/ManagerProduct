// scripts/test-backupRestore.mjs
// Kiểm thử trọn vẹn quy trình Sao lưu và Phục hồi cơ sở dữ liệu (JSON)
// sử dụng SQLite thật (`node:sqlite`) và dữ liệu thực tế Dmac.json.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { buildImportPlanV2 } from '../src/utils/packingV2Import.js';
import {
  buildBackupPayload,
  validateBackupPayload,
  formatBackupSummary,
  BACKUP_FORMAT_ID,
} from '../src/utils/backupFormat.js';

let pass = 0;
let fail = 0;
const failures = [];

const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(`${label}\n      nhận: ${JSON.stringify(actual)}\n      cần : ${JSON.stringify(expected)}`);
    console.log(`  ✗ ${label} — ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
  }
};

const check = (label, cond, detail = '') => eq(label + (cond ? '' : ` (${detail})`), Boolean(cond), true);

console.log('--- test:backupRestore ---');

// Đọc SQL tạo schema
const src = readFileSync(new URL('../src/db/schema.js', import.meta.url), 'utf8');
const sqlOf = (name) => {
  const m = src.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`));
  if (!m) throw new Error(`không tìm thấy ${name} trong schema.js`);
  return m[1];
};

function freshDb() {
  const d = new DatabaseSync(':memory:');
  d.exec('PRAGMA foreign_keys = ON');
  d.exec(sqlOf('CREATE_TABLES_SQL'));
  d.exec(sqlOf('CREATE_VIEWS_SQL'));
  return d;
}

// Nạp dữ liệu thực tế Dmac.json
const dmac = JSON.parse(readFileSync(new URL('../src/data/Dmac.json', import.meta.url), 'utf8'));
const plan = buildImportPlanV2(dmac);

function applyPlan(d, p, importedAt = '2026-10-09') {
  const b = d.prepare(
    `INSERT INTO order_batches (status, source_file, imported_at) VALUES ('active', 'Dmac.json', ?)`
  ).run(importedAt);
  const batchId = Number(b.lastInsertRowid);

  const insPo = d.prepare(
    `INSERT INTO pos (order_batch_id, code, consignee, address, destination, invoice_no) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const posIds = [];
  for (const po of p.pos) {
    insPo.run(batchId, po.code, po.consignee ?? null, po.address ?? null, po.destination ?? null, po.invoice_no ?? null);
    const row = d.prepare(`SELECT id FROM pos WHERE order_batch_id = ? AND code = ?`).get(batchId, po.code);
    posIds.push(row.id);
  }

  const insLine = d.prepare(
    `INSERT INTO order_lines (po_id, item_code, target, nw_kg, gw_kg, volume_cbm, package_count) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const lineIds = [];
  for (const l of p.lines) {
    const poId = posIds[l.poIdx];
    insLine.run(poId, l.itemCode, l.target, l.nw_kg ?? null, l.gw_kg ?? null, l.volume_cbm ?? null, l.package_count ?? null);
    const row = d.prepare(`SELECT id FROM order_lines WHERE po_id = ? AND item_code = ?`).get(poId, l.itemCode);
    lineIds.push(row.id);
  }

  const insRef = d.prepare(`INSERT OR IGNORE INTO item_refs (order_batch_id, item_code, ref_no) VALUES (?, ?, ?)`);
  for (const r of p.refs) insRef.run(batchId, r.itemCode, r.refNo);

  const insLineRef = d.prepare(`INSERT INTO order_line_refs (order_line_id, ref_no, target) VALUES (?, ?, ?)`);
  for (const lr of p.lineRefs) {
    const li = p.lines.findIndex(l => l.poIdx === lr.poIdx && l.itemCode === lr.itemCode);
    if (li < 0) continue;
    insLineRef.run(lineIds[li], lr.refNo, lr.target);
  }

  const containerIds = [];
  for (const c of p.containers) {
    const poId = posIds[c.poIdx];
    const r = d.prepare(
      `INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, ?, ?)`
    ).run(batchId, poId, c.containerNo, c.sealNo ?? null);
    containerIds.push(Number(r.lastInsertRowid));
  }

  const insPal = d.prepare(
    `INSERT INTO pallets (container_id, po_id, pallet_no, c_no, is_mixed,
                          length_m, width_m, height_m, volume_cbm, nw_kg, gw_kg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const palletIds = p.pallets.map(x =>
    Number(insPal.run(
      containerIds[x.containerIdx], posIds[x.poIdx], x.palletNo, x.cNo ?? null, x.isMixed ? 1 : 0,
      x.length_m ?? null, x.width_m ?? null, x.height_m ?? null, x.volume_cbm ?? null, x.nw_kg ?? null, x.gw_kg ?? null
    ).lastInsertRowid));

  const insPl = d.prepare(`INSERT INTO pallet_lines (pallet_id, order_line_id, qty) VALUES (?, ?, ?)`);
  for (const pl of p.palletLines) insPl.run(palletIds[pl.palletIdx], lineIds[pl.lineIdx], pl.qty);

  return { batchId, posIds, lineIds, containerIds, palletIds };
}

// ── 1. Xuất sao lưu từ DB gốc ───────────────────────────────────────────────
console.log('1) Xuất dữ liệu từ DB nguồn ra JSON sao lưu');
const db1 = freshDb();
const { batchId, lineIds } = applyPlan(db1, plan);

// Thêm một số nhật ký sản xuất và tick kiện
const sampleLineId = lineIds[0];
const entry1 = db1.prepare(
  `INSERT INTO production_entries (order_line_id, date, qty, line, defect_qty) VALUES (?, '2026-10-09', 150, 'manual', 5)`
).run(sampleLineId);
const entryId1 = Number(entry1.lastInsertRowid);
db1.prepare(`INSERT INTO production_defects (entry_id, type) VALUES (?, 'yellow')`).run(entryId1);

// Tick thử 2 kiện đầu tiên
db1.prepare(`UPDATE pallet_lines SET done = 1 WHERE id IN (1, 2)`).run();

// Lấy dữ liệu từng bảng để tạo payload sao lưu
function exportDb(d) {
  const tables = [
    'order_batches', 'pos', 'order_lines', 'item_refs', 'order_line_refs',
    'production_entries', 'production_defects', 'production_entry_refs',
    'containers', 'pallets', 'pallet_lines',
  ];
  const obj = {};
  for (const t of tables) {
    obj[t] = d.prepare(`SELECT * FROM ${t} ORDER BY rowid ASC`).all();
  }
  return buildBackupPayload(obj);
}

const backupJson = exportDb(db1);
eq('format chuẩn', backupJson.format, BACKUP_FORMAT_ID);
eq('schema_version chuẩn', backupJson.schema_version, 3);
eq('số đơn hàng trong metadata', backupJson.metadata.total_batches, 1);
eq('số PO trong metadata', backupJson.metadata.total_pos, 12);
eq('số dòng mã hàng trong metadata', backupJson.metadata.total_lines, 76);
eq('số nhật ký trong metadata', backupJson.metadata.total_entries, 1);
eq('số container trong metadata', backupJson.metadata.total_containers, 12);
eq('số kiện trong metadata', backupJson.metadata.total_pallets, 220);

const valRes = validateBackupPayload(backupJson);
check('validateBackupPayload xác nhận hợp lệ', valRes.valid);

const summary = formatBackupSummary(backupJson);
check('formatBackupSummary có chứa thông tin đơn hàng', summary.includes('Đơn hàng: 1'));
check('formatBackupSummary có chứa 12 PO', summary.includes('Mã PO: 12'));
check('formatBackupSummary có chứa 76 dòng', summary.includes('Dòng mã hàng: 76'));

// ── 2. Phục hồi vào DB mới hoàn toàn ─────────────────────────────────────────
console.log('2) Phục hồi dữ liệu từ JSON vào DB mới');
const db2 = freshDb();

function restoreDb(d, payload) {
  const v = validateBackupPayload(payload);
  if (!v.valid) throw new Error(v.error);
  const data = v.data;

  d.exec('PRAGMA foreign_keys = OFF');
  d.exec(`
    DELETE FROM pallet_lines;
    DELETE FROM pallets;
    DELETE FROM containers;
    DELETE FROM production_entry_refs;
    DELETE FROM production_defects;
    DELETE FROM production_entries;
    DELETE FROM order_line_refs;
    DELETE FROM item_refs;
    DELETE FROM order_lines;
    DELETE FROM pos;
    DELETE FROM order_batches;
  `);

  for (const b of data.order_batches) {
    d.prepare(
      `INSERT INTO order_batches (id, status, finished_date, source_file, mark, imported_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(b.id, b.status, b.finished_date ?? null, b.source_file ?? null, b.mark ?? null, b.imported_at);
  }

  for (const p of data.pos) {
    d.prepare(
      `INSERT INTO pos (id, order_batch_id, code, consignee, address, destination, invoice_no) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(p.id, p.order_batch_id, p.code, p.consignee ?? null, p.address ?? null, p.destination ?? null, p.invoice_no ?? null);
  }

  for (const l of data.order_lines) {
    d.prepare(
      `INSERT INTO order_lines (id, po_id, item_code, target, nw_kg, gw_kg, volume_cbm, package_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(l.id, l.po_id, l.item_code, l.target ?? 0, l.nw_kg ?? null, l.gw_kg ?? null, l.volume_cbm ?? null, l.package_count ?? null);
  }

  for (const r of data.item_refs) {
    d.prepare(
      `INSERT INTO item_refs (id, order_batch_id, item_code, ref_no) VALUES (?, ?, ?, ?)`
    ).run(r.id, r.order_batch_id, r.item_code, r.ref_no);
  }

  for (const olr of data.order_line_refs) {
    d.prepare(
      `INSERT INTO order_line_refs (order_line_id, ref_no, target) VALUES (?, ?, ?)`
    ).run(olr.order_line_id, olr.ref_no, olr.target ?? 0);
  }

  for (const pe of data.production_entries) {
    d.prepare(
      `INSERT INTO production_entries (id, order_line_id, date, qty, line, defect_qty) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(pe.id, pe.order_line_id, pe.date, pe.qty, pe.line ?? 'manual', pe.defect_qty ?? 0);
  }

  for (const pd of data.production_defects) {
    d.prepare(
      `INSERT INTO production_defects (entry_id, type) VALUES (?, ?)`
    ).run(pd.entry_id, pd.type);
  }

  for (const per of data.production_entry_refs) {
    d.prepare(
      `INSERT INTO production_entry_refs (entry_id, order_line_id, ref_no) VALUES (?, ?, ?)`
    ).run(per.entry_id, per.order_line_id, per.ref_no);
  }

  for (const c of data.containers) {
    d.prepare(
      `INSERT INTO containers (id, order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, ?, ?, ?)`
    ).run(c.id, c.order_batch_id, c.po_id, c.container_no, c.seal_no ?? null);
  }

  for (const p of data.pallets) {
    d.prepare(
      `INSERT INTO pallets (id, container_id, po_id, pallet_no, c_no, is_mixed, length_m, width_m, height_m, volume_cbm, nw_kg, gw_kg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      p.id, p.container_id, p.po_id, p.pallet_no, p.c_no ?? null,
      p.is_mixed ?? 0, p.length_m ?? null, p.width_m ?? null, p.height_m ?? null,
      p.volume_cbm ?? null, p.nw_kg ?? null, p.gw_kg ?? null
    );
  }

  for (const pl of data.pallet_lines) {
    d.prepare(
      `INSERT INTO pallet_lines (id, pallet_id, order_line_id, qty, done) VALUES (?, ?, ?, ?, ?)`
    ).run(pl.id, pl.pallet_id, pl.order_line_id, pl.qty ?? 0, pl.done ?? 0);
  }

  d.exec('PRAGMA foreign_keys = ON');
  const violations = d.prepare('PRAGMA foreign_key_check').all();
  if (violations.length > 0) {
    throw new Error(`Vi phạm khoá ngoại: ${violations.length} lỗi`);
  }

  const actives = d.prepare(`SELECT id FROM order_batches WHERE status = 'active'`).all();
  if (actives.length === 0) {
    d.prepare(`INSERT INTO order_batches (status, imported_at) VALUES ('active', '2026-10-09')`).run();
  }
}

restoreDb(db2, backupJson);

// Kiểm tra so sánh tính toàn vẹn 1:1 giữa db1 và db2
const tables = [
  'order_batches', 'pos', 'order_lines', 'item_refs', 'order_line_refs',
  'production_entries', 'production_defects', 'production_entry_refs',
  'containers', 'pallets', 'pallet_lines',
];

for (const t of tables) {
  const rows1 = db1.prepare(`SELECT * FROM ${t} ORDER BY rowid ASC`).all();
  const rows2 = db2.prepare(`SELECT * FROM ${t} ORDER BY rowid ASC`).all();
  eq(`Bảng ${t} sau phục hồi khớp 100% với dữ liệu nguồn`, rows2, rows1);
}

// Kiểm tra views
const viewLines1 = db1.prepare(`SELECT * FROM v_line_progress ORDER BY order_line_id ASC`).all();
const viewLines2 = db2.prepare(`SELECT * FROM v_line_progress ORDER BY order_line_id ASC`).all();
eq('View v_line_progress khớp 100%', viewLines2, viewLines1);

const viewPo1 = db1.prepare(`SELECT * FROM v_po_progress ORDER BY po_id ASC`).all();
const viewPo2 = db2.prepare(`SELECT * FROM v_po_progress ORDER BY po_id ASC`).all();
eq('View v_po_progress khớp 100%', viewPo2, viewPo1);

// Kiểm tra trạng thái tick của kiện
const donePallets = db2.prepare(`SELECT id, done FROM pallet_lines WHERE done = 1`).all();
eq('Trạng thái tick pallet_lines được bảo toàn', donePallets.length, 2);

// ── 3. Phục hồi đơn có toàn bộ archived: phải tạo 1 active đơn theo INV-B1 ──
console.log('3) Bảo đảm bất biến INV-B1 khi phục hồi file chỉ có đơn archived');
const archivedBackup = JSON.parse(JSON.stringify(backupJson));
archivedBackup.data.order_batches[0].status = 'archived';

const db3 = freshDb();
restoreDb(db3, archivedBackup);
const activeBatchesInDb3 = db3.prepare(`SELECT * FROM order_batches WHERE status = 'active'`).all();
eq('Tự động tạo đúng 1 đơn active khi tất cả đơn trong backup là archived', activeBatchesInDb3.length, 1);

// ── 4. Ràng buộc toàn vẹn: nếu dữ liệu sao lưu bị cố tình làm gãy FK ─────────
console.log('4) Chặn phục hồi nếu dữ liệu sao lưu bị gãy khoá ngoại');
const brokenBackup = JSON.parse(JSON.stringify(backupJson));
brokenBackup.data.order_lines[0].po_id = 999999; // PO không tồn tại
const db4 = freshDb();
let threwFkError = false;
try {
  restoreDb(db4, brokenBackup);
} catch {
  threwFkError = true;
}
check('foreign_key_check phát hiện và ném lỗi khi dữ liệu gãy FK', threwFkError);

console.log(`\nKết quả test-backupRestore: ${pass} passed, ${fail} failed\n`);
if (failures.length) {
  console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
  process.exit(1);
}
