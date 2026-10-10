// scripts/test-palletCrud.mjs
// Kiểm tra các chức năng thêm, sửa, xoá Kiện (Pallet) trong Container trên SQLite thật.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { palletErrorMessage } from '../src/utils/palletError.js';

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

const failRes = (code, extra = {}) => ({ ok: false, error: { code, ...extra } });
const doneRes = (extra = {}) => ({ ok: true, ...extra });
function parseQty(v) {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).trim());
  return Number.isInteger(n) ? n : null;
}

// ── Triển khai hàm mô phỏng queries.js với DatabaseSync ─────────────────────────

function testResolvePalletItems(db, container, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return failRes('PALLET_EMPTY');
  }
  const out = [];
  const seenLineIds = new Set();
  for (const it of items) {
    const q = parseQty(it?.qty);
    if (q === null || q <= 0) {
      return failRes('INVALID_PALLET_QTY', { ntk: it?.ntk });
    }

    let lineId = parseQty(it?.order_line_id);
    const ntk = String(it?.ntk ?? '').trim();

    if (!lineId && !ntk) {
      return failRes('INVALID_NTK');
    }

    if (!lineId && ntk) {
      let line = null;
      if (container?.po_id) {
        line = db.prepare('SELECT id, item_code FROM order_lines WHERE po_id = ? AND item_code = ?').get(container.po_id, ntk);
      }
      if (!line && container?.order_batch_id) {
        line = db.prepare(
          'SELECT ol.id, ol.item_code FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id = ? AND ol.item_code = ?'
        ).get(container.order_batch_id, ntk);
      }
      if (!line) {
        return failRes('ITEM_NOT_IN_ORDER', { ntk });
      }
      lineId = line.id;
    } else if (lineId) {
      const line = db.prepare('SELECT id, item_code FROM order_lines WHERE id = ?').get(lineId);
      if (!line) {
        return failRes('ITEM_NOT_IN_ORDER', { ntk: ntk || String(lineId) });
      }
    }

    if (seenLineIds.has(lineId)) {
      return failRes('DUPLICATE_NTK', { ntk: ntk || String(lineId) });
    }
    seenLineIds.add(lineId);
    out.push({ order_line_id: lineId, qty: q, done: it?.done });
  }
  return { ok: true, items: out };
}

