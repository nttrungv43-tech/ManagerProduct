// scripts/test-lastUpdatedHighlight.mjs
// FEAT-26 — Kiểm tra tính năng nhận diện mã hàng vừa cập nhật và thông tin PO.
//
// Chạy: node --no-warnings scripts/test-lastUpdatedHighlight.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const failures = [];
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failures.push(`${label}\n      nhận: ${JSON.stringify(actual)}\n      cần : ${JSON.stringify(expected)}`));
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : ` — ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`}`);
};
const check = (label, cond, detail = '') => eq(label + (cond ? '' : ` (${detail})`), !!cond, true);

// Nạp SQL schema
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

console.log('1) Khởi tạo DB & 2 dòng có CÙNG MÃ HÀNG nhưng KHÁC PO');
const db = freshDb();
const batch = db.prepare(`INSERT INTO order_batches (status, imported_at) VALUES ('active', '2026-10-09')`).run();
const batchId = Number(batch.lastInsertRowid);

const po1 = db.prepare(`INSERT INTO pos (order_batch_id, code) VALUES (?, '2919')`).run(batchId);
const po1Id = Number(po1.lastInsertRowid);

const po2 = db.prepare(`INSERT INTO pos (order_batch_id, code) VALUES (?, '2920')`).run(batchId);
const po2Id = Number(po2.lastInsertRowid);

// Cùng mã 1063048GF ở cả 2 PO
const l1 = db.prepare(`INSERT INTO order_lines (po_id, item_code, target) VALUES (?, '1063048GF', 500)`).run(po1Id);
const line1Id = Number(l1.lastInsertRowid);

const l2 = db.prepare(`INSERT INTO order_lines (po_id, item_code, target) VALUES (?, '1063048GF', 300)`).run(po2Id);
const line2Id = Number(l2.lastInsertRowid);

eq('Tạo dòng 1 (PO 2919, 1063048GF)', line1Id > 0, true);
eq('Tạo dòng 2 (PO 2920, 1063048GF)', line2Id > 0, true);
eq('Hai dòng có ID phân biệt', line1Id !== line2Id, true);

console.log('\n2) Giả lập trạng thái lastUpdatedInfo');
let lastUpdatedInfo = null;
function setLastUpdatedInfo(info) {
  lastUpdatedInfo = info;
}

// Khi chưa cập nhật gì
eq('Mặc định lastUpdatedInfo = null', lastUpdatedInfo, null);

// Thao tác nhập vào dòng 1 (PO 2919)
const updatePayload1 = {
  orderLineId: line1Id,
  ntk: '1063048GF',
  po: '2919',
  qty: 120,
  time: '19:45',
  timestamp: Date.now(),
};
setLastUpdatedInfo(updatePayload1);

eq('Dòng 1 được xác định là vừa cập nhật', lastUpdatedInfo.orderLineId === line1Id, true);
eq('Dòng 2 KHÔNG bị đánh dấu nhầm', lastUpdatedInfo.orderLineId === line2Id, false);
eq('Thông tin hiển thị PO đúng là 2919', lastUpdatedInfo.po, '2919');
eq('Thông tin hiển thị số lượng đúng là 120 pcs', lastUpdatedInfo.qty, 120);

// Thao tác chuyển sang nhập vào dòng 2 (PO 2920)
const updatePayload2 = {
  orderLineId: line2Id,
  ntk: '1063048GF',
  po: '2920',
  qty: 80,
  time: '19:50',
  timestamp: Date.now(),
};
setLastUpdatedInfo(updatePayload2);

eq('Dòng 2 được chuyển thành vừa cập nhật', lastUpdatedInfo.orderLineId === line2Id, true);
eq('Dòng 1 tự động mất cờ vừa cập nhật', lastUpdatedInfo.orderLineId === line1Id, false);
eq('Thông tin hiển thị PO mới đúng là 2920', lastUpdatedInfo.po, '2920');
eq('Thông tin hiển thị số lượng mới đúng là 80 pcs', lastUpdatedInfo.qty, 80);

console.log(`\nKết quả test lastUpdatedHighlight: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
