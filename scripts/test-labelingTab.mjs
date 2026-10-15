// scripts/test-labelingTab.mjs
// FEAT-28 — Bộ kiểm thử toàn diện tính năng Dán nhãn (Checker Workspace).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const failures = [];
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failures.push(`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`));
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : ` — ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`}`);
};
const check = (label, cond, detail = '') => eq(`${label}${cond ? '' : ` (${detail})`}`, !!cond, true);

console.log('\n=== KIỂM THỬ TÍNH NĂNG DÁN NHÃN SẢN PHẨM (FEAT-28) TRÊN SQLITE THẬT ===');

const tmp = mkdtempSync(join(tmpdir(), 'ptracker-labeling-'));
const DB = join(tmp, 'production_tracker.db');
process.env.EXPO_SQLITE_FILE = DB;

const [{ getDb }, q] = await Promise.all([
  import('../src/db/index.js'),
  import('../src/db/queries.js'),
]);
const dmac = JSON.parse(readFileSync(new URL('../src/data/Dmac.json', import.meta.url), 'utf8'));

const db = await getDb();
const batchId = (await db.getFirstAsync(`SELECT id FROM order_batches WHERE status='active'`)).id;
await q.importPackingV1(batchId, dmac);

const items = await q.fetchItemsWithStats(batchId);
const itemA = items[0];
const itemB = items[1];
check('Tìm thấy mã hàng thử nghiệm A', Boolean(itemA && itemA.order_line_id));
check('Tìm thấy mã hàng thử nghiệm B', Boolean(itemB && itemB.order_line_id));

// ══════════════════════════════════════════════════════════════════════
console.log('\n1) KIỂM TRA THÊM NHẬT KÝ VỚI TRẠNG THÁI DÁN NHÃN (addEntry)');
// ══════════════════════════════════════════════════════════════════════

// 1.1 Mặc định không truyền isLabeled/unlabeledQty => is_labeled = 1, unlabeled_qty = 0 (AC-LBL-01)
const eDefault = await q.addEntry(itemA.order_line_id, {
  date: '2026-10-15',
  qty: 100,
  line: 'auto',
});
check('Thêm lượt mặc định thành công', Boolean(eDefault?.id));
const rowDefault = await db.getFirstAsync(
  `SELECT is_labeled, unlabeled_qty FROM production_entries WHERE id = ?`,
  [eDefault.id]
);
eq('Lượt mặc định có is_labeled = 1', rowDefault.is_labeled, 1);
eq('Lượt mặc định có unlabeled_qty = 0', rowDefault.unlabeled_qty, 0);

// 1.2 Chưa dán nhãn toàn bộ: isLabeled = 0 => is_labeled = 0, unlabeled_qty = 150 (AC-LBL-02)
const eFullUnlabeled = await q.addEntry(itemA.order_line_id, {
  date: '2026-10-15',
  qty: 150,
  line: 'auto',
  isLabeled: 0,
});
check('Thêm lượt chưa dán toàn bộ thành công', Boolean(eFullUnlabeled?.id));
const rowFullUnlabeled = await db.getFirstAsync(
  `SELECT is_labeled, unlabeled_qty FROM production_entries WHERE id = ?`,
  [eFullUnlabeled.id]
);
eq('Lượt chưa dán toàn bộ có is_labeled = 0', rowFullUnlabeled.is_labeled, 0);
eq('Lượt chưa dán toàn bộ có unlabeled_qty = 150', rowFullUnlabeled.unlabeled_qty, 150);

// 1.3 Chưa dán nhãn một phần: qty = 200, unlabeledQty = 80 => is_labeled = 0, unlabeled_qty = 80
const ePartialUnlabeled = await q.addEntry(itemB.order_line_id, {
  date: '2026-10-15',
  qty: 200,
  line: 'manual',
  isLabeled: 0,
  unlabeledQty: 80,
});
check('Thêm lượt chưa dán một phần thành công', Boolean(ePartialUnlabeled?.id));
const rowPartialUnlabeled = await db.getFirstAsync(
  `SELECT is_labeled, unlabeled_qty FROM production_entries WHERE id = ?`,
  [ePartialUnlabeled.id]
);
eq('Lượt chưa dán một phần có is_labeled = 0', rowPartialUnlabeled.is_labeled, 0);
eq('Lượt chưa dán một phần có unlabeled_qty = 80', rowPartialUnlabeled.unlabeled_qty, 80);

// ══════════════════════════════════════════════════════════════════════
console.log('\n2) KIỂM TRA TRUY VẤN TAB DÁN NHÃN (fetchUnlabeledEntries & Summary)');
// ══════════════════════════════════════════════════════════════════════

// 2.1 Summary KPI (AC-LBL-03)
const summary = await q.fetchUnlabeledSummary(batchId);
eq('Tổng số lô chờ dán nhãn = 2', summary.count, 2);
eq('Tổng số pcs chờ dán nhãn = 230 (150 + 80)', summary.totalPcs, 230);

// 2.2 Danh sách chi tiết
const unlabeledList = await q.fetchUnlabeledEntries(batchId);
eq('Danh sách trả về đúng 2 mục chờ dán', unlabeledList.length, 2);
check('Lượt mặc định (đã dán hoàn chỉnh) KHÔNG xuất hiện trong danh sách',
  !unlabeledList.some(e => e.id === eDefault.id)
);
check('Lô 150 pcs của mã A có trong danh sách',
  unlabeledList.some(e => e.id === eFullUnlabeled.id && e.unlabeled_qty === 150)
);
check('Lô 80 pcs của mã B có trong danh sách',
  unlabeledList.some(e => e.id === ePartialUnlabeled.id && e.unlabeled_qty === 80)
);

// ══════════════════════════════════════════════════════════════════════
console.log('\n3) KIỂM TRA 1-CHẠM XÁC NHẬN [✓ ĐÃ DÁN XONG] (markEntryFullyLabeled)');
// ══════════════════════════════════════════════════════════════════════

// Xác nhận hoàn tất lô mã A (150 pcs) (AC-LBL-04)
const resMark = await q.markEntryFullyLabeled(eFullUnlabeled.id);
eq('markEntryFullyLabeled trả về ok', resMark.ok, true);

const rowAfterMark = await db.getFirstAsync(
  `SELECT is_labeled, unlabeled_qty FROM production_entries WHERE id = ?`,
  [eFullUnlabeled.id]
);
eq('Lô A sau khi bấm xong có is_labeled = 1', rowAfterMark.is_labeled, 1);
eq('Lô A sau khi bấm xong có unlabeled_qty = 0', rowAfterMark.unlabeled_qty, 0);

// Kiểm tra lại danh sách chờ dán
const listAfterMark = await q.fetchUnlabeledEntries(batchId);
eq('Danh sách chờ dán chỉ còn 1 lô', listAfterMark.length, 1);
eq('Lô còn lại là lô của mã B', listAfterMark[0].id, ePartialUnlabeled.id);

const summaryAfterMark = await q.fetchUnlabeledSummary(batchId);
eq('Summary cập nhật: còn 1 lô', summaryAfterMark.count, 1);
eq('Summary cập nhật: còn 80 pcs', summaryAfterMark.totalPcs, 80);

// ══════════════════════════════════════════════════════════════════════
console.log('\n4) KIỂM TRA DÁN NHÃN TỪNG PHẦN (updateEntryLabeledQty)');
// ══════════════════════════════════════════════════════════════════════

// 4.1 Lô B đang có unlabeled_qty = 80. Dán trước 30 pcs (AC-LBL-05)
const resPart1 = await q.updateEntryLabeledQty(ePartialUnlabeled.id, 30);
eq('updateEntryLabeledQty bước 1 trả về ok', resPart1.ok, true);
eq('updateEntryLabeledQty bước 1 còn lại 50 pcs', resPart1.unlabeled_qty, 50);
eq('is_labeled vẫn là 0 vì còn 50 pcs chưa dán', resPart1.is_labeled, 0);

const rowPart1 = await db.getFirstAsync(
  `SELECT is_labeled, unlabeled_qty FROM production_entries WHERE id = ?`,
  [ePartialUnlabeled.id]
);
eq('DB lưu đúng unlabeled_qty = 50', rowPart1.unlabeled_qty, 50);
eq('DB lưu đúng is_labeled = 0', rowPart1.is_labeled, 0);

const summaryPart1 = await q.fetchUnlabeledSummary(batchId);
eq('Summary cập nhật sau dán một phần: 50 pcs', summaryPart1.totalPcs, 50);

// 4.2 Dán nốt 50 pcs còn lại => chuyển thành đã hoàn tất hoàn toàn
const resPart2 = await q.updateEntryLabeledQty(ePartialUnlabeled.id, 50);
eq('updateEntryLabeledQty bước 2 trả về ok', resPart2.ok, true);
eq('updateEntryLabeledQty bước 2 còn lại 0 pcs', resPart2.unlabeled_qty, 0);
eq('is_labeled chuyển sang 1 khi hết hàng chưa dán', resPart2.is_labeled, 1);

const rowPart2 = await db.getFirstAsync(
  `SELECT is_labeled, unlabeled_qty FROM production_entries WHERE id = ?`,
  [ePartialUnlabeled.id]
);
eq('DB sau khi dán hết có is_labeled = 1', rowPart2.is_labeled, 1);
eq('DB sau khi dán hết có unlabeled_qty = 0', rowPart2.unlabeled_qty, 0);

// 4.3 Kiểm tra danh sách & summary sau khi sạch bóng hàng chờ dán (AC-LBL-06)
const listClean = await q.fetchUnlabeledEntries(batchId);
eq('Danh sách chờ dán đã rỗng hoàn toàn', listClean.length, 0);

const summaryClean = await q.fetchUnlabeledSummary(batchId);
eq('Summary count = 0', summaryClean.count, 0);
eq('Summary totalPcs = 0', summaryClean.totalPcs, 0);

// ══════════════════════════════════════════════════════════════════════
console.log('\n5) KIỂM TRA SỬA LƯỢT SẢN XUẤT (updateEntry)');
// ══════════════════════════════════════════════════════════════════════

// Sửa lượt mặc định (eDefault): chuyển sang chưa dán 60 pcs
const resUpdate = await q.updateEntry(eDefault.id, {
  date: '2026-10-16',
  qty: 120,
  line: 'manual',
  isLabeled: 0,
  unlabeledQty: 60,
});
eq('updateEntry trả về ok', resUpdate.ok, true);

const rowAfterUpdate = await db.getFirstAsync(
  `SELECT is_labeled, unlabeled_qty, qty, line FROM production_entries WHERE id = ?`,
  [eDefault.id]
);
eq('Lượt sau khi sửa có qty = 120', rowAfterUpdate.qty, 120);
eq('Lượt sau khi sửa có is_labeled = 0', rowAfterUpdate.is_labeled, 0);
eq('Lượt sau khi sửa có unlabeled_qty = 60', rowAfterUpdate.unlabeled_qty, 60);

const listAfterUpdate = await q.fetchUnlabeledEntries(batchId);
eq('Danh sách chờ dán xuất hiện lại lô vừa sửa', listAfterUpdate.length, 1);
eq('Lô vừa sửa có đúng 60 pcs chưa dán', listAfterUpdate[0].unlabeled_qty, 60);

// ══════════════════════════════════════════════════════════════════════
console.log('\n6) KIỂM TRA CỘT UNLABELED TRONG VIEW (v_line_progress & v_po_progress)');
// ══════════════════════════════════════════════════════════════════════

const lineProgress = await db.getFirstAsync(
  `SELECT unlabeled FROM v_line_progress WHERE order_line_id = ?`,
  [itemA.order_line_id]
);
eq('v_line_progress phản ánh đúng 60 pcs chưa dán', lineProgress.unlabeled, 60);

const poProgress = await db.getFirstAsync(
  `SELECT unlabeled FROM v_po_progress WHERE po = ?`,
  [itemA.po]
);
check('v_po_progress có số lượng chưa dán >= 60', poProgress.unlabeled >= 60);

// ══════════════════════════════════════════════════════════════════════
console.log('\n7) KIỂM TRA XOÁ NHẬT KÝ (removeEntry)');
// ══════════════════════════════════════════════════════════════════════

await q.removeEntry(eDefault.id);
const listAfterDelete = await q.fetchUnlabeledEntries(batchId);
eq('Sau khi xoá lượt, danh sách chờ dán lại rỗng', listAfterDelete.length, 0);

const summaryAfterDelete = await q.fetchUnlabeledSummary(batchId);
eq('Summary sau khi xoá lượt = 0', summaryAfterDelete.totalPcs, 0);

console.log(`\nTổng kết test-labelingTab: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('\nChi tiết thất bại:');
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
} else {
  console.log('Tất cả kiểm tra FEAT-28 thành công 100%!\n');
}
