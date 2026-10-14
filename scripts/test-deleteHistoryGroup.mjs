// scripts/test-deleteHistoryGroup.mjs
// Kiểm thử chức năng Xoá Lịch Sử Theo Ngày, Theo Tháng, Theo Năm trên SQLite thật.
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

const tmp = mkdtempSync(join(tmpdir(), 'ptracker-delhist-'));
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
  check('tìm thấy mã hàng kiểm thử', !!targetItem);
  const orderLineId = targetItem.order_line_id;

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n1) THÊM LỊCH SỬ SẢN XUẤT CHO CÁC MỐC THỜI GIAN KHÁC NHAU');
  // ══════════════════════════════════════════════════════════════════════
  // Mốc 1: Ngày 2026-10-14 (2 lượt)
  const e1 = await q.addEntry(orderLineId, { date: '2026-10-14', qty: 50, line: 'manual', defectQty: 2 });
  const e2 = await q.addEntry(orderLineId, { date: '2026-10-14', qty: 60, line: 'auto', defectQty: 0 });
  check('Thêm lượt 1 ngày 2026-10-14 thành công', e1.ok);
  check('Thêm lượt 2 ngày 2026-10-14 thành công', e2.ok);

  // Mốc 2: Ngày 2026-10-15 (1 lượt)
  const e3 = await q.addEntry(orderLineId, { date: '2026-10-15', qty: 100, line: 'manual', defectQty: 1 });
  check('Thêm lượt 3 ngày 2026-10-15 thành công', e3.ok);

  // Mốc 3: Ngày 2026-09-20 (1 lượt)
  const e4 = await q.addEntry(orderLineId, { date: '2026-09-20', qty: 70, line: 'auto', defectQty: 0 });
  check('Thêm lượt 4 ngày 2026-09-20 thành công', e4.ok);

  // Mốc 4: Ngày 2025-11-05 (1 lượt thuộc năm 2025)
  const e5 = await q.addEntry(orderLineId, { date: '2025-11-05', qty: 80, line: 'manual', defectQty: 0 });
  check('Thêm lượt 5 ngày 2025-11-05 thành công', e5.ok);

  // Kiểm tra nhóm ngày trước khi xoá
  const dayGroupsBefore = await q.fetchHistoryGrouped('day');
  check('Trước khi xoá có 4 ngày', dayGroupsBefore.length === 4);

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n2) KIỂM TRA PREVIEW VÀ XOÁ THEO NGÀY (2026-10-14)');
  // ══════════════════════════════════════════════════════════════════════
  const previewDay = await q.previewRemoveHistoryGroup('day', '2026-10-14');
  check('Preview ngày 2026-10-14 thành công', previewDay.ok);
  eq('Số lượt sẽ xoá của ngày 2026-10-14', previewDay.count, 2);
  eq('Tổng sản lượng sẽ xoá của ngày 2026-10-14', previewDay.totalQty, 110);
  eq('Số lỗi của ngày 2026-10-14', previewDay.defectQty, 2);

  // Thực hiện xoá ngày 2026-10-14
  const delDayRes = await q.removeHistoryGroup('day', '2026-10-14');
  check('Xoá ngày 2026-10-14 thành công', delDayRes.ok);
  eq('deletedCount khớp', delDayRes.deletedCount, 2);
  eq('totalQty khớp', delDayRes.totalQty, 110);

  // Kiểm tra ngày 2026-10-14 không còn
  const dayGroupsAfter = await q.fetchHistoryGrouped('day');
  check('Sau khi xoá ngày còn 3 ngày', dayGroupsAfter.length === 3);
  check('Ngày 2026-10-14 đã bị xoá hoàn toàn', !dayGroupsAfter.some(g => g.groupKey === '2026-10-14'));
  check('Ngày 2026-10-15 vẫn còn', dayGroupsAfter.some(g => g.groupKey === '2026-10-15'));
  check('Ngày 2026-09-20 vẫn còn', dayGroupsAfter.some(g => g.groupKey === '2026-09-20'));
  check('Ngày 2025-11-05 vẫn còn', dayGroupsAfter.some(g => g.groupKey === '2025-11-05'));

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n3) KIỂM TRA PREVIEW VÀ XOÁ THEO THÁNG (2026-10)');
  // ══════════════════════════════════════════════════════════════════════
  const previewMonth = await q.previewRemoveHistoryGroup('month', '2026-10');
  check('Preview tháng 2026-10 thành công', previewMonth.ok);
  eq('Số lượt sẽ xoá của tháng 2026-10 (chỉ còn ngày 15)', previewMonth.count, 1);
  eq('Tổng sản lượng sẽ xoá của tháng 2026-10', previewMonth.totalQty, 100);

  const delMonthRes = await q.removeHistoryGroup('month', '2026-10');
  check('Xoá tháng 2026-10 thành công', delMonthRes.ok);
  eq('deletedCount tháng khớp', delMonthRes.deletedCount, 1);

  // Kiểm tra tháng 2026-10 không còn
  const monthGroupsAfter = await q.fetchHistoryGrouped('month');
  check('Tháng 2026-10 đã bị xoá hoàn toàn', !monthGroupsAfter.some(g => g.groupKey === '2026-10'));
  check('Tháng 2026-09 vẫn còn', monthGroupsAfter.some(g => g.groupKey === '2026-09'));
  check('Tháng 2025-11 vẫn còn', monthGroupsAfter.some(g => g.groupKey === '2025-11'));

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n4) KIỂM TRA PREVIEW VÀ XOÁ THEO NĂM (2025)');
  // ══════════════════════════════════════════════════════════════════════
  const previewYear = await q.previewRemoveHistoryGroup('year', '2025');
  check('Preview năm 2025 thành công', previewYear.ok);
  eq('Số lượt sẽ xoá của năm 2025', previewYear.count, 1);
  eq('Tổng sản lượng sẽ xoá của năm 2025', previewYear.totalQty, 80);

  const delYearRes = await q.removeHistoryGroup('year', '2025');
  check('Xoá năm 2025 thành công', delYearRes.ok);
  eq('deletedCount năm khớp', delYearRes.deletedCount, 1);

  // Kiểm tra năm 2025 không còn
  const yearGroupsAfter = await q.fetchHistoryGrouped('year');
  check('Năm 2025 đã bị xoá hoàn toàn', !yearGroupsAfter.some(g => g.groupKey === '2025'));
  check('Năm 2026 vẫn còn (còn ngày 2026-09-20)', yearGroupsAfter.some(g => g.groupKey === '2026'));

  // ══════════════════════════════════════════════════════════════════════
  console.log('\n5) KIỂM TRA CHẶN DỮ LIỆU ĐẦU VÀO KHÔNG HỢP LỆ');
  // ══════════════════════════════════════════════════════════════════════
  const errDate = await q.removeHistoryGroup('day', '2026-15-40');
  eq('Chặn ngày sai định dạng', errDate.error?.code, 'INVALID_DATE');

  const errMonth = await q.removeHistoryGroup('month', '2026-1');
  eq('Chặn tháng sai định dạng', errMonth.error?.code, 'INVALID_MONTH');

  const errYear = await q.removeHistoryGroup('year', '26');
  eq('Chặn năm sai định dạng', errYear.error?.code, 'INVALID_YEAR');

  const errEmpty = await q.removeHistoryGroup('day', '1999-01-01');
  eq('Chặn xoá khi không có dữ liệu', errEmpty.error?.code, 'NO_ENTRIES_TO_DELETE');

  const errGroupBy = await q.removeHistoryGroup('invalid_type', '2026');
  eq('Chặn groupBy không hợp lệ', errGroupBy.error?.code, 'INVALID_GROUP_BY');

  console.log(`\nKết quả test-deleteHistoryGroup: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
} finally {
  try {
    if (db) await db.closeAsync();
  } catch {}
  rmSync(tmp, { recursive: true, force: true });
}
