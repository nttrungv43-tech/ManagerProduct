// scripts/test-containerEdit.mjs
// FEAT-25 — Kiểm tra các chức năng thêm, sửa, xoá Container.
//
// Chạy: node --no-warnings scripts/test-containerEdit.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { containerErrorMessage } from '../src/utils/containerError.js';

let pass = 0;
let fail = 0;
const failures = [];
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failures.push(`${label}\n      nhận: ${JSON.stringify(actual)}\n      cần : ${JSON.stringify(expected)}`));
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

// ── Helper thực hiện queries với node:sqlite tương tự queries.js ─────────────
const failRes = (code, extra = {}) => ({ ok: false, error: { code, ...extra } });
const doneRes = (extra = {}) => ({ ok: true, ...extra });

function testUpdateContainer(db, containerId, { container_no, seal_no }) {
  const cNo = String(container_no ?? '').trim();
  if (!cNo) return failRes('INVALID_CONTAINER_NO');

  const sNo = seal_no !== undefined && seal_no !== null && String(seal_no).trim() !== ''
    ? String(seal_no).trim()
    : null;

  const cur = db.prepare(`SELECT id, order_batch_id FROM containers WHERE id = ?`).get(containerId);
  if (!cur) return failRes('CONTAINER_NOT_FOUND');

  const dup = db.prepare(
    `SELECT id FROM containers WHERE order_batch_id = ? AND container_no = ? AND id != ?`
  ).get(cur.order_batch_id, cNo, containerId);
  if (dup) return failRes('CONTAINER_EXISTS', { container_no: cNo });

  db.prepare(`UPDATE containers SET container_no = ?, seal_no = ? WHERE id = ?`).run(cNo, sNo, containerId);
  return doneRes({ id: containerId, container_no: cNo, seal_no: sNo });
}

function testRemoveContainer(db, containerId) {
  const cur = db.prepare(`SELECT id, container_no FROM containers WHERE id = ?`).get(containerId);
  if (!cur) return failRes('CONTAINER_NOT_FOUND');
  db.prepare(`DELETE FROM containers WHERE id = ?`).run(containerId);
  return doneRes({ id: containerId, container_no: cur.container_no });
}

function testAddContainer(db, batchId, poCode, { container_no, seal_no }) {
  const cNo = String(container_no ?? '').trim();
  if (!cNo) return failRes('INVALID_CONTAINER_NO');
  const code = String(poCode ?? '').trim();
  if (!code) return failRes('INVALID_PO');

  const po = db.prepare(`SELECT id FROM pos WHERE order_batch_id = ? AND code = ?`).get(batchId, code);
  if (!po) return failRes('PO_NOT_FOUND', { po: code });

  const dup = db.prepare(`SELECT id FROM containers WHERE order_batch_id = ? AND container_no = ?`).get(batchId, cNo);
  if (dup) return failRes('CONTAINER_EXISTS', { container_no: cNo });

  const sNo = seal_no !== undefined && seal_no !== null && String(seal_no).trim() !== ''
    ? String(seal_no).trim()
    : null;

  const res = db.prepare(
    `INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, ?, ?)`
  ).run(batchId, po.id, cNo, sNo);
  return doneRes({ id: Number(res.lastInsertRowid), container_no: cNo, seal_no: sNo, po: code });
}

console.log('1) Thiết lập DB và dữ liệu ban đầu');
const db = freshDb();
const batch = db.prepare(
  `INSERT INTO order_batches (status, imported_at) VALUES ('active', '2026-10-09')`
).run();
const batchId = Number(batch.lastInsertRowid);

const po1 = db.prepare(
  `INSERT INTO pos (order_batch_id, code) VALUES (?, '2919')`
).run(batchId);
const po1Id = Number(po1.lastInsertRowid);

const po2 = db.prepare(
  `INSERT INTO pos (order_batch_id, code) VALUES (?, '2920')`
).run(batchId);
const po2Id = Number(po2.lastInsertRowid);

const c1 = db.prepare(
  `INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, 'MCCU1111111', 'SEAL001')`
).run(batchId, po1Id);
const c1Id = Number(c1.lastInsertRowid);

const c2 = db.prepare(
  `INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, 'MCCU2222222', 'SEAL002')`
).run(batchId, po2Id);
const c2Id = Number(c2.lastInsertRowid);

// Thêm kiện vào container 1
const p1 = db.prepare(
  `INSERT INTO pallets (container_id, po_id, pallet_no) VALUES (?, ?, 1)`
).run(c1Id, po1Id);
const p1Id = Number(p1.lastInsertRowid);

eq('Tạo 2 container thành công', [c1Id > 0, c2Id > 0], [true, true]);
eq('Container 1 có 1 kiện', db.prepare(`SELECT COUNT(*) as c FROM pallets WHERE container_id = ?`).get(c1Id).c, 1);

