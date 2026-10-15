// scripts/test-palletPackAndLabel.mjs
// Kiểm tra trạng thái đóng dở dang (packed_qty), dán nhãn (is_labeled), ghi chú (note),
// và quy tắc gạch ngang (line-through CHỈ khi đủ số lượng VÀ đã dán nhãn).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getItemPackInfo } from '../src/utils/packStatus.js';

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

console.log('\n--- 1. Kiểm tra hàm thuần getItemPackInfo ---');
{
  // Chưa đóng gì
  const it0 = { qty: 100, packed_qty: 0, is_labeled: 0, done: 0 };
  const info0 = getItemPackInfo(it0);
  eq('Chưa đóng: plannedQty', info0.plannedQty, 100);
  eq('Chưa đóng: packedQty', info0.packedQty, 0);
  eq('Chưa đóng: remaining', info0.remaining, 100);
  eq('Chưa đóng: isComplete', info0.isComplete, false);
  eq('Chưa đóng: isPartial', info0.isPartial, false);
  eq('Chưa đóng: isWaitingLabel', info0.isWaitingLabel, false);
  eq('Chưa đóng: isUnpacked', info0.isUnpacked, true);

  // Đang đóng dở dang (60/100, chưa dán nhãn)
  const it1 = { qty: 100, packed_qty: 60, is_labeled: 0, done: 0 };
  const info1 = getItemPackInfo(it1);
  eq('Đóng dở 60/100: packedQty', info1.packedQty, 60);
  eq('Đóng dở 60/100: remaining', info1.remaining, 40);
  eq('Đóng dở 60/100: isPartial (nổi bật thông tin đóng & thiếu)', info1.isPartial, true);
  eq('Đóng dở 60/100: isComplete (KHÔNG gạch ngang)', info1.isComplete, false);
  eq('Đóng dở 60/100: isWaitingLabel', info1.isWaitingLabel, false);

  // Đang đóng dở dang (60/100, đã dán nhãn)
  const it2 = { qty: 100, packed_qty: 60, is_labeled: 1, done: 0 };
  const info2 = getItemPackInfo(it2);
  eq('Đóng dở nhưng đã dán nhãn: isPartial', info2.isPartial, true);
  eq('Đóng dở nhưng đã dán nhãn: isComplete (KHÔNG gạch ngang vì thiếu số lượng)', info2.isComplete, false);

  // Đã đóng đủ 100/100 nhưng CHƯA dán nhãn
  const it3 = { qty: 100, packed_qty: 100, is_labeled: 0, done: 0 };
  const info3 = getItemPackInfo(it3);
  eq('Đủ số lượng nhưng chưa dán nhãn: isFullQty', info3.isFullQty, true);
  eq('Đủ số lượng nhưng chưa dán nhãn: isWaitingLabel', info3.isWaitingLabel, true);
  eq('Đủ số lượng nhưng chưa dán nhãn: isComplete (KHÔNG gạch ngang vì chưa dán nhãn)', info3.isComplete, false);

  // Đã đóng đủ 100/100 VÀ ĐÃ dán nhãn
  const it4 = { qty: 100, packed_qty: 100, is_labeled: 1, done: 1 };
  const info4 = getItemPackInfo(it4);
  eq('Đủ số lượng VÀ đã dán nhãn: isComplete (GẠCH NGANG HOÀN TẤT)', info4.isComplete, true);
  eq('Đủ số lượng VÀ đã dán nhãn: isWaitingLabel', info4.isWaitingLabel, false);
  eq('Đủ số lượng VÀ đã dán nhãn: isPartial', info4.isPartial, false);
  eq('Đủ số lượng VÀ đã dán nhãn: remaining', info4.remaining, 0);

  // Đóng dư 110/100 và đã dán nhãn
  const it5 = { qty: 100, packed_qty: 110, is_labeled: 1, done: 1 };
  const info5 = getItemPackInfo(it5);
  eq('Đóng dư và đã dán nhãn: isComplete', info5.isComplete, true);
  eq('Đóng dư và đã dán nhãn: remaining = 0', info5.remaining, 0);
}

