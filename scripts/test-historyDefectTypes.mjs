// scripts/test-historyDefectTypes.mjs
// Kiểm thử hiển thị chi tiết loại sản phẩm lỗi (Thẻ đỏ, Thẻ vàng, Rách bọc) trong Tab Lịch sử.
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

// ══════════════════════════════════════════════════════════════════════
console.log('\n1) KIỂM TRA HÀM THUẦN normalizeDefectTypes & formatDefectCount');
// ══════════════════════════════════════════════════════════════════════
const { normalizeDefectTypes, formatDefectCount, getDefectColor, DEFECT_META } = await import('../src/utils/defectFormat.js');

check('DEFECT_META có đủ 3 loại lỗi', Boolean(DEFECT_META.red && DEFECT_META.yellow && DEFECT_META.tear));
eq('normalizeDefectTypes mảng rỗng', normalizeDefectTypes([]), []);
eq('normalizeDefectTypes null', normalizeDefectTypes(null), []);
eq('normalizeDefectTypes chuỗi hợp lệ', normalizeDefectTypes('yellow,red'), ['red', 'yellow']);
eq('normalizeDefectTypes sắp xếp chuẩn: red -> yellow -> tear', normalizeDefectTypes(['tear', 'yellow', 'red']), ['red', 'yellow', 'tear']);
eq('normalizeDefectTypes loại bỏ key sai và trùng lặp', normalizeDefectTypes(['red', 'invalid', 'red', 'tear']), ['red', 'tear']);
eq('formatDefectCount có cả pcs và thùng', formatDefectCount(10, 2), '10 pcs, 2 thùng');
eq('formatDefectCount chỉ có pcs', formatDefectCount(5, 0), '5 pcs');
eq('formatDefectCount chỉ có thùng', formatDefectCount(0, 3), '3 thùng');
eq('formatDefectCount không có lỗi', formatDefectCount(0, 0), null);
eq('getDefectColor chỉ có thẻ vàng trả về màu vàng cam', getDefectColor(['yellow']), '#D97706');
eq('getDefectColor chỉ có rách bọc trả về màu slate', getDefectColor(['tear']), '#475569');
eq('getDefectColor có thẻ đỏ trả về màu đỏ', getDefectColor(['red']), '#E53935');
eq('getDefectColor có cả thẻ đỏ và vàng ưu tiên màu đỏ', getDefectColor(['yellow', 'red']), '#E53935');
eq('getDefectColor mảng rỗng trả về màu fallback', getDefectColor([], '#999999'), '#999999');

// ══════════════════════════════════════════════════════════════════════
console.log('\n2) KIỂM TRA TRUY VẤN LỊCH SỬ VỚI LOẠI LỖI TRÊN SQLITE THẬT');
// ══════════════════════════════════════════════════════════════════════
const tmp = mkdtempSync(join(tmpdir(), 'ptracker-histdefect-'));
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
const targetItem = items[0];
check('Tìm thấy mã hàng thử nghiệm', Boolean(targetItem && targetItem.order_line_id));

// Thêm lượt 1: 100 pcs, 5 lỗi pcs, 1 thùng lỗi, Thẻ đỏ + Thẻ vàng
const e1 = await q.addEntry(targetItem.order_line_id, {
  date: '2026-10-15',
  qty: 100,
  line: 'auto',
  defectQty: 5,
  defectBoxQty: 1,
  defectTypes: ['red', 'yellow'],
});
check('Thêm lượt 1 thành công', e1.ok);

// Thêm lượt 2: 50 pcs, 2 lỗi pcs, Rách bọc
const e2 = await q.addEntry(targetItem.order_line_id, {
  date: '2026-10-15',
  qty: 50,
  line: 'manual',
  defectQty: 2,
  defectBoxQty: 0,
  defectTypes: ['tear'],
});
check('Thêm lượt 2 thành công', e2.ok);

// 3) Kiểm tra fetchHistoryGrouped gom đủ các loại lỗi
const groups = await q.fetchHistoryGrouped('day');
check('Có nhóm ngày 2026-10-15', groups.length > 0 && groups[0].groupKey === '2026-10-15');
const g15 = groups.find(g => g.groupKey === '2026-10-15');
eq('Tổng sản lượng ngày 15', g15.total, 150);
eq('Tổng sp lỗi ngày 15', g15.defectTotal, 7);
eq('Tổng thùng lỗi ngày 15', g15.defectBoxTotal, 1);
check('Nhóm ngày gom đủ cả 3 loại lỗi', g15.defectTypes.includes('red') && g15.defectTypes.includes('yellow') && g15.defectTypes.includes('tear'));

// 4) Kiểm tra fetchHistoryDetail gom loại lỗi cho mã hàng
const details = await q.fetchHistoryDetail('day', '2026-10-15');
check('fetchHistoryDetail trả về dòng mã hàng', details.length > 0);
const d1 = details.find(d => d.orderLineId === targetItem.order_line_id);
check('Mã hàng có thuộc tính defectTypes', Array.isArray(d1.defectTypes));
check('Mã hàng gom đủ các loại lỗi', d1.defectTypes.includes('red') && d1.defectTypes.includes('yellow') && d1.defectTypes.includes('tear'));

// 5) Kiểm tra fetchHistoryEntries trả về từng lượt với đúng loại lỗi của từng lượt
const entries = await q.fetchHistoryEntries('day', '2026-10-15');
eq('Có đúng 2 lượt sản xuất', entries.length, 2);
const entry1 = entries.find(e => e.id === e1.id);
const entry2 = entries.find(e => e.id === e2.id);

check('Lượt 1 có lỗi red', entry1.defect_types.includes('red'));
check('Lượt 1 có lỗi yellow', entry1.defect_types.includes('yellow'));
check('Lượt 1 không có lỗi tear', !entry1.defect_types.includes('tear'));

check('Lượt 2 có lỗi tear', entry2.defect_types.includes('tear'));
check('Lượt 2 không có lỗi red', !entry2.defect_types.includes('red'));

console.log(`\nTổng kết: ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.error('Các ca lỗi:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Tất cả kiểm tra thành công 100%!\n');
