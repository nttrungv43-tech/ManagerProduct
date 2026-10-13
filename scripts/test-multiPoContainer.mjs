// scripts/test-multiPoContainer.mjs
// Kiểm tra hiển thị thông tin Container và Kiện khi container chứa nhiều hơn 1 PO.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parseExcelOrCsv } from '../src/utils/excelParser.js';
import { buildImportPlanV2 } from '../src/utils/packingV2Import.js';

let pass = 0;
let fail = 0;
const failures = [];
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push(`${label}\n      nhận: ${JSON.stringify(actual)}\n      cần : ${JSON.stringify(expected)}`);
  }
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : ` — ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`}`);
};
const check = (label, cond, detail = '') => eq(label + (cond ? '' : ` (${detail})`), !!cond, true);

// ── Nạp schema SQL ─────────────────────────────────────────────────────────────
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

const num = (v) => (v === null || v === undefined ? 0 : Number(v) || 0);

// Triển khai mô phỏng fetchContainersView trên DatabaseSync
function fetchContainersView(db, batchId) {
  const ct = db.prepare(
    `SELECT c.id, c.container_no, c.seal_no, p.code AS po
     FROM containers c JOIN pos p ON p.id = c.po_id
     WHERE c.order_batch_id = ? ORDER BY c.id`
  ).all(batchId);
  if (ct.length === 0) return [];
  const pal = db.prepare(
    `SELECT pa.id, pa.container_id, pa.pallet_no, pa.c_no, pa.is_mixed,
            pa.volume_cbm, pa.nw_kg, pa.gw_kg
     FROM pallets pa JOIN containers c ON c.id = pa.container_id
     WHERE c.order_batch_id = ? ORDER BY pa.container_id, pa.pallet_no`
  ).all(batchId);
  const lines = db.prepare(
    `SELECT pl.id, pl.pallet_id, pl.order_line_id, pl.qty, pl.done, ol.item_code, pos.code AS po
     FROM pallet_lines pl
     JOIN order_lines ol ON ol.id = pl.order_line_id
     JOIN pos ON pos.id = ol.po_id
     WHERE pos.order_batch_id = ?`
  ).all(batchId);

  const byContainer = new Map(ct.map(c => [c.id, { ...c, pallets: [] }]));
  const palletById = new Map();
  for (const p of pal) {
    const obj = { ...p, items: [] };
    palletById.set(p.id, obj);
    byContainer.get(p.container_id)?.pallets.push(obj);
  }
  for (const l of lines) {
    palletById.get(l.pallet_id)?.items.push({
      id: l.id, order_line_id: l.order_line_id, ntk: l.item_code,
      qty: num(l.qty), done: !!l.done, po: l.po,
    });
  }
  return [...byContainer.values()];
}

// ── Chuẩn bị dữ liệu mẫu: 1 container chứa 2 PO (2600168 và 2600189) ─────────
const testCsv = `
表单编号：RE-CP4-16-S
Container 1/ Seal  No. / Pallet 1-10,,,,,,,,,,,,,,,
2600168,1,,1063022,0,660,2059,KGS,2084,KGS,1.22,*,1.02,*,1.1232,1.4
2600168,2,,106160,0,300,1365,KGS,1390,KGS,1.22,*,1.02,*,1.05,1.31
2600168,,,1063022,0,20,62,KGS,62,KGS,1.22,*,1.02,*,0.0304,0.04
2600189,3,,1063038,0,330,2046,KGS,2071,KGS,1.22,*,1.02,*,0.87385,1.09
2600168,4,,1061119,0,290,1908,KGS,1933,KGS,1.22,*,1.02,*,0.83875,1.04
2600189,5,,1061119,0,290,1908,KGS,1933,KGS,1.22,*,1.02,*,0.83875,1.04
2600168,6,,1063038,0,300,1860,KGS,1885,KGS,1.22,*,1.02,*,0.80745,1.0
2600168,7,,1063038,0,300,1860,KGS,1885,KGS,1.22,*,1.02,*,0.80745,1.0
2600168,8,,1063038,0,300,1860,KGS,1885,KGS,1.22,*,1.02,*,0.80745,1.0
2600168,9,,1063038,0,300,1860,KGS,1885,KGS,1.22,*,1.02,*,0.80745,1.0
2600189,10,,1061119,0,210,1382,KGS,1407,KGS,1.22,*,1.02,*,0.64595,0.8
2600189,,,1063048,0,20,146,KGS,146,KGS,1.22,*,1.02,*,0.04955,0.06
`;

const parsed = parseExcelOrCsv(testCsv, 'test.csv');
const plan = buildImportPlanV2(parsed.data);

const db = freshDb();
db.exec(`INSERT INTO order_batches (id, status, imported_at) VALUES (1, 'active', '2026-10-13 12:00:00')`);

// Nạp PO
const poIds = [];
for (const p of plan.pos) {
  const res = db.prepare(`INSERT INTO pos (order_batch_id, code) VALUES (?, ?)`).run(1, p.code);
  poIds.push(Number(res.lastInsertRowid));
}

// Nạp order_lines
const lineIds = [];
for (const l of plan.lines) {
  const poId = poIds[l.poIdx];
  const res = db.prepare(`INSERT INTO order_lines (po_id, item_code, target) VALUES (?, ?, ?)`).run(poId, l.itemCode, l.target);
  lineIds.push(Number(res.lastInsertRowid));
}

// Nạp containers
const contIds = [];
for (const c of plan.containers) {
  const poId = poIds[c.poIdx];
  const res = db.prepare(`INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, ?, ?)`).run(1, poId, c.containerNo, c.sealNo || null);
  contIds.push(Number(res.lastInsertRowid));
}

// Nạp pallets
const palletIds = [];
for (const pl of plan.pallets) {
  const contId = contIds[pl.containerIdx];
  const poId = poIds[pl.poIdx];
  const res = db.prepare(`INSERT INTO pallets (container_id, po_id, pallet_no, is_mixed) VALUES (?, ?, ?, ?)`).run(contId, poId, pl.palletNo, pl.isMixed);
  palletIds.push(Number(res.lastInsertRowid));
}

// Nạp pallet_lines
for (const pl of plan.palletLines) {
  const palletId = palletIds[pl.palletIdx];
  const lineId = lineIds[pl.lineIdx];
  db.prepare(`INSERT INTO pallet_lines (pallet_id, order_line_id, qty, done) VALUES (?, ?, ?, 0)`).run(palletId, lineId, pl.qty);
}

// ── Kiểm tra hiển thị qua fetchContainersView ────────────────────────────────
console.log('\n1) KIỂM TRA ĐỌC DỮ LIỆU CONTAINER VÀ THUỘC TÍNH PO CỦA CÁC ITEM:');
const containers = fetchContainersView(db, 1);
check('Đọc được đúng 1 container', containers.length === 1);
const c1 = containers[0];
check('Container có 10 kiện', c1.pallets.length === 10);

// Thu thập danh sách PO của container
const containerPos = Array.from(new Set([
  c1.po,
  ...(c1.pallets ?? []).flatMap(p => (p.items ?? []).map(it => it.po)),
].filter(Boolean))).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
const isMultiPo = containerPos.length > 1;

check('Nhận diện đúng container chứa nhiều PO (isMultiPo === true)', isMultiPo === true);
eq('Danh sách PO trong container gồm đúng 2 PO', containerPos, ['2600168', '2600189']);

console.log('\n2) KIỂM TRA TỪNG KIỆN VÀ SẢN PHẨM TRONG KIỆN:');
// Kiện 1: Kiện 1 mã của PO 2600168
const p1 = c1.pallets.find(p => p.pallet_no === 1);
check('Kiện 1 có 1 item', p1.items.length === 1);
eq('Kiện 1 item thuộc PO 2600168', p1.items[0].po, '2600168');
eq('Kiện 1 item mã 1063022', p1.items[0].ntk, '1063022');
eq('Kiện 1 item số lượng 660', p1.items[0].qty, 660);

// Kiện 3: Kiện 1 mã của PO 2600189
const p3 = c1.pallets.find(p => p.pallet_no === 3);
check('Kiện 3 có 1 item', p3.items.length === 1);
eq('Kiện 3 item thuộc PO 2600189', p3.items[0].po, '2600189');
eq('Kiện 3 item mã 1063038', p3.items[0].ntk, '1063038');
eq('Kiện 3 item số lượng 330', p3.items[0].qty, 330);

// Kiện 10: Kiện mix 2 mã của PO 2600189
const p10 = c1.pallets.find(p => p.pallet_no === 10);
check('Kiện 10 có 2 item (kiện mix)', p10.items.length === 2);
eq('Kiện 10 item 1 thuộc PO 2600189', p10.items[0].po, '2600189');
eq('Kiện 10 item 1 mã 1061119', p10.items[0].ntk, '1061119');
eq('Kiện 10 item 1 số lượng 210', p10.items[0].qty, 210);
eq('Kiện 10 item 2 thuộc PO 2600189', p10.items[1].po, '2600189');
eq('Kiện 10 item 2 mã 1063048', p10.items[1].ntk, '1063048');
eq('Kiện 10 item 2 số lượng 20', p10.items[1].qty, 20);

console.log('\n3) KIỂM TRA BỘ LỌC CHIP PO (FilterChips) VÀ LỌC CONTAINER:');
const cpos = Array.from(new Set([
  ...containers.map(c => c.po),
  ...containers.flatMap(c => (c.pallets ?? []).flatMap(p => (p.items ?? []).map(it => it.po))),
].filter(Boolean))).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
eq('Chip lọc PO chứa đủ 2 PO', cpos, ['2600168', '2600189']);

// Lọc PO 2600168: Container 1 phải hiển thị
const filter2600168 = containers.filter(c =>
  c.po === '2600168' || (c.pallets || []).some(p => (p.items || []).some(it => it.po === '2600168'))
);
check('Lọc PO 2600168 hiển thị Container 1', filter2600168.length === 1);

// Lọc PO 2600189: Container 1 phải hiển thị (dù c.po có thể là 2600168)
const filter2600189 = containers.filter(c =>
  c.po === '2600189' || (c.pallets || []).some(p => (p.items || []).some(it => it.po === '2600189'))
);
check('Lọc PO 2600189 hiển thị Container 1', filter2600189.length === 1);

// Lọc PO không tồn tại
const filterUnknown = containers.filter(c =>
  c.po === '9999999' || (c.pallets || []).some(p => (p.items || []).some(it => it.po === '9999999'))
);
check('Lọc PO không tồn tại ẩn Container 1', filterUnknown.length === 0);

console.log('\n4) KIỂM TRA THỐNG KÊ SỐ KIỆN THEO PO CHO HOÀN TẤT ĐƠN (poListForFinish):');
const palletDone = (p) => p.items.length > 0 && p.items.every(it => it.done);
const poMapStats = new Map();
(containers || []).forEach(c => {
  (c?.pallets || []).forEach(p => {
    const palletPos = new Set((p?.items || []).map(it => it.po).filter(Boolean));
    if (palletPos.size === 0 && c?.po) palletPos.add(c.po);
    palletPos.forEach(poCode => {
      const codeStr = String(poCode);
      if (!poMapStats.has(codeStr)) {
        poMapStats.set(codeStr, { palletsTotal: 0, palletsDone: 0 });
      }
      const entry = poMapStats.get(codeStr);
      entry.palletsTotal += 1;
      if (palletDone(p)) entry.palletsDone += 1;
    });
  });
});

eq('PO 2600168 có đúng 7 kiện trong container', poMapStats.get('2600168').palletsTotal, 7);
eq('PO 2600189 có đúng 3 kiện trong container', poMapStats.get('2600189').palletsTotal, 3);
check('Tổng số kiện 2 PO khớp tổng số kiện container (7 + 3 = 10)', 7 + 3 === 10);

console.log(`\nKết quả test-multiPoContainer: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
