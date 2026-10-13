// scripts/test-historyCrud.mjs
// FEAT-27 — Kiểm thử Thêm / Sửa / Xoá lịch sử sản xuất trên SQLite thật
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
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

const tmp = mkdtempSync(join(tmpdir(), 'ptracker-hist-'));
const DB = join(tmp, 'production_tracker.db');

process.env.EXPO_SQLITE_FILE = DB;
const [{ getDb }, q] = await Promise.all([
  import('../src/db/index.js'),
  import('../src/db/queries.js'),
]);
const dmac = JSON.parse(readFileSync(new URL('../src/data/Dmac.json', import.meta.url), 'utf8'));

let db;
try {
  db = await getDb();
  const batchId = (await db.getFirstAsync(`SELECT id FROM order_batches WHERE status='active'`)).id;
  await q.importPackingV1(batchId, dmac);

  const items = await q.fetchItemsWithStats(batchId);
  const targetItem = items[0];
  check('tìm thấy mã đầu tiên', !!targetItem);
  const orderLineId = targetItem.order_line_id;

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n1) THÊM LỊCH SỬ SẢN XUẤT CHO NGÀY CỤ THỂ (2026-10-15)');
  // ══════════════════════════════════════════════════════════════════════
  const addRes1 = await q.addEntry(orderLineId, {
    date: '2026-10-15',
    qty: 120,
    line: 'manual',
    defectQty: 3,
    defectTypes: ['yellow', 'tear'],
  });
  check('thêm lượt 1 thành công', addRes1.ok, JSON.stringify(addRes1.error));
  const entryId1 = addRes1.id;

  const addRes2 = await q.addEntry(orderLineId, {
    date: '2026-10-15',
    qty: 80,
    line: 'auto',
    defectQty: 0,
  });
  check('thêm lượt 2 thành công', addRes2.ok, JSON.stringify(addRes2.error));
  const entryId2 = addRes2.id;

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n2) KIỂM TRA ĐỌC LỊCH SỬ QUA fetchHistoryEntries');
  // ══════════════════════════════════════════════════════════════════════
  // Kiểm tra theo ngày (day)
  const dayEntries = await q.fetchHistoryEntries('day', '2026-10-15');
  eq('ngày 2026-10-15 có đúng 2 lượt sản xuất', dayEntries.length, 2);

  const e1 = dayEntries.find(e => e.id === entryId1);
  check('tìm thấy lượt 1', !!e1);
  eq('lượt 1: mã đúng', e1.ntk, targetItem.ntk);
  eq('lượt 1: đúng PO', e1.po, targetItem.po);
  eq('lượt 1: số lượng 120 pcs', e1.qty, 120);
  eq('lượt 1: chuyền manual', e1.line, 'manual');
  eq('lượt 1: số lỗi 3', e1.defect_qty, 3);
  check('lượt 1: có thẻ yellow', e1.defect_types.includes('yellow'));
  check('lượt 1: có thẻ tear', e1.defect_types.includes('tear'));

  const e2 = dayEntries.find(e => e.id === entryId2);
  check('tìm thấy lượt 2', !!e2);
  eq('lượt 2: số lượng 80 pcs', e2.qty, 80);
  eq('lượt 2: chuyền auto', e2.line, 'auto');

  // Kiểm tra theo tháng (month)
  const monthEntries = await q.fetchHistoryEntries('month', '2026-10');
  check('tháng 2026-10 chứa cả 2 lượt', monthEntries.some(e => e.id === entryId1) && monthEntries.some(e => e.id === entryId2));

  // Kiểm tra theo năm (year)
  const yearEntries = await q.fetchHistoryEntries('year', '2026');
  check('năm 2026 chứa cả 2 lượt', yearEntries.some(e => e.id === entryId1) && yearEntries.some(e => e.id === entryId2));

  // Kiểm tra tổng nhóm qua fetchHistoryGrouped
  const dayGroups = await q.fetchHistoryGrouped('day');
  const dGroup = dayGroups.find(g => g.groupKey === '2026-10-15');
  eq('tổng ngày 2026-10-15 = 200 pcs', dGroup?.total, 200);
  eq('thủ công = 120', dGroup?.manualTotal, 120);
  eq('tự động = 80', dGroup?.autoTotal, 80);
  eq('lỗi = 3', dGroup?.defectTotal, 3);

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n3) SỬA LỊCH SỬ SẢN XUẤT (updateEntry)');
  // ══════════════════════════════════════════════════════════════════════
  // Sửa lượt 1: đổi ngày sang 2026-10-16, đổi số lượng thành 150 pcs, chuyền auto, lỗi 1 red
  const updateRes = await q.updateEntry(entryId1, {
    date: '2026-10-16',
    qty: 150,
    line: 'auto',
    defectQty: 1,
    defectTypes: ['red'],
  });
  check('sửa lượt 1 thành công', updateRes.ok, JSON.stringify(updateRes.error));

  // Kiểm tra lại ngày 2026-10-15: chỉ còn lượt 2 (80 pcs)
  const day15Entries = await q.fetchHistoryEntries('day', '2026-10-15');
  eq('ngày 15 còn 1 lượt', day15Entries.length, 1);
  eq('ngày 15 tổng 80', day15Entries[0]?.qty, 80);

  // Kiểm tra ngày 2026-10-16: có lượt 1 với thông số mới
  const day16Entries = await q.fetchHistoryEntries('day', '2026-10-16');
  eq('ngày 16 có 1 lượt', day16Entries.length, 1);
  eq('ngày 16 số lượng = 150 pcs', day16Entries[0]?.qty, 150);
  eq('ngày 16 chuyền = auto', day16Entries[0]?.line, 'auto');
  eq('ngày 16 lỗi = 1', day16Entries[0]?.defect_qty, 1);
  check('ngày 16 loại lỗi red', day16Entries[0]?.defect_types.includes('red'));

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n4) XOÁ LỊCH SỬ SẢN XUẤT (removeEntry)');
  // ══════════════════════════════════════════════════════════════════════
  // Xoá lượt 1 (150 pcs)
  const delRes1 = await q.removeEntry(entryId1);
  check('xoá lượt 1 thành công', delRes1.ok, JSON.stringify(delRes1.error));

  const afterDel16 = await q.fetchHistoryEntries('day', '2026-10-16');
  eq('ngày 16 không còn lượt nào', afterDel16.length, 0);

  // Xoá nốt lượt 2 (80 pcs)
  const delRes2 = await q.removeEntry(entryId2);
  check('xoá lượt 2 thành công', delRes2.ok, JSON.stringify(delRes2.error));

  const afterDel15 = await q.fetchHistoryEntries('day', '2026-10-15');
  eq('ngày 15 không còn lượt nào', afterDel15.length, 0);

  const finalDayGroups = await q.fetchHistoryGrouped('day');
  check('ngày 15 và 16 đã không còn trong nhóm ngày', !finalDayGroups.some(g => g.groupKey === '2026-10-15' || g.groupKey === '2026-10-16'));

} finally {
  try { await db?.closeAsync(); } catch { /* đã đóng */ }
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nKết quả test-historyCrud: ${pass} passed, ${fail} failed`);
if (failures.length) console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