function testAddPallet(db, containerId, { no, items }) {
  const palletNo = parseQty(no);
  if (palletNo === null || palletNo <= 0) return failRes('INVALID_PALLET_NO');

  const ct = db.prepare('SELECT id, po_id, order_batch_id FROM containers WHERE id = ?').get(containerId);
  if (!ct) return failRes('CONTAINER_NOT_FOUND');
  const dup = db.prepare('SELECT 1 AS x FROM pallets WHERE container_id = ? AND pallet_no = ?').get(containerId, palletNo);
  if (dup) return failRes('PALLET_EXISTS', { no: palletNo });

  const resolved = testResolvePalletItems(db, ct, items);
  if (!resolved.ok) return resolved;
  const norm = resolved.items;

  db.exec('BEGIN TRANSACTION');
  try {
    const res = db.prepare(
      'INSERT INTO pallets (container_id, po_id, pallet_no, is_mixed) VALUES (?, ?, ?, ?)'
    ).run(containerId, ct.po_id, palletNo, norm.length > 1 ? 1 : 0);
    const palletId = Number(res.lastInsertRowid);
    for (const it of norm) {
      db.prepare(
        'INSERT INTO pallet_lines (pallet_id, order_line_id, qty, done) VALUES (?, ?, ?, 0)'
      ).run(palletId, it.order_line_id, it.qty);
    }
    db.exec('COMMIT');
    return doneRes({ no: palletNo, pallet_id: palletId });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function testUpdatePallet(db, containerId, palletNo, { no, items }) {
  const curPalletNo = parseQty(palletNo);
  if (curPalletNo === null || curPalletNo <= 0) return failRes('INVALID_PALLET_NO');

  const ct = db.prepare('SELECT id, po_id, order_batch_id FROM containers WHERE id = ?').get(containerId);
  if (!ct) return failRes('CONTAINER_NOT_FOUND');

  const pal = db.prepare(
    'SELECT id, container_id, po_id, pallet_no FROM pallets WHERE container_id = ? AND pallet_no = ?'
  ).get(containerId, curPalletNo);
  if (!pal) return failRes('PALLET_NOT_FOUND', { no: curPalletNo });

  let targetPalletNo = curPalletNo;
  if (no !== undefined && no !== null && String(no).trim() !== '') {
    const parsedNo = parseQty(no);
    if (parsedNo === null || parsedNo <= 0) return failRes('INVALID_PALLET_NO');
    if (parsedNo !== curPalletNo) {
      const dup = db.prepare(
        'SELECT 1 FROM pallets WHERE container_id = ? AND pallet_no = ? AND id != ?'
      ).get(containerId, parsedNo, pal.id);
      if (dup) return failRes('PALLET_EXISTS', { no: parsedNo });
      targetPalletNo = parsedNo;
    }
  }

  const resolved = testResolvePalletItems(db, ct, items);
  if (!resolved.ok) return resolved;
  const norm = resolved.items;

  db.exec('BEGIN TRANSACTION');
  try {
    const existingLines = db.prepare(
      'SELECT order_line_id, done FROM pallet_lines WHERE pallet_id = ?'
    ).all(pal.id);
    const doneByLineId = new Map(existingLines.map(l => [l.order_line_id, l.done]));

    db.prepare('DELETE FROM pallet_lines WHERE pallet_id = ?').run(pal.id);
    for (const it of norm) {
      const isDone = it.done !== undefined ? (it.done ? 1 : 0) : (doneByLineId.get(it.order_line_id) ?? 0);
      db.prepare(
        'INSERT INTO pallet_lines (pallet_id, order_line_id, qty, done) VALUES (?, ?, ?, ?)'
      ).run(pal.id, it.order_line_id, it.qty, isDone);
    }
    db.prepare(
      'UPDATE pallets SET pallet_no = ?, is_mixed = ? WHERE id = ?'
    ).run(targetPalletNo, norm.length > 1 ? 1 : 0, pal.id);
    db.exec('COMMIT');
    return doneRes({ no: targetPalletNo });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function testRemovePallet(db, containerId, palletNo) {
  const curPalletNo = parseQty(palletNo);
  if (curPalletNo === null || curPalletNo <= 0) return failRes('INVALID_PALLET_NO');

  const pal = db.prepare('SELECT id FROM pallets WHERE container_id = ? AND pallet_no = ?').get(containerId, curPalletNo);
  if (!pal) return failRes('PALLET_NOT_FOUND', { no: curPalletNo });
  db.prepare('DELETE FROM pallets WHERE id = ?').run(pal.id);
  return doneRes({ no: curPalletNo });
}

// ══════════════════════════════════════════════════════════════════════════════
// BẮT ĐẦU CHẠY KIỂM THỬ
// ══════════════════════════════════════════════════════════════════════════════

console.log('1) Thiết lập DB và nạp PO, Container, Order lines');
const db = freshDb();
const batch = db.prepare(`INSERT INTO order_batches (status, imported_at) VALUES ('active', '2026-10-10')`).run();
const batchId = Number(batch.lastInsertRowid);

const po = db.prepare(`INSERT INTO pos (order_batch_id, code) VALUES (?, '2919')`).run(batchId);
const poId = Number(po.lastInsertRowid);

const line1 = db.prepare(`INSERT INTO order_lines (po_id, item_code, target) VALUES (?, '106385GF', 500)`).run(poId);
const line1Id = Number(line1.lastInsertRowid);

const line2 = db.prepare(`INSERT INTO order_lines (po_id, item_code, target) VALUES (?, '106386GF', 300)`).run(poId);
const line2Id = Number(line2.lastInsertRowid);

const cont = db.prepare(`INSERT INTO containers (order_batch_id, po_id, container_no) VALUES (?, ?, 'MCCU111')`).run(batchId, poId);
const contId = Number(cont.lastInsertRowid);

console.log('2) Kiểm thử testAddPallet (Thêm kiện)');
// 2.1 Thêm kiện bằng order_line_id
const addRes1 = testAddPallet(db, contId, {
  no: '1',
  items: [{ order_line_id: line1Id, qty: '50' }],
});
check('Thêm kiện 1 thành công', addRes1.ok);
eq('Số hiệu kiện 1 đúng', addRes1.no, 1);

// Kiểm tra trong DB
const p1Lines = db.prepare(`SELECT * FROM pallet_lines WHERE pallet_id = ?`).all(addRes1.pallet_id);
eq('Kiện 1 có đúng 1 dòng hàng', p1Lines.length, 1);
eq('Dòng hàng có qty = 50', p1Lines[0].qty, 50);
eq('Mặc định done = 0', p1Lines[0].done, 0);

// 2.2 Thêm kiện bằng ntk (tên mã hàng)
const addRes2 = testAddPallet(db, contId, {
  no: '2',
  items: [{ ntk: '106386GF', qty: '80' }],
});
check('Thêm kiện 2 bằng ntk thành công', addRes2.ok);
const p2Lines = db.prepare(`SELECT * FROM pallet_lines WHERE pallet_id = ?`).all(addRes2.pallet_id);
eq('Kiện 2 map đúng order_line_id', p2Lines[0].order_line_id, line2Id);

// 2.3 Thêm kiện mix (nhiều mã hàng)
const addRes3 = testAddPallet(db, contId, {
  no: '3',
  items: [
    { ntk: '106385GF', qty: '30' },
    { ntk: '106386GF', qty: '40' },
  ],
});
check('Thêm kiện mix 3 thành công', addRes3.ok);
const pal3 = db.prepare(`SELECT is_mixed FROM pallets WHERE id = ?`).get(addRes3.pallet_id);
eq('Kiện 3 được đánh dấu is_mixed = 1', pal3.is_mixed, 1);

// 2.4 Thất bại khi trùng số hiệu kiện
const addDup = testAddPallet(db, contId, {
  no: '1',
  items: [{ ntk: '106385GF', qty: '10' }],
});
eq('Báo lỗi trùng số hiệu PALLET_EXISTS', addDup.error?.code, 'PALLET_EXISTS');

// 2.5 Thất bại khi không có loại hàng (PALLET_EMPTY)
const addEmpty = testAddPallet(db, contId, { no: '4', items: [] });
eq('Báo lỗi PALLET_EMPTY', addEmpty.error?.code, 'PALLET_EMPTY');

// 2.6 Thất bại khi trùng mã trong cùng kiện (DUPLICATE_NTK)
const addDupNtk = testAddPallet(db, contId, {
  no: '4',
  items: [
    { ntk: '106385GF', qty: '10' },
    { ntk: '106385GF', qty: '20' },
  ],
});
eq('Báo lỗi DUPLICATE_NTK', addDupNtk.error?.code, 'DUPLICATE_NTK');

// 2.7 Thất bại khi số lượng <= 0
const addInvalidQty = testAddPallet(db, contId, {
  no: '4',
  items: [{ ntk: '106385GF', qty: '0' }],
});
eq('Báo lỗi INVALID_PALLET_QTY', addInvalidQty.error?.code, 'INVALID_PALLET_QTY');

// 2.8 Thất bại khi mã không có trong đơn
const addUnknown = testAddPallet(db, contId, {
  no: '4',
  items: [{ ntk: 'UNKNOWN_CODE', qty: '10' }],
});
eq('Báo lỗi ITEM_NOT_IN_ORDER', addUnknown.error?.code, 'ITEM_NOT_IN_ORDER');

console.log('3) Kiểm thử testUpdatePallet (Sửa kiện & giữ trạng thái tick)');
// Đánh dấu tick dòng hàng trong kiện 1
db.prepare(`UPDATE pallet_lines SET done = 1 WHERE pallet_id = ?`).run(addRes1.pallet_id);
const checkDoneBefore = db.prepare(`SELECT done FROM pallet_lines WHERE pallet_id = ?`).get(addRes1.pallet_id);
eq('Kiện 1 đã được đánh dấu done = 1', checkDoneBefore.done, 1);

// Cập nhật số lượng của kiện 1 từ 50 lên 120 (chỉ truyền ntk và qty)
const updateRes1 = testUpdatePallet(db, contId, '1', {
  items: [{ ntk: '106385GF', qty: '120' }],
});
check('Sửa kiện 1 thành công', updateRes1.ok);

// Kiểm tra số lượng và trạng thái tick sau khi sửa
const linesAfterUpdate = db.prepare(`SELECT qty, done FROM pallet_lines WHERE pallet_id = ?`).all(addRes1.pallet_id);
eq('Số lượng sau khi sửa cập nhật thành 120', linesAfterUpdate[0].qty, 120);
eq('Trạng thái done VẪN ĐƯỢC GIỮ NGUYÊN = 1 (không bị mất tick)', linesAfterUpdate[0].done, 1);

// Đổi số hiệu kiện 1 thành kiện 10
const updateRenumber = testUpdatePallet(db, contId, '1', {
  no: '10',
  items: [{ ntk: '106385GF', qty: '120' }],
});
check('Đổi số hiệu kiện 1 -> 10 thành công', updateRenumber.ok);
eq('Số hiệu mới là 10', updateRenumber.no, 10);
const palRenumbered = db.prepare(`SELECT pallet_no FROM pallets WHERE id = ?`).get(addRes1.pallet_id);
eq('Pallet trong DB đổi sang 10', palRenumbered.pallet_no, 10);

// Thử đổi số hiệu kiện 10 sang số hiệu kiện 2 (đã tồn tại) -> phải bị chặn
const updateDupNo = testUpdatePallet(db, contId, '10', {
  no: '2',
  items: [{ ntk: '106385GF', qty: '120' }],
});
eq('Báo lỗi trùng số hiệu PALLET_EXISTS khi đổi số', updateDupNo.error?.code, 'PALLET_EXISTS');

console.log('4) Kiểm thử testRemovePallet (Xoá kiện)');
const removeRes = testRemovePallet(db, contId, '10');
check('Xoá kiện 10 thành công', removeRes.ok);
const palAfterDelete = db.prepare(`SELECT id FROM pallets WHERE id = ?`).get(addRes1.pallet_id);
check('Kiện 10 không còn trong bảng pallets', palAfterDelete === undefined);
const linesAfterDelete = db.prepare(`SELECT id FROM pallet_lines WHERE pallet_id = ?`).all(addRes1.pallet_id);
eq('Dòng hàng của kiện 10 bị xoá tự động theo CASCADE', linesAfterDelete.length, 0);

console.log('5) Kiểm thử palletErrorMessage tiếng Việt');
eq('PALLET_EMPTY', palletErrorMessage({ code: 'PALLET_EMPTY' }), 'Kiện phải có ít nhất một loại hàng.');
eq('DUPLICATE_NTK', palletErrorMessage({ code: 'DUPLICATE_NTK', ntk: 'ABC' }), 'Kiện không được có hai dòng cùng mã ABC.');
eq('INVALID_PALLET_QTY', palletErrorMessage({ code: 'INVALID_PALLET_QTY' }), 'Số lượng trong kiện phải là số nguyên lớn hơn 0.');
eq('PALLET_EXISTS', palletErrorMessage({ code: 'PALLET_EXISTS', no: 5 }), 'Kiện 5 đã tồn tại trong container này.');

console.log(`\nKết quả test-palletCrud: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  failures.forEach(f => console.error(f));
  process.exit(1);
}