console.log('\n--- 2. Kiểm tra thao tác DB SQLite: updatePalletLinePackStatus, togglePalletLineLabel, setPalletLineDone ---');
{
  const db = freshDb();

  // Khởi tạo batch, PO, order_line, container, pallet, pallet_line
  db.exec(`INSERT INTO order_batches (status, imported_at) VALUES ('active', '2026-10-10')`);
  const batchId = Number(db.prepare(`SELECT last_insert_rowid() as id`).get().id);

  db.exec(`INSERT INTO pos (order_batch_id, code) VALUES (${batchId}, 'PO_101')`);
  const poId = Number(db.prepare(`SELECT last_insert_rowid() as id`).get().id);

  db.exec(`INSERT INTO order_lines (po_id, item_code, target) VALUES (${poId}, 'NTK_A', 100)`);
  const lineId = Number(db.prepare(`SELECT last_insert_rowid() as id`).get().id);

  db.exec(`INSERT INTO containers (order_batch_id, po_id, container_no) VALUES (${batchId}, ${poId}, 'CONT_01')`);
  const contId = Number(db.prepare(`SELECT last_insert_rowid() as id`).get().id);

  db.exec(`INSERT INTO pallets (container_id, po_id, pallet_no) VALUES (${contId}, ${poId}, 1)`);
  const palId = Number(db.prepare(`SELECT last_insert_rowid() as id`).get().id);

  db.exec(`INSERT INTO pallet_lines (pallet_id, order_line_id, qty, packed_qty, is_labeled, note, done)
           VALUES (${palId}, ${lineId}, 100, 0, 0, NULL, 0)`);
  const plId = Number(db.prepare(`SELECT last_insert_rowid() as id`).get().id);

  // Kiểm tra giá trị ban đầu
  const row0 = db.prepare(`SELECT * FROM pallet_lines WHERE id = ?`).get(plId);
  eq('Ban đầu: packed_qty', Number(row0.packed_qty), 0);
  eq('Ban đầu: is_labeled', Number(row0.is_labeled), 0);
  eq('Ban đầu: note', row0.note, null);
  eq('Ban đầu: done', Number(row0.done), 0);

  // Giả lập updatePalletLinePackStatus với đóng dở dang (45/100, note: "Đang đóng dở")
  function updatePackStatus(id, packedQty, isLabeled, note) {
    const cur = db.prepare(`SELECT id, qty FROM pallet_lines WHERE id = ?`).get(id);
    const pQty = Math.max(0, Number(packedQty) || 0);
    const labeled = isLabeled ? 1 : 0;
    const isDone = (pQty >= Number(cur.qty) && labeled === 1) ? 1 : 0;
    const cleanNote = note ? String(note).trim() : null;
    db.prepare(`UPDATE pallet_lines SET packed_qty = ?, is_labeled = ?, note = ?, done = ? WHERE id = ?`)
      .run(pQty, labeled, cleanNote, isDone, id);
    return { isDone, pQty, labeled };
  }

  // 1. Đóng dở: 45 pcs, chưa dán nhãn
  updatePackStatus(plId, 45, false, 'Đang chờ bao bì bổ sung');
  const row1 = db.prepare(`SELECT * FROM pallet_lines WHERE id = ?`).get(plId);
  eq('Sau khi cập nhật dở dang: packed_qty', Number(row1.packed_qty), 45);
  eq('Sau khi cập nhật dở dang: is_labeled', Number(row1.is_labeled), 0);
  eq('Sau khi cập nhật dở dang: note', row1.note, 'Đang chờ bao bì bổ sung');
  eq('Sau khi cập nhật dở dang: done (chưa đủ nên done=0)', Number(row1.done), 0);

  // 2. Đóng đủ: 100 pcs, nhưng CHƯA dán nhãn
  updatePackStatus(plId, 100, false, 'Đã đóng xong, chờ dán tem');
  const row2 = db.prepare(`SELECT * FROM pallet_lines WHERE id = ?`).get(plId);
  eq('Sau khi đóng đủ nhưng chưa dán nhãn: packed_qty', Number(row2.packed_qty), 100);
  eq('Sau khi đóng đủ nhưng chưa dán nhãn: is_labeled', Number(row2.is_labeled), 0);
  eq('Sau khi đóng đủ nhưng chưa dán nhãn: done (chưa dán nhãn nên done=0)', Number(row2.done), 0);

  // 3. Bật nhanh dán nhãn (togglePalletLineLabel)
  function toggleLabel(id) {
    const cur = db.prepare(`SELECT id, qty, packed_qty, is_labeled FROM pallet_lines WHERE id = ?`).get(id);
    const newLabeled = cur.is_labeled ? 0 : 1;
    const isDone = (Number(cur.packed_qty) >= Number(cur.qty) && newLabeled === 1) ? 1 : 0;
    db.prepare(`UPDATE pallet_lines SET is_labeled = ?, done = ? WHERE id = ?`).run(newLabeled, isDone, id);
    return { newLabeled, isDone };
  }

  const toggleRes = toggleLabel(plId);
  eq('Toggle dán nhãn: newLabeled', toggleRes.newLabeled, 1);
  eq('Toggle dán nhãn: isDone (đủ 100 và đã dán nhãn => done=1)', toggleRes.isDone, 1);

  const row3 = db.prepare(`SELECT * FROM pallet_lines WHERE id = ?`).get(plId);
  eq('DB sau toggle: is_labeled', Number(row3.is_labeled), 1);
  eq('DB sau toggle: done', Number(row3.done), 1);

  // 4. Toggle dán nhãn lại (tắt dán nhãn) => done phải tự động về 0!
  const toggleOffRes = toggleLabel(plId);
  eq('Toggle tắt dán nhãn: newLabeled', toggleOffRes.newLabeled, 0);
  eq('Toggle tắt dán nhãn: isDone (mất nhãn => done=0)', toggleOffRes.isDone, 0);

  const row4 = db.prepare(`SELECT * FROM pallet_lines WHERE id = ?`).get(plId);
  eq('DB sau tắt nhãn: done', Number(row4.done), 0);

  // 5. Thử nghiệm 1-chạm hoàn tất toàn bộ (setPalletLineDone)
  function setDone(id, done_) {
    const cur = db.prepare(`SELECT id, qty FROM pallet_lines WHERE id = ?`).get(id);
    if (done_) {
      db.prepare(`UPDATE pallet_lines SET done = 1, packed_qty = ?, is_labeled = 1 WHERE id = ?`)
        .run(Number(cur.qty), id);
    } else {
      db.prepare(`UPDATE pallet_lines SET done = 0, packed_qty = 0, is_labeled = 0 WHERE id = ?`)
        .run(id);
    }
  }

  setDone(plId, true);
  const row5 = db.prepare(`SELECT * FROM pallet_lines WHERE id = ?`).get(plId);
  eq('1-chạm xong: done', Number(row5.done), 1);
  eq('1-chạm xong: packed_qty', Number(row5.packed_qty), 100);
  eq('1-chạm xong: is_labeled', Number(row5.is_labeled), 1);

  // 1-chạm huỷ
  setDone(plId, false);
  const row6 = db.prepare(`SELECT * FROM pallet_lines WHERE id = ?`).get(plId);
  eq('1-chạm huỷ: done', Number(row6.done), 0);
  eq('1-chạm huỷ: packed_qty', Number(row6.packed_qty), 0);
  eq('1-chạm huỷ: is_labeled', Number(row6.is_labeled), 0);

  // 6. Kiểm tra Fast-Track từ trạng thái đóng dở dang (40 pcs) -> 1-chạm vào checkbox -> hoàn thành 100%
  updatePackStatus(plId, 40, false, 'Đang thiếu 60 pcs');
  const rowBeforeFastTrack = db.prepare(`SELECT * FROM pallet_lines WHERE id = ?`).get(plId);
  eq('Trước fast-track: packed_qty', Number(rowBeforeFastTrack.packed_qty), 40);
  eq('Trước fast-track: done', Number(rowBeforeFastTrack.done), 0);

  // Người dùng chạm vào checkbox để báo đã bổ sung đủ hàng:
  setDone(plId, true);
  const rowAfterFastTrack = db.prepare(`SELECT * FROM pallet_lines WHERE id = ?`).get(plId);
  eq('Sau 1-chạm fast-track từ đóng dở: packed_qty tự động nâng lên 100', Number(rowAfterFastTrack.packed_qty), 100);
  eq('Sau 1-chạm fast-track từ đóng dở: is_labeled tự động đặt 1', Number(rowAfterFastTrack.is_labeled), 1);
  eq('Sau 1-chạm fast-track từ đóng dở: done = 1 (gạch ngang tức thì)', Number(rowAfterFastTrack.done), 1);

  // 7. Kiểm tra Master Pallet Toggle cho kiện nhiều mã hàng (2-7 mã hàng)
  // Tạo thêm kiện 2 có 3 mã hàng
  db.exec(`INSERT INTO order_lines (po_id, item_code, target) VALUES (${poId}, 'NTK_B', 50)`);
  const lineBId = Number(db.prepare(`SELECT last_insert_rowid() as id`).get().id);
  db.exec(`INSERT INTO order_lines (po_id, item_code, target) VALUES (${poId}, 'NTK_C', 30)`);
  const lineCId = Number(db.prepare(`SELECT last_insert_rowid() as id`).get().id);

  db.exec(`INSERT INTO pallets (container_id, po_id, pallet_no) VALUES (${contId}, ${poId}, 2)`);
  const pal2Id = Number(db.prepare(`SELECT last_insert_rowid() as id`).get().id);

  db.exec(`INSERT INTO pallet_lines (pallet_id, order_line_id, qty, packed_qty, is_labeled, done) VALUES (${pal2Id}, ${lineId}, 40, 0, 0, 0)`);
  db.exec(`INSERT INTO pallet_lines (pallet_id, order_line_id, qty, packed_qty, is_labeled, done) VALUES (${pal2Id}, ${lineBId}, 50, 0, 0, 0)`);
  db.exec(`INSERT INTO pallet_lines (pallet_id, order_line_id, qty, packed_qty, is_labeled, done) VALUES (${pal2Id}, ${lineCId}, 30, 0, 0, 0)`);

  function setPalletMaster(pId, done_) {
    if (done_) {
      db.prepare(`UPDATE pallet_lines SET done = 1, packed_qty = qty, is_labeled = 1 WHERE pallet_id = ?`).run(pId);
    } else {
      db.prepare(`UPDATE pallet_lines SET done = 0, packed_qty = 0, is_labeled = 0 WHERE pallet_id = ?`).run(pId);
    }
  }

  // 1-chạm hoàn tất toàn bộ kiện 2 (3 mã hàng)
  setPalletMaster(pal2Id, true);
  const p2LinesDone = db.prepare(`SELECT done, packed_qty, is_labeled, qty FROM pallet_lines WHERE pallet_id = ?`).all(pal2Id);
  eq('Kiện mix 2 có 3 dòng hàng', p2LinesDone.length, 3);
  eq('Cả 3 dòng hàng đều done = 1', p2LinesDone.every(l => Number(l.done) === 1), true);
  eq('Cả 3 dòng hàng đều is_labeled = 1', p2LinesDone.every(l => Number(l.is_labeled) === 1), true);
  eq('Cả 3 dòng hàng đều packed_qty = qty', p2LinesDone.every(l => Number(l.packed_qty) === Number(l.qty)), true);

  // 1-chạm huỷ hoàn tất toàn bộ kiện 2
  setPalletMaster(pal2Id, false);
  const p2LinesUndone = db.prepare(`SELECT done, packed_qty, is_labeled FROM pallet_lines WHERE pallet_id = ?`).all(pal2Id);
  eq('Cả 3 dòng hàng đều done = 0 sau khi huỷ', p2LinesUndone.every(l => Number(l.done) === 0), true);
  eq('Cả 3 dòng hàng đều packed_qty = 0 sau khi huỷ', p2LinesUndone.every(l => Number(l.packed_qty) === 0), true);
  eq('Cả 3 dòng hàng đều is_labeled = 0 sau khi huỷ', p2LinesUndone.every(l => Number(l.is_labeled) === 0), true);
}

console.log(`\nTổng kết: ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.error('\nChi tiết lỗi:');
  failures.forEach(f => console.error(f));
  process.exit(1);
} else {
  console.log('Tất cả kiểm tra thành công 100%!');
  process.exit(0);
}
