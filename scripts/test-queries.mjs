// scripts/test-queries.mjs
// FEAT-21 — E2E lớp truy vấn trên **SQLite thật** + **`Dmac.json` thật**.
//
// Chạy `src/db/index.js` và `src/db/queries.js` **nguyên bản**, chỉ thay `expo-sqlite` bằng
// adapter `node:sqlite` (xem `e2e-sqlite/register.mjs`). Không stub SQL ⇒ lỗi SQL, lỗi FK/CHECK
// và sai số tổng đều bị bắt.
//
// Vì sao cần: các test khác kiểm *hàm thuần*. Ở đây kiểm *đường đi thật* — nhập file nguồn rồi
// đọc lại qua đúng các hàm mà màn hình gọi, và đối chiếu số với chính file nguồn.
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

const tmp = mkdtempSync(join(tmpdir(), 'ptracker-'));
const DB = join(tmp, 'production_tracker.db');

// Nạp app SAU khi đã cài hook, và ép DB dùng file tạm (không đụng file thật của máy).
process.env.EXPO_SQLITE_FILE = DB;
const [{ getDb }, q] = await Promise.all([
  import('../src/db/index.js'),
  import('../src/db/queries.js'),
]);
const dmac = JSON.parse(readFileSync(new URL('../src/data/Dmac.json', import.meta.url), 'utf8'));
const src = dmac.batches[0].totals;
const poQty = Object.fromEntries(dmac.shipment_list.map(s => [s.po_no, s.totals.qty]));