console.log('\n2) Cập nhật Container (updateContainer)');
{
  // Cập nhật cả số cont và số seal
  const res1 = testUpdateContainer(db, c1Id, { container_no: 'MCCU1111888', seal_no: 'SEAL_NEW' });
  eq('Sửa cả tên cont và seal thành công', res1.ok, true);
  const row1 = db.prepare(`SELECT container_no, seal_no FROM containers WHERE id = ?`).get(c1Id);
  eq('DB đã cập nhật container_no mới', row1.container_no, 'MCCU1111888');
  eq('DB đã cập nhật seal_no mới', row1.seal_no, 'SEAL_NEW');

  // Giữ nguyên tên cont, chỉ đổi seal
  const res2 = testUpdateContainer(db, c1Id, { container_no: 'MCCU1111888', seal_no: 'SEAL_UPDATED' });
  eq('Giữ nguyên tên cont của chính nó không bị báo trùng', res2.ok, true);
  const row2 = db.prepare(`SELECT seal_no FROM containers WHERE id = ?`).get(c1Id);
  eq('Seal được cập nhật', row2.seal_no, 'SEAL_UPDATED');

  // Xoá số seal (bỏ trống)
  const res3 = testUpdateContainer(db, c1Id, { container_no: 'MCCU1111888', seal_no: '   ' });
  eq('Bỏ trống seal_no thành công', res3.ok, true);
  const row3 = db.prepare(`SELECT seal_no FROM containers WHERE id = ?`).get(c1Id);
  eq('seal_no trong DB chuyển thành NULL', row3.seal_no, null);

  // Thử đổi sang tên rỗng
  const resEmpty = testUpdateContainer(db, c1Id, { container_no: '   ', seal_no: '123' });
  eq('Chặn tên container rỗng', resEmpty.ok, false);
  eq('Mã lỗi INVALID_CONTAINER_NO', resEmpty.error.code, 'INVALID_CONTAINER_NO');

  // Thử đổi sang tên container khác đã tồn tại trong cùng batch
  const resDup = testUpdateContainer(db, c1Id, { container_no: 'MCCU2222222', seal_no: '123' });
  eq('Chặn trùng tên container trong cùng đơn hàng', resDup.ok, false);
  eq('Mã lỗi CONTAINER_EXISTS', resDup.error.code, 'CONTAINER_EXISTS');

  // Thử sửa container không tồn tại
  const resNotFound = testUpdateContainer(db, 99999, { container_no: 'RANDOM', seal_no: null });
  eq('Báo lỗi khi container không tồn tại', resNotFound.ok, false);
  eq('Mã lỗi CONTAINER_NOT_FOUND', resNotFound.error.code, 'CONTAINER_NOT_FOUND');
}

console.log('\n3) Thêm Container mới (addContainer)');
{
  const resAdd = testAddContainer(db, batchId, '2919', { container_no: 'MCCU3333333', seal_no: 'SEAL3' });
  eq('Thêm container mới thành công', resAdd.ok, true);
  const c3Row = db.prepare(`SELECT * FROM containers WHERE container_no = 'MCCU3333333'`).get();
  eq('Container mới đúng PO', c3Row.po_id, po1Id);
  eq('Container mới đúng seal', c3Row.seal_no, 'SEAL3');

  // Thêm trùng tên
  const resAddDup = testAddContainer(db, batchId, '2920', { container_no: 'MCCU3333333' });
  eq('Chặn thêm trùng mã container', resAddDup.ok, false);
  eq('Mã lỗi CONTAINER_EXISTS khi thêm trùng', resAddDup.error.code, 'CONTAINER_EXISTS');

  // Thêm thiếu tên
  const resAddEmpty = testAddContainer(db, batchId, '2919', { container_no: '' });
  eq('Chặn thêm tên container trống', resAddEmpty.ok, false);

  // Thêm PO không tồn tại
  const resBadPo = testAddContainer(db, batchId, 'PO_KHONG_CO', { container_no: 'MCCU4444444' });
  eq('Chặn thêm vào PO không tồn tại', resBadPo.ok, false);
  eq('Mã lỗi PO_NOT_FOUND', resBadPo.error.code, 'PO_NOT_FOUND');
}

console.log('\n4) Xoá Container (removeContainer) & CASCADE');
{
  // Container 1 có 1 kiện
  const beforePallets = db.prepare(`SELECT COUNT(*) as c FROM pallets WHERE container_id = ?`).get(c1Id).c;
  eq('Trước khi xoá cont 1: có 1 kiện', beforePallets, 1);

  const resDel = testRemoveContainer(db, c1Id);
  eq('Xoá container 1 thành công', resDel.ok, true);

  const afterCont = db.prepare(`SELECT id FROM containers WHERE id = ?`).get(c1Id);
  eq('Container 1 đã bị xoá khỏi DB', afterCont, undefined);

  // Pallet của container 1 tự động bị xoá (CASCADE)
  const afterPallets = db.prepare(`SELECT COUNT(*) as c FROM pallets WHERE container_id = ?`).get(c1Id).c;
  eq('Pallets thuộc container 1 tự động bị xoá sạch (CASCADE)', afterPallets, 0);

  // Xoá container không tồn tại
  const resDelNotFound = testRemoveContainer(db, 99999);
  eq('Xoá container không tồn tại trả về lỗi', resDelNotFound.ok, false);
  eq('Mã lỗi CONTAINER_NOT_FOUND', resDelNotFound.error.code, 'CONTAINER_NOT_FOUND');
}

console.log('\n5) Kiểm tra thông điệp lỗi containerErrorMessage');
{
  eq('Thông báo tên trống',
    containerErrorMessage({ code: 'INVALID_CONTAINER_NO' }),
    'Tên / mã container không được để trống.');

  eq('Thông báo trùng container',
    containerErrorMessage({ code: 'CONTAINER_EXISTS', container_no: 'CONT123' }),
    'Mã container "CONT123" đã tồn tại trong đơn hàng.');

  eq('Thông báo không tìm thấy container',
    containerErrorMessage({ code: 'CONTAINER_NOT_FOUND' }),
    'Không tìm thấy container.');

  eq('Thông báo PO không hợp lệ',
    containerErrorMessage({ code: 'PO_NOT_FOUND' }),
    'Vui lòng chọn mã PO hợp lệ cho container.');
}

console.log(`\nKết quả test container: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('\nChi tiết thất bại:');
  failures.forEach(f => console.error(f));
  process.exit(1);
}
