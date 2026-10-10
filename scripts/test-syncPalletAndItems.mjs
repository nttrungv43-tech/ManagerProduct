// scripts/test-syncPalletAndItems.mjs
// Kiểm tra tính ĐỒNG BỘ DỮ LIỆU toàn diện giữa:
// - Thao tác Kiện (Pallets / Pallet Lines) ở Container
// - Kế hoạch mã hàng (order_lines.target) ở Tab Mã hàng
// - Tổng theo PO (fetchPoSummaries)
// - Tiến độ & còn lại khi có sản lượng (production_entries)
// - Thêm / Sửa mã hàng (addItem, updateItem)
import { mkdtempSync, rmSync } from 'node:fs';
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

const tmp = mkdtempSync(join(tmpdir(), 'ptracker-sync-'));
const DB = join(tmp, 'sync_test.db');
process.env.EXPO_SQLITE_FILE = DB;

const [{ getDb }, q] = await Promise.all([
  import('../src/db/index.js'),
  import('../src/db/queries.js'),
]);

let db;
try {
  db = await getDb();
  const batchId = (await db.getFirstAsync(`SELECT id FROM order_batches WHERE status='active'`)).id;

  console.log('1) Thiết lập đơn hàng ban đầu: PO 2600168 và Container 1');
  // Thêm 2 mã hàng vào PO 2600168
  const it1 = await q.addItem(batchId, { po: '2600168', itemCode: '1063022', target: 0 });
  check('Tạo mã 1063022 thành công', it1.ok);
  const it2 = await q.addItem(batchId, { po: '2600168', itemCode: '1063023', target: 0 });
  check('Tạo mã 1063023 thành công', it2.ok);

  // Tạo Container 1 cho PO 2600168
  const poRow = await db.getFirstAsync(`SELECT id FROM pos WHERE order_batch_id = ? AND code = '2600168'`, [batchId]);
  const cRes = await db.runAsync(
    `INSERT INTO containers (order_batch_id, po_id, container_no) VALUES (?, ?, 'Container 1')`,
    [batchId, poRow.id]
  );
  const containerId = cRes.lastInsertRowId;

  console.log('\n2) Thêm Kiện 1: Mã 1063022 số lượng 40 pcs');
  const addP1 = await q.addPallet(batchId, containerId, {
    no: 1,
    items: [{ order_line_id: it1.order_line_id, qty: 40 }],
  });
  check('Thêm Kiện 1 thành công', addP1.ok);

  // Kiểm tra đồng bộ sang order_lines.target
  let line1 = await db.getFirstAsync(`SELECT target FROM order_lines WHERE id = ?`, [it1.order_line_id]);
  eq('Kế hoạch order_lines của 1063022 đồng bộ = 40', line1.target, 40);

  // Kiểm tra qua fetchItemsWithStats (Tab Mã hàng)
  let items = await q.fetchItemsWithStats(batchId);
  let card1 = items.find(i => i.order_line_id === it1.order_line_id);
  eq('Tab Mã hàng: thẻ 1063022 có target = 40', card1.target, 40);
  eq('Tab Mã hàng: thẻ 1063022 còn lại = 40', card1.remaining, 40);

  // Kiểm tra qua fetchPoSummaries (Bảng Tổng theo PO)
  let pos = await q.fetchPoSummaries(batchId);
  let poSummary = pos.find(p => p.label === '2600168');
  eq('Bảng PO: Tổng PO 2600168 = 40', poSummary.target, 40);

  console.log('\n3) Sửa Kiện 1: Đổi số lượng 1063022 từ 40 -> 60 pcs');
  const updP1 = await q.updatePallet(batchId, containerId, 1, {
    no: 1,
    items: [{ order_line_id: it1.order_line_id, qty: 60 }],
  });
  check('Sửa Kiện 1 thành công', updP1.ok);

  line1 = await db.getFirstAsync(`SELECT target FROM order_lines WHERE id = ?`, [it1.order_line_id]);
  eq('Kế hoạch order_lines của 1063022 tự động đổi thành 60', line1.target, 60);

  items = await q.fetchItemsWithStats(batchId);
  card1 = items.find(i => i.order_line_id === it1.order_line_id);
  eq('Tab Mã hàng: thẻ 1063022 đổi thành 60', card1.target, 60);
  eq('Tab Mã hàng: còn lại đổi thành 60', card1.remaining, 60);

  pos = await q.fetchPoSummaries(batchId);
  poSummary = pos.find(p => p.label === '2600168');
  eq('Bảng PO: Tổng PO 2600168 tự động tăng thành 60', poSummary.target, 60);

  console.log('\n4) Thêm Kiện 2 Mix (nhiều mã): 1063022 (20 pcs) + 1063023 (50 pcs)');
  const addP2 = await q.addPallet(batchId, containerId, {
    no: 2,
    items: [
      { order_line_id: it1.order_line_id, qty: 20 },
      { order_line_id: it2.order_line_id, qty: 50 },
    ],
  });
  check('Thêm Kiện 2 mix thành công', addP2.ok);

  // 1063022 có trong Kiện 1 (60) + Kiện 2 (20) => tổng phải là 80
  line1 = await db.getFirstAsync(`SELECT target FROM order_lines WHERE id = ?`, [it1.order_line_id]);
  eq('1063022: Tổng qua 2 kiện = 80', line1.target, 80);

  // 1063023 có trong Kiện 2 (50) => tổng phải là 50
  let line2 = await db.getFirstAsync(`SELECT target FROM order_lines WHERE id = ?`, [it2.order_line_id]);
  eq('1063023: Tổng qua kiện = 50', line2.target, 50);

  items = await q.fetchItemsWithStats(batchId);
  card1 = items.find(i => i.order_line_id === it1.order_line_id);
  let card2 = items.find(i => i.order_line_id === it2.order_line_id);
  eq('Tab Mã hàng: 1063022 target = 80', card1.target, 80);
  eq('Tab Mã hàng: 1063023 target = 50', card2.target, 50);

  pos = await q.fetchPoSummaries(batchId);
  poSummary = pos.find(p => p.label === '2600168');
  eq('Bảng PO: Tổng PO 2600168 = 80 + 50 = 130', poSummary.target, 130);

  console.log('\n5) Nhập sản lượng cho 1063022 và kiểm tra tiến độ / còn lại');
  const entryRes = await q.addEntry(it1.order_line_id, {
    date: '2026-10-10',
    qty: 30,
    line: 'manual',
  });
  check('Ghi sản lượng 30 pcs cho 1063022 thành công', entryRes.ok);

  items = await q.fetchItemsWithStats(batchId);
  card1 = items.find(i => i.order_line_id === it1.order_line_id);
  eq('1063022: Đã làm = 30', card1.produced, 30);
  eq('1063022: Còn lại = 80 - 30 = 50', card1.remaining, 50);

  pos = await q.fetchPoSummaries(batchId);
  poSummary = pos.find(p => p.label === '2600168');
  eq('Bảng PO: Đã sản xuất = 30', poSummary.produced, 30);
  eq('Bảng PO: Còn lại = 100', poSummary.remaining, 100);

  console.log('\n6) Xoá Kiện 2 khỏi Container: Đồng bộ giảm số lượng kế hoạch');
  const remP2 = await q.removePallet(batchId, containerId, 2);
  check('Xoá Kiện 2 thành công', remP2.ok);

  // 1063022 chỉ còn Kiện 1 (60)
  line1 = await db.getFirstAsync(`SELECT target FROM order_lines WHERE id = ?`, [it1.order_line_id]);
  eq('1063022: Giảm về 60', line1.target, 60);

  // 1063023 không còn trong kiện nào => target = 0
  line2 = await db.getFirstAsync(`SELECT target FROM order_lines WHERE id = ?`, [it2.order_line_id]);
  eq('1063023: Giảm về 0', line2.target, 0);

  items = await q.fetchItemsWithStats(batchId);
  card1 = items.find(i => i.order_line_id === it1.order_line_id);
  eq('1063022: Target = 60, Đã làm = 30, Còn lại = 30', card1.remaining, 30);

  pos = await q.fetchPoSummaries(batchId);
  poSummary = pos.find(p => p.label === '2600168');
  eq('Bảng PO: Tổng giảm về 60', poSummary.target, 60);
  eq('Bảng PO: Còn lại giảm về 30', poSummary.remaining, 30);

  console.log('\n7) Sửa mã hàng qua updateItem: Đổi kế hoạch hoặc PO');
  const updItemRes = await q.updateItem(batchId, it2.order_line_id, {
    target: 100,
    po: '2600999', // PO mới
    itemCode: '1063023_RENAMED',
  });
  check('Sửa mã hàng thành công', updItemRes.ok);

  items = await q.fetchItemsWithStats(batchId);
  const cardRenamed = items.find(i => i.order_line_id === it2.order_line_id);
  eq('Mã đổi tên thành 1063023_RENAMED', cardRenamed.ntk, '1063023_RENAMED');
  eq('Mã chuyển sang PO 2600999', cardRenamed.po, '2600999');
  eq('Mã có target mới = 100', cardRenamed.target, 100);

  pos = await q.fetchPoSummaries(batchId);
  const newPoSummary = pos.find(p => p.label === '2600999');
  check('PO mới 2600999 tự động xuất hiện trong bảng PO', !!newPoSummary);
  eq('Tổng PO 2600999 = 100', newPoSummary.target, 100);

} finally {
  try { await db?.closeAsync(); } catch { /* đã đóng */ }
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nKết quả test-syncPalletAndItems: ${pass} passed, ${fail} failed`);
if (failures.length) console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