let db;
try {
  db = await getDb();
  const batchId = (await db.getFirstAsync(`SELECT id FROM order_batches WHERE status='active'`)).id;

  // ══════════════════════════════════════════════════════════════════════
  console.log('1) Nhập `Dmac.json` thật qua `importPackingV1`');
  // ══════════════════════════════════════════════════════════════════════
  const r = await q.importPackingV1(batchId, dmac);
  check('nhập thành công', r.ok, JSON.stringify(r.error));
  eq('12 PO', r.pos, 12);
  eq('12 container', r.containers, src.containers);
  eq('220 kiện', r.pallets, src.packages);

  const cnt = async (t) => (await db.getFirstAsync(`SELECT COUNT(*) c FROM ${t}`)).c;
  eq('49 mã (distinct)', (await db.getFirstAsync(`SELECT COUNT(DISTINCT item_code) c FROM order_lines`)).c, 49);
  eq('55 số hiệu DMAC được giữ', await cnt('item_refs'), 55);
  eq('Σ target = 25520', (await db.getFirstAsync(`SELECT SUM(target) t FROM order_lines`)).t, src.qty);

  // Nhập lại lần hai phải không nhân đôi (idempotent) — nếu không thì dữ liệu sai.
  await q.importPackingV1(batchId, dmac);
  eq('nạp lại lần 2: Σ target KHÔNG nhân đôi', (await db.getFirstAsync(`SELECT SUM(target) t FROM order_lines`)).t, src.qty);
  eq('nạp lại lần 2: vẫn 12 container', await cnt('containers'), 12);

  // ══════════════════════════════════════════════════════════════════════
  console.log('2) `fetchItemsWithStats` — mỗi thẻ là một (PO × mã)');
  // ══════════════════════════════════════════════════════════════════════
  const items = await q.fetchItemsWithStats(batchId);
  eq('số thẻ = số dòng đơn hàng', items.length, await cnt('order_lines'));
  eq('tổng Kế hoạch = 25520', items.reduce((s, i) => s + i.target, 0), src.qty);
  eq('mọi thẻ có PO đúng 1 PO (không còn chuỗi `+`)', items.filter(i => i.po.includes('+')).length, 0);
  check('mọi thẻ có `order_line_id`', items.every(i => Number.isInteger(i.order_line_id)));
  // Mã đa PO: 1072017GF thuộc 6 PO ⇒ phải có 6 thẻ, mỗi thẻ một `target` khác nhau.
  const multi = items.filter(i => i.ntk === '1072017GF');
  eq('1072017GF tách thành 6 thẻ (không cần splitItemRows)', multi.length, 6);
  eq('… và tổng 6 thẻ = 2808', multi.reduce((s, i) => s + i.target, 0), 2808);

  // ══════════════════════════════════════════════════════════════════════
  console.log('3) `fetchPoSummaries` — cột "Đã sản xuất"/"Còn lại" là SỐ THẬT');
  // ══════════════════════════════════════════════════════════════════════
  const po = await q.fetchPoSummaries(batchId);
  eq('12 dòng PO', po.length, 12);
  eq('KHÔNG dòng nào `produced === null` (hết cột `-`)', po.filter(p => p.produced === null).length, 0);
  eq('Σ Tổng = 25520', po.reduce((s, p) => s + p.target, 0), src.qty);
  const wrongTotal = po.filter(p => p.target !== poQty[p.label]);
  eq('Tổng từng PO khớp đúng `shipment_list` của file nguồn', wrongTotal.length, 0);
  check('PO 2924 Tổng > 0 (bản cũ bằng 0)', po.find(p => p.label === '2924')?.target > 0);
  check('PO 2929 Tổng > 0 (bản cũ bằng 0)', po.find(p => p.label === '2929')?.target > 0);

  // ══════════════════════════════════════════════════════════════════════
  console.log('4) Nhật ký sản xuất — INV-D8 và hạn mức');
  // ══════════════════════════════════════════════════════════════════════
  const line = multi[0];
  const a1 = await q.addEntry(line.order_line_id, { date: '2026-10-04', qty: 100, line: 'manual', defectQty: 4, defectTypes: ['yellow'] });
  check('thêm nhật ký thành công', a1.ok, JSON.stringify(a1.error));
  const a2 = await q.addEntry(line.order_line_id, { date: '2026-10-04', qty: 50, line: 'auto' });
  check('thêm nhật ký thứ 2', a2.ok, JSON.stringify(a2.error));

  const log = await q.fetchEntriesForLine(line.order_line_id);
  eq('lịch sử có 2 mục', log.length, 2);
  eq('tổng qty = 150', log.reduce((s, e) => s + e.qty, 0), 150);
  check('loại hàng lỗi ghi vào bảng riêng', log.some(e => (e.defect_types || '').includes('yellow')));

  const after = (await q.fetchItemsWithStats(batchId)).find(i => i.order_line_id === line.order_line_id);
  eq('sản lượng của THẺ = 150 (đúng riêng PO này)', after.produced, 150);
  eq('lỗi của thẻ = 4', after.defect, 4);
  eq('còn lại = target - 150', after.remaining, line.target - 150);

  const poRow = (await q.fetchPoSummaries(batchId)).find(p => p.label === line.po);
  eq('bảng PO cũng nhận đúng 150', poRow.produced, 150);
  const sumPo = (await q.fetchPoSummaries(batchId)).reduce((s, p) => s + p.produced, 0);
  eq('Σ "Đã sản xuất" của bảng PO = Σ nhật ký (không vượt, INV-D8)', sumPo, 150);

  // Vượt hạn mức của DÒNG ĐƠN HÀNG bị chặn — nhưng KHÔNG ảnh hưởng PO khác của cùng mã.
  const over = await q.addEntry(line.order_line_id, { date: '2026-10-04', qty: line.target });
  check('vượt hạn mức bị chặn', over.ok === false && over.error.code === 'OVER_TARGET', JSON.stringify(over));
  const other = multi[1];
  const okOther = await q.addEntry(other.order_line_id, { date: '2026-10-04', qty: 50 });
  check('nhập PO khác của CÙNG mã vẫn được (bản cũ không làm được)', okOther.ok, JSON.stringify(okOther.error));

  // Ngày sai bị chặn, và báo lỗi rõ (không ném lỗi SQL thô).
  const badDate = await q.addEntry(other.order_line_id, { date: '2026-13-45', qty: 1 });
  check('ngày sai bị chặn với mã lỗi', badDate.ok === false && badDate.error.code === 'INVALID_DATE', JSON.stringify(badDate));

  // Sửa nhật ký: trừ dòng đang sửa ra khỏi hạn mức (AC-ITEM-18).
  const upd = await q.updateEntry(a2.id, { date: '2026-10-04', qty: line.target, line: 'auto' });
  check('sửa lên đúng bằng hạn mức vẫn được (không tự vượt)', upd.ok, JSON.stringify(upd.error));

  // ══════════════════════════════════════════════════════════════════════
  console.log('5) Xoá mã hàng — FK chặn thay cho check tay');
  // ══════════════════════════════════════════════════════════════════════
  const inPallet = (await db.getFirstAsync(
    `SELECT pl.order_line_id FROM pallet_lines pl WHERE pl.done = 0 LIMIT 1`
  )).order_line_id;
  const delPallet = await q.removeItem(batchId, inPallet);
  check('mã còn trong kiện thì bị chặn ITEM_IN_PALLETS',
    delPallet.ok === false && delPallet.error.code === 'ITEM_IN_PALLETS', JSON.stringify(delPallet));
  const delEntries = await q.removeItem(batchId, line.order_line_id);
  check('mã có nhật ký thì bị chặn ITEM_HAS_ENTRIES',
    delEntries.ok === false && delEntries.error.code === 'ITEM_HAS_ENTRIES', JSON.stringify(delEntries));

  // ══════════════════════════════════════════════════════════════════════
  console.log('6) Container/kiện — `done` là cột, không mất tick khi đổi kiện');
  // ══════════════════════════════════════════════════════════════════════
  let cvs = await q.fetchContainersView(batchId);
  eq('đọc được 12 container', cvs.length, 12);
  eq('tổng kiện = 220', cvs.reduce((s, c) => s + c.pallets.length, 0), src.packages);
  const pal = cvs[0].pallets[0];
  const palLine = pal.items[0];
  check('tick 1 dòng hàng trong kiện', (await q.setPalletLineDone(palLine.id, true)).ok);
  cvs = await q.fetchContainersView(batchId);
  check('tick được đọc lại', cvs[0].pallets[0].items[0].done === true);
  check('thêm kiện mới KHÔNG làm mất tick kiện cũ',
    cvs[0].pallets[0].items[0].done === true);
  const newPal = await q.addPallet(cvs[0].id, { no: 999, items: [{ order_line_id: palLine.order_line_id, qty: 5 }] });
  check('thêm kiện thành công', newPal.ok, JSON.stringify(newPal.error));
  cvs = await q.fetchContainersView(batchId);
  check('tick vẫn còn sau khi thêm kiện', cvs[0].pallets[0].items[0].done === true);
  await q.removePallet(cvs[0].id, 999);

  // ══════════════════════════════════════════════════════════════════════
  console.log('7) Hoàn tất đơn — INV-B1/INV-B3');
  // ══════════════════════════════════════════════════════════════════════
  const fin = await q.finishOrder();
  check('hoàn tất thành công', fin.ok, JSON.stringify(fin.error));
  const actives = (await db.getAllAsync(`SELECT id FROM order_batches WHERE status='active'`)).length;
  eq('đúng 1 đơn active sau khi hoàn tất', actives, 1);
  eq('đơn mới TRẮNG (FEAT-14)', (await q.fetchItemsWithStats(fin.id)).length, 0);
  eq('bảng PO của đơn mới rỗng', (await q.fetchPoSummaries(fin.id)).length, 0);
  eq('container của đơn mới rỗng', (await q.fetchContainersView(fin.id)).length, 0);
  const arch = await q.fetchArchives();
  check('đơn cũ vào lịch sử lưu trữ', arch.length === 1 && arch[0].id === batchId, JSON.stringify(arch));
  eq('lịch sử lưu trữ nhớ đúng tổng', arch[0].total_target, src.qty);
  eq('lịch sử lưu trữ nhớ đúng số đã sản xuất', arch[0].total_produced, line.target);

  const busy = await Promise.all([q.finishOrder(), q.finishOrder()]);
  eq('gọi song song 2 lần ⇒ vẫn đúng 1 active',
    (await db.getAllAsync(`SELECT id FROM order_batches WHERE status='active'`)).length, 1);
  void busy;

  // ══════════════════════════════════════════════════════════════════════
  console.log('8) Xoá đơn lưu trữ — 1 câu DELETE nhờ CASCADE');
  // ══════════════════════════════════════════════════════════════════════
  const prev = await q.previewArchiveDelete(batchId);
  check('xem trước cho biết số nhật ký sẽ mất', prev.ok && prev.entryCount > 0, JSON.stringify(prev));
  const del = await q.deleteArchive(batchId);
  check('xoá thành công', del.ok, JSON.stringify(del.error));
  eq('mọi bảng con đã đi theo (pos)', await cnt('pos'), 0);
  eq('… order_lines', await cnt('order_lines'), 0);
  eq('… production_entries', await cnt('production_entries'), 0);
  eq('… pallets', await cnt('pallets'), 0);
  eq('… pallet_lines', await cnt('pallet_lines'), 0);
  eq('… item_refs', await cnt('item_refs'), 0);

  // ══════════════════════════════════════════════════════════════════════
  console.log('9) Lịch sử');
  // ══════════════════════════════════════════════════════════════════════
  await q.importPackingV1(batchId, dmac);
  const cur = (await db.getFirstAsync(`SELECT id FROM order_batches WHERE status='active'`)).id;
  const l2 = (await q.fetchItemsWithStats(cur)).find(i => i.ntk === '106235GF');
  await q.addEntry(l2.order_line_id, { date: '2026-10-04', qty: 60, line: 'manual', defectQty: 2, defectTypes: ['red'] });
  await q.addEntry(l2.order_line_id, { date: '2026-10-05', qty: 40, line: 'auto' });
  const days = await q.fetchHistoryGrouped('day');
  const d4 = days.find(d => d.groupKey === '2026-10-04');
  eq('nhóm ngày 10/04 tổng 60', d4?.total, 60);
  eq('… tách manual', d4?.manualTotal, 60);
  eq('… tách auto', d4?.autoTotal, 0);
  eq('… tổng lỗi', d4?.defectTotal, 2);
  const mon = await q.fetchHistoryGrouped('month');
  eq('nhóm tháng gộp cả 2 ngày', mon.find(m => m.groupKey === '2026-10')?.total, 100);
  const det = await q.fetchHistoryDetail('day', '2026-10-05');
  eq('chi tiết 10/05 có 1 dòng, kèm PO', det.length === 1 && !!det[0].po, JSON.stringify(det));
  check('năm có dữ liệu', (await q.fetchAvailableYears()).includes('2026'));
} finally {
  try { await db?.closeAsync(); } catch { /* đã đóng */ }
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nKết quả: ${pass} passed, ${fail} failed`);
if (failures.length) console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);