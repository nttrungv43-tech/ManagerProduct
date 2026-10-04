// src/db/queries.js
// FEAT-21 — Lớp truy vấn trên **thiết kế DB mới** (xem specs/PLAN-db-redesign.md).
//
// ============================================================================
// ĐỔI HỆT KHỐI SO VỚI BẢN CŨ
// ============================================================================
// Bản cũ đọc/ghi `items(po = '2922+2923')` + `entries(ntk)` + `item_po` + `pallet_status` +
// `container_data` (blob JSON). Bản này đọc/ghi 9 bảng quan hệ với nguyên tử là
// `order_lines` = (PO × mã hàng). Ba điều đổi hệt:
//
//  1. **Không còn `fetchItemPoRows`/`splitItemRows`.** Bản cũ phải tự tách thẻ vì `items` lưu
//     nhiều PO trong một chuỗi (FEAT-19). Ở đây mỗi `order_lines` **đã là** một (PO × mã) ⇒ không
//     có gì để tách.
//  2. **Không còn trạng thái "chưa gắn PO".** Bản cũ cần `entries.po` nullable và cảnh báo
//     "chưa gắn PO" (FEAT-20). Ở đây `production_entries.order_line_id` **NOT NULL** ⇒ mọi nhật
//     ký luôn thuộc đúng một PO, và `ENTRY_PO_INVALID` không còn tồn tại vì PO là FK.
//  3. **Không còn `fetchPalletStatus`/`remapPalletStatus`.** Trạng thái tick là cột
//     `pallet_lines.done` ⇒ thêm/xoá dòng hàng trong kiện không làm mất tick (hết INV-P1/BUG-01).
//
// Hợp đồng với UI **giữ nguyên** để pha UI gọn: hàm trả `{ ok: false, error: { code, … } }` thay vì
// ném lỗi, và mã lỗi giữ đúng tập cũ (trừ `ENTRY_PO_INVALID` vốn không còn khả năng xảy ra).

import { getDb, getActiveBatchId } from './index';
import { checkQtyLimit, parseQty } from '@/utils/validateQty';
import { todayLocal } from '@/utils/date';
import { buildImportPlanV2 } from '@/utils/packingV2Import';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Chuẩn hoá kết quả `{ok,error}` — hàm nào trả lỗi đều đi qua đây. */
const fail = (code, extra = {}) => ({ ok: false, error: { code, ...extra } });
const done = (extra = {}) => ({ ok: true, ...extra });

/** `NULL` → 0; tránh `null` lọt vào phép tính JS và thành NaN trên màn hình. */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Ngày hợp lệ theo giờ cục bộ (INV-D2) — DB cũng có CHECK nhưng phải báo lỗi rõ, không ném SQL. */
function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''))) return false;
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// ĐỌC — mã hàng
// ════════════════════════════════════════════════════════════════════════════

/**
 * Danh sách thẻ mã hàng của một đơn.
 *
 * **Mỗi dòng = một thẻ = một (PO × mã hàng).** Không tách gì thêm: `v_line_progress` đã có sẵn
 * `produced`/`defect`/`remaining` tính đúng theo từng PO, nên cột "Đã làm / Còn lại" của thẻ là
 * **số thật** chứ không phải tổng chung của mã.
 *
 * Trả về đúng shape mà `ItemCard`/`SummaryCards` dùng (`ntk` = mã hàng, `po` = PO của thẻ).
 */
export async function fetchItemsWithStats(batchId) {
  const db = await getDb();
  const id = batchId ?? (await getActiveBatchId(db));
  if (!id) return [];
  const rows = await db.getAllAsync(
    `SELECT * FROM v_line_progress WHERE order_batch_id = ? ORDER BY po, item_code`,
    [id]
  );
  return rows.map(r => ({
    order_line_id: r.order_line_id,
    order_batch_id: r.order_batch_id,
    ntk: r.item_code,
    po: r.po,
    target: num(r.target),
    produced: num(r.produced),
    defect: num(r.defect),
    remaining: num(r.remaining),
    nw_kg: r.nw_kg,
    gw_kg: r.gw_kg,
    volume_cbm: r.volume_cbm,
    package_count: r.package_count,
  }));
}

/**
 * Bảng "Tổng theo PO" — **một câu SQL**, không dựng `Map` trong JS.
 *
 * Bản cũ phải cộng `item_po.qty` rồi mới đoán phần sản lượng thuộc PO nào (và không đoán được ⇒
 * cột "Đã sản xuất" trắng 12/12 dòng). Ở đây mỗi dòng là một PO thật, `produced` cộng đúng các
 * nhật ký đã gắn PO đó nên **không bao giờ vượt** tổng (INV-D8).
 */
export async function fetchPoSummaries(batchId) {
  const db = await getDb();
  const id = batchId ?? (await getActiveBatchId(db));
  if (!id) return [];
  const rows = await db.getAllAsync(
    `SELECT * FROM v_po_progress WHERE order_batch_id = ? ORDER BY po`,
    [id]
  );
  return rows.map(r => ({
    key: r.po,
    label: r.po,
    target: num(r.target),
    produced: num(r.produced),
    remaining: num(r.remaining),
    defect: num(r.defect),
    itemCount: num(r.item_count),
    // Mọi PO đều quy được sản lượng về đúng PO ⇒ không còn dòng nào "chưa biết" (FEAT-20).
    hasShared: false,
  }));
}

/** Nhật ký sản xuất của MỘT thẻ (một dòng đơn hàng). */
export async function fetchEntriesForLine(orderLineId) {
  const db = await getDb();
  if (!orderLineId) return [];
  return db.getAllAsync(
    `SELECT pe.id, pe.date, pe.qty, pe.line, pe.defect_qty, pe.order_line_id,
            GROUP_CONCAT(pd.type) AS defect_types
     FROM production_entries pe
     LEFT JOIN production_defects pd ON pd.entry_id = pe.id
     WHERE pe.order_line_id = ?
     GROUP BY pe.id
     ORDER BY pe.date DESC, pe.id DESC`,
    [orderLineId]
  );
}

/** Số hiệu nhà máy ('DMAC No.') của một mã — dữ liệu bản cũ vứt bỏ. */
export async function fetchItemRefs(batchId, itemCode) {
  const db = await getDb();
  if (!itemCode) return [];
  const id = batchId ?? (await getActiveBatchId(db));
  return db.getAllAsync(
    `SELECT ref_no FROM item_refs WHERE order_batch_id = ? AND item_code = ? ORDER BY ref_no`,
    [id, itemCode]
  ).then(rs => rs.map(r => r.ref_no));
}

// ════════════════════════════════════════════════════════════════════════════
// GHI — nhật ký sản xuất
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hạn mức của một dòng đơn hàng: `SUM(qty)` **≤** `target` (INV-V1).
 *
 * Khác bản cũ: hạn mức kiểm theo **mã** (`items.target` là tổng mọi PO). Ở đây kiểm theo
 * **dòng đơn hàng** ⇒ nhập 300 pcs cho PO 2922 không làm hụt hạn mức của PO 2923, và tổng vẫn
 * không vượt. Đây là điều mà bản cũ **không làm được** vì không biết phần của mỗi PO.
 *
 * @param {number|null} excludeEntryId khi sửa, bỏ dòng đang sửa ra khỏi tổng (AC-ITEM-18)
 */
async function checkLineTarget(db, orderLineId, qty, excludeEntryId = null) {
  const line = await db.getFirstAsync(
    `SELECT target FROM order_lines WHERE id = ?`, [orderLineId]
  );
  if (!line) return { ok: false, code: 'ITEM_NOT_FOUND' };
  const row = await db.getFirstAsync(
    `SELECT COALESCE(SUM(qty), 0) AS produced FROM production_entries
     WHERE order_line_id = ? AND (? IS NULL OR id != ?)`,
    [orderLineId, excludeEntryId, excludeEntryId]
  );
  const target = num(line.target);
  const produced = num(row?.produced);
  // target = 0 ⇒ không áp hạn mức (giữ đúng hành vi bản cũ, SPEC-data.md §5.4).
  if (target > 0) {
    const limit = await checkQtyLimit(produced, qty, target, line.item_code ?? '');
    if (!limit.ok) return limit;
  }
  return { ok: true, target, produced };
}

/** Thêm một mục nhật ký sản xuất vào một thẻ (dòng đơn hàng). */
export async function addEntry(orderLineId, { date, qty, line, defectQty, defectTypes }) {
  const db = await getDb();
  const q = parseQty(qty);
  if (q === null || q <= 0) return fail('INVALID_QTY', { ntk: '' });
  const d = String(date ?? '').trim();
  if (!isValidDate(d)) return fail('INVALID_DATE', { date });

  const lineKind = line === 'auto' ? 'auto' : 'manual';
  const defect = Math.max(parseQty(defectQty) ?? 0, 0);

  const ok = await checkLineTarget(db, orderLineId, q);
  if (!ok.ok) return fail(ok.code, ok);

  return db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO production_entries (order_line_id, date, qty, line, defect_qty)
       VALUES (?, ?, ?, ?, ?)`,
      [orderLineId, d, q, lineKind, defect]
    );
    await writeDefects(db, res.lastInsertRowId, defect, defectTypes);
    return done({ id: res.lastInsertRowId });
  });
}

/** Sửa một mục nhật ký. */
export async function updateEntry(entryId, { date, qty, line, defectQty, defectTypes }) {
  const db = await getDb();
  const cur = await db.getFirstAsync(
    `SELECT order_line_id FROM production_entries WHERE id = ?`, [entryId]
  );
  if (!cur) return fail('ENTRY_NOT_FOUND');

  const q = parseQty(qty);
  if (q === null || q <= 0) return fail('INVALID_QTY');
  const d = String(date ?? '').trim();
  if (!isValidDate(d)) return fail('INVALID_DATE', { date });

  const ok = await checkLineTarget(db, cur.order_line_id, q, entryId);
  if (!ok.ok) return fail(ok.code, ok);

  const lineKind = line === 'auto' ? 'auto' : 'manual';
  const defect = Math.max(parseQty(defectQty) ?? 0, 0);

  return db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE production_entries SET date = ?, qty = ?, line = ?, defect_qty = ? WHERE id = ?`,
      [d, q, lineKind, defect, entryId]
    );
    await db.runAsync(`DELETE FROM production_defects WHERE entry_id = ?`, [entryId]);
    await writeDefects(db, entryId, defect, defectTypes);
    return done({ id: entryId });
  });
}

/** Xoá một mục nhật ký. */
export async function removeEntry(entryId) {
  const db = await getDb();
  const cur = await db.getFirstAsync(
    `SELECT order_line_id FROM production_entries WHERE id = ?`, [entryId]
  );
  if (!cur) return fail('ENTRY_NOT_FOUND');
  return db.withTransactionAsync(async () => {
    // `production_defects` có ON DELETE CASCADE nên không cần xoá tay.
    await db.runAsync(`DELETE FROM production_entries WHERE id = ?`, [entryId]);
    return done();
  });
}

/** Ghi loại hàng lỗi. Loại sai bị CHECK của DB chặn — ở đây lọc trước để không ném lỗi SQL. */
async function writeDefects(db, entryId, defectQty, defectTypes) {
  if (!(defectQty > 0)) return;
  const types = (Array.isArray(defectTypes) ? defectTypes : [])
    .filter(t => ['yellow', 'red', 'tear'].includes(t));
  for (const t of new Set(types)) {
    await db.runAsync(
      `INSERT OR IGNORE INTO production_defects (entry_id, type) VALUES (?, ?)`, [entryId, t]
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GHI — mã hàng (thêm/sửa/xoá)
// ════════════════════════════════════════════════════════════════════════════

/** Thêm một mã hàng vào một PO. Trùng (PO × mã) ⇒ `ITEM_EXISTS`. */
export async function addItem(batchId, { po, itemCode, target }) {
  const db = await getDb();
  const id = batchId ?? (await getActiveBatchId(db));
  const code = String(itemCode ?? '').trim();
  if (!code) return fail('INVALID_NTK');
  const poRow = await db.getFirstAsync(
    `SELECT id FROM pos WHERE order_batch_id = ? AND code = ?`, [id, String(po ?? '').trim()]
  );
  if (!poRow) return fail('ITEM_NOT_IN_ORDER', { po });
  const dup = await db.getFirstAsync(
    `SELECT id FROM order_lines WHERE po_id = ? AND item_code = ?`, [poRow.id, code]
  );
  if (dup) return fail('ITEM_EXISTS', { ntk: code });

  const t = parseQty(target);
  if (t === null || t < 0) return fail('INVALID_TARGET');
  const res = await db.runAsync(
    `INSERT INTO order_lines (po_id, item_code, target) VALUES (?, ?, ?)`, [poRow.id, code, t]
  );
  return done({ order_line_id: res.lastInsertRowId, ntk: code });
}

/** Sửa hạn mức của một dòng. Không cho xuống dưới lượng đã sản xuất. */
export async function updateItem(batchId, orderLineId, { target }) {
  const db = await getDb();
  const line = await db.getFirstAsync(
    `SELECT target, item_code FROM order_lines WHERE id = ?`, [orderLineId]
  );
  if (!line) return fail('ITEM_NOT_FOUND');
  const t = parseQty(target);
  if (t === null || t < 0) return fail('INVALID_TARGET');

  const row = await db.getFirstAsync(
    `SELECT COALESCE(SUM(qty),0) AS produced FROM production_entries WHERE order_line_id = ?`,
    [orderLineId]
  );
  if (num(line.target) > 0 && t < num(row?.produced)) {
    return fail('TARGET_BELOW_PRODUCED', { produced: num(row?.produced) });
  }
  await db.runAsync(`UPDATE order_lines SET target = ? WHERE id = ?`, [t, orderLineId]);
  return done({ ntk: line.item_code, target: t });
}

/**
 * Xoá một dòng đơn hàng.
 *
 * `pallet_lines` khai báo `ON DELETE RESTRICT` nên **DB tự chặn** khi mã còn nằm trong kiện —
 * không cần (và không nên) check tay ở JS, vì bản cũ có INV-V2 là quy tắc miệng dễ sót.
 */
export async function removeItem(batchId, orderLineId) {
  const db = await getDb();
  const line = await db.getFirstAsync(
    `SELECT item_code FROM order_lines WHERE id = ?`, [orderLineId]
  );
  if (!line) return fail('ITEM_NOT_FOUND');

  const inPallet = await db.getFirstAsync(
    `SELECT 1 AS x FROM pallet_lines WHERE order_line_id = ? LIMIT 1`, [orderLineId]
  );
  if (inPallet) return fail('ITEM_IN_PALLETS', { ntk: line.item_code });
  const hasEntries = await db.getFirstAsync(
    `SELECT 1 AS x FROM production_entries WHERE order_line_id = ? LIMIT 1`, [orderLineId]
  );
  if (hasEntries) return fail('ITEM_HAS_ENTRIES', { ntk: line.item_code });

  await db.runAsync(`DELETE FROM order_lines WHERE id = ?`, [orderLineId]);
  return done({ ntk: line.item_code });
}

/** Xem trước: xoá theo PO sẽ xoá những dòng nào. */
export async function previewItemsByPo(batchId, po) {
  const db = await getDb();
  const id = batchId ?? (await getActiveBatchId(db));
  return db.getAllAsync(
    `SELECT l.id AS order_line_id, l.item_code AS ntk, l.target
     FROM order_lines l JOIN pos p ON p.id = l.po_id
     WHERE p.order_batch_id = ? AND p.code = ?
     ORDER BY l.item_code`,
    [id, String(po ?? '').trim()]
  );
}

/**
 * Xoá toàn bộ mã hàng của một PO, **all-or-nothing** (INV-V4).
 *
 * Khác bản cũ: bản cũ phải loại trừ mã đa PO (`po` có `+`) ra khỏi phép xoá theo một PO. Ở đây
 * mỗi dòng thuộc **đúng một** PO nên "mã đa PO" không tồn tại — điều kiện (c) của INV-V4 trở nên
 * tự nhiên thay vì một nhánh code đặc biệt.
 */
export async function removeItemsByPo(batchId, po) {
  const db = await getDb();
  const id = batchId ?? (await getActiveBatchId(db));
  const code = String(po ?? '').trim();
  const rows = await previewItemsByPo(id, code);
  if (rows.length === 0) return fail('ITEM_NOT_FOUND', { po: code });

  // all-or-nothing: có một dòng đã có nhật ký hoặc còn trong kiện ⇒ không xoá dòng nào.
  const blockers = await db.getAllAsync(
    `SELECT l.item_code AS ntk,
            (SELECT COUNT(*) FROM production_entries e WHERE e.order_line_id = l.id) AS entries,
            (SELECT COUNT(*) FROM pallet_lines pl WHERE pl.order_line_id = l.id) AS in_pallets
     FROM order_lines l JOIN pos p ON p.id = l.po_id
     WHERE p.order_batch_id = ? AND p.code = ?`,
    [id, code]
  );
  const bad = blockers.filter(b => num(b.entries) > 0 || num(b.in_pallets) > 0);
  if (bad.length > 0) {
    return fail('ITEM_HAS_ENTRIES', { po: code, blocked: bad.map(b => b.ntk) });
  }

  return db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM order_lines WHERE po_id IN (SELECT id FROM pos WHERE order_batch_id = ? AND code = ?)`,
      [id, code]
    );
    return done({ deleted: rows.length });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ĐỌC/GHI — container & kiện (thay blob JSON)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cấu trúc container → kiện → dòng hàng, kèm trạng thái tick.
 *
 * Bản cũ đọc `container_data.data`, `JSON.parse` rồi dựng lại cả cây ở JS, và **mỗi** thay đổi
 * kiện phải ghi lại toàn bộ blob. Ở đây là 2 câu `SELECT` trên bảng thật.
 */
export async function fetchContainersView(batchId) {
  const db = await getDb();
  const id = batchId ?? (await getActiveBatchId(db));
  if (!id) return [];
  const ct = await db.getAllAsync(
    `SELECT c.id, c.container_no, c.seal_no, p.code AS po
     FROM containers c JOIN pos p ON p.id = c.po_id
     WHERE c.order_batch_id = ? ORDER BY c.container_no`,
    [id]
  );
  if (ct.length === 0) return [];
  const pal = await db.getAllAsync(
    `SELECT pa.id, pa.container_id, pa.pallet_no, pa.c_no, pa.is_mixed,
            pa.volume_cbm, pa.nw_kg, pa.gw_kg
     FROM pallets pa JOIN containers c ON c.id = pa.container_id
     WHERE c.order_batch_id = ? ORDER BY pa.container_id, pa.pallet_no`,
    [id]
  );
  const lines = await db.getAllAsync(
    `SELECT pl.id, pl.pallet_id, pl.order_line_id, pl.qty, pl.done, ol.item_code, pos.code AS po
     FROM pallet_lines pl
     JOIN order_lines ol ON ol.id = pl.order_line_id
     JOIN pos ON pos.id = ol.po_id
     WHERE pos.order_batch_id = ?`,
    [id]
  );
  const byContainer = new Map(ct.map(c => [c.id, { ...c, pallets: [] }]));
  const palletById = new Map();
  for (const p of pal) {
    const obj = { ...p, items: [] };
    palletById.set(p.id, obj);
    byContainer.get(p.container_id)?.pallets.push(obj);
  }
  for (const l of lines) {
    palletById.get(l.pallet_id)?.items.push({
      id: l.id, order_line_id: l.order_line_id, ntk: l.item_code,
      qty: num(l.qty), done: !!l.done, po: l.po,
    });
  }
  return [...byContainer.values()];
}

/** Bật/tắt trạng thái đóng kiện của một dòng hàng. */
export async function setPalletLineDone(palletLineId, done_) {
  const db = await getDb();
  const cur = await db.getFirstAsync(`SELECT id FROM pallet_lines WHERE id = ?`, [palletLineId]);
  if (!cur) return fail('PALLET_NOT_FOUND');
  await db.runAsync(`UPDATE pallet_lines SET done = ? WHERE id = ?`, [done_ ? 1 : 0, palletLineId]);
  return done();
}

/** Thêm một kiện vào container. */
export async function addPallet(batchId, containerId, { no, items }) {
  const db = await getDb();
  const palletNo = parseQty(no);
  if (palletNo === null || palletNo <= 0) return fail('INVALID_PALLET_NO');

  const ct = await db.getFirstAsync(`SELECT id FROM containers WHERE id = ?`, [containerId]);
  if (!ct) return fail('CONTAINER_NOT_FOUND');
  const dup = await db.getFirstAsync(
    `SELECT 1 AS x FROM pallets WHERE container_id = ? AND pallet_no = ?`, [containerId, palletNo]
  );
  if (dup) return fail('PALLET_EXISTS', { no: palletNo });

  const norm = normalizePalletItems(items);
  if (norm.length === 0) return fail('PALLET_EMPTY');

  return db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO pallets (container_id, po_id, pallet_no, is_mixed) VALUES (?, ?, ?, ?)`,
      [containerId, ct.po_id, palletNo, norm.length > 1 ? 1 : 0]
    );
    for (const it of norm) {
      await db.runAsync(
        `INSERT INTO pallet_lines (pallet_id, order_line_id, qty) VALUES (?, ?, ?)`,
        [res.lastInsertRowId, it.order_line_id, it.qty]
      );
    }
    return done({ no: palletNo });
  });
}

/** Sửa kiện: `pallet_no` bất biến (giữ đúng hành vi bản cũ) — chỉ kéo dòng hàng. */
export async function updatePallet(batchId, containerId, palletNo, { items }) {
  const db = await getDb();
  const pal = await db.getFirstAsync(
    `SELECT id FROM pallets WHERE container_id = ? AND pallet_no = ?`, [containerId, palletNo]
  );
  if (!pal) return fail('PALLET_NOT_FOUND');
  const norm = normalizePalletItems(items);
  if (norm.length === 0) return fail('PALLET_EMPTY');

  return db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM pallet_lines WHERE pallet_id = ?`, [pal.id]);
    for (const it of norm) {
      await db.runAsync(
        `INSERT INTO pallet_lines (pallet_id, order_line_id, qty) VALUES (?, ?, ?)`,
        [pal.id, it.order_line_id, it.qty]
      );
    }
    await db.runAsync(
      `UPDATE pallets SET is_mixed = ? WHERE id = ?`, [norm.length > 1 ? 1 : 0, pal.id]
    );
    return done({ no: palletNo });
  });
}

/** Xoá kiện (kèm dòng hàng — `ON DELETE CASCADE`). */
export async function removePallet(batchId, containerId, palletNo) {
  const db = await getDb();
  const pal = await db.getFirstAsync(
    `SELECT id FROM pallets WHERE container_id = ? AND pallet_no = ?`, [containerId, palletNo]
  );
  if (!pal) return fail('PALLET_NOT_FOUND');
  await db.runAsync(`DELETE FROM pallets WHERE id = ?`, [pal.id]);
  return done({ no: palletNo });
}

function normalizePalletItems(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (const it of list) {
    const q = parseQty(it?.qty);
    if (q === null || q <= 0) return [];
    const lineId = parseQty(it?.order_line_id);
    if (lineId === null || lineId <= 0) return [];
    out.push({ order_line_id: lineId, qty: q });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// LỊCH SỬ & LƯU TRỮ
// ════════════════════════════════════════════════════════════════════════════

/** Các năm có dữ liệu, mới nhất trước. */
export async function fetchAvailableYears() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT DISTINCT substr(e.date, 1, 4) AS year
     FROM production_entries e ORDER BY year DESC`
  );
  return rows.map(r => r.year).filter(Boolean);
}

/** Biểu thức nhóm ngày — `year` | `month` | `day`, dùng chung cho cả 2 hàm lịch sử. */
const HISTORY_GROUP_EXPR = {
  year: (a) => `substr(${a}.date,1,4)`,
  month: (a) => `substr(${a}.date,1,7)`,
  day: (a) => `${a}.date`,
};

/**
 * Nhật ký gom theo `year` | `month` | `day`, kèm tách `manual`/`auto` và tổng lỗi.
 *
 * Giữ **tên field cũ** (`groupKey`/`total`/`manualTotal`/`autoTotal`/`defectTotal`) vì
 * `HistoryScreen` đọc thẳng. Bản cũ cần `JOIN entries` 3 lần để cộng tay; ở đây một câu
 * `GROUP BY` có `SUM(CASE WHEN …)` — cùng kết quả, ít chỗ hơn.
 */
export async function fetchHistoryGrouped(groupBy, filterValue) {
  const db = await getDb();
  const expr = HISTORY_GROUP_EXPR[groupBy]?.('e');
  if (!expr) return [];
  const where = filterValue ? `WHERE ${expr} = ?` : '';
  const rows = await db.getAllAsync(
    `SELECT ${expr} AS group_key,
            COALESCE(SUM(e.qty),0) AS total,
            COALESCE(SUM(CASE WHEN e.line = 'manual' THEN e.qty ELSE 0 END),0) AS manual_total,
            COALESCE(SUM(CASE WHEN e.line = 'auto'   THEN e.qty ELSE 0 END),0) AS auto_total,
            COALESCE(SUM(e.defect_qty),0) AS defect_total
     FROM production_entries e
     ${where}
     GROUP BY ${expr} ORDER BY group_key DESC`,
    filterValue ? [filterValue] : []
  );
  return rows.map(r => ({
    groupKey: r.group_key,
    total: num(r.total),
    manualTotal: num(r.manual_total),
    autoTotal: num(r.auto_total),
    defectTotal: num(r.defect_total),
  }));
}

/** Chi tiết một nhóm lịch sử — `ntk` đã kèm PO vì một mã có thể thuộc nhiều PO. */
export async function fetchHistoryDetail(groupBy, groupKey) {
  const db = await getDb();
  const expr = HISTORY_GROUP_EXPR[groupBy]?.('pe');
  if (!expr) return [];
  return db.getAllAsync(
    `SELECT pe.id, pe.date, pe.qty, pe.line, pe.defect_qty,
            ol.item_code AS ntk, p.code AS po
     FROM production_entries pe
     JOIN order_lines ol ON ol.id = pe.order_line_id
     JOIN pos p ON p.id = ol.po_id
     WHERE ${expr} = ?
     ORDER BY pe.date DESC, pe.id DESC`,
    [groupKey]
  );
}

/**
 * Danh sách đơn đã lưu trữ.
 *
 * Giữ **tên field cũ** (snake_case) vì `ArchiveCard` đọc thẳng các tên này — đổi tên ở đây sẽ
 * làm vỡ thẻ lịch sử mà không có lý do. Bản cũ lấy các số này từ cột đếm phi chuẩn hoá trên
 * `order_batches` (có thể trôi); ở đây tính thẳng từ bảng dữ liệu nên **không thể** lệch.
 */
export async function fetchArchives() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT b.id, b.finished_date, b.source_file, b.mark,
            (SELECT COUNT(*) FROM pos WHERE order_batch_id = b.id) AS po_count,
            (SELECT COUNT(DISTINCT l.item_code) FROM order_lines l
               JOIN pos p ON p.id = l.po_id WHERE p.order_batch_id = b.id) AS item_count,
            (SELECT COALESCE(SUM(l.target),0) FROM order_lines l
               JOIN pos p ON p.id = l.po_id WHERE p.order_batch_id = b.id) AS total_target,
            (SELECT COALESCE(SUM(e.qty),0) FROM production_entries e
               JOIN order_lines l ON l.id = e.order_line_id
               JOIN pos p ON p.id = l.po_id WHERE p.order_batch_id = b.id) AS total_produced,
            (SELECT COALESCE(SUM(e.defect_qty),0) FROM production_entries e
               JOIN order_lines l ON l.id = e.order_line_id
               JOIN pos p ON p.id = l.po_id WHERE p.order_batch_id = b.id) AS total_defect,
            (SELECT COUNT(*) FROM pallets pa JOIN containers c ON c.id = pa.container_id
               WHERE c.order_batch_id = b.id) AS pallets_total,
            (SELECT COUNT(DISTINCT pl.pallet_id) FROM pallet_lines pl
               JOIN pallets pa ON pa.id = pl.pallet_id
               JOIN containers c ON c.id = pa.container_id
               WHERE c.order_batch_id = b.id AND pl.done = 1) AS pallets_done
     FROM order_batches b WHERE b.status = 'archived' ORDER BY b.id DESC`
  );
  return rows.map(r => ({
    id: r.id,
    finished_date: r.finished_date,
    source_file: r.source_file,
    mark: r.mark,
    po_count: num(r.po_count),
    item_count: num(r.item_count),
    total_target: num(r.total_target),
    total_produced: num(r.total_produced),
    total_defect: num(r.total_defect),
    pallets_total: num(r.pallets_total),
    pallets_done: num(r.pallets_done),
  }));
}

/** Mã hàng của một đơn lưu trữ (không sửa được — INV-B2). */
export async function fetchArchiveItems(batchId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM v_line_progress WHERE order_batch_id = ? ORDER BY po, item_code`, [batchId]
  ).then(rs => rs.map(r => ({
    order_line_id: r.order_line_id, ntk: r.item_code, po: r.po,
    target: num(r.target), produced: num(r.produced), defect: num(r.defect),
    remaining: num(r.remaining),
  })));
}

/** Xem trước hậu quả xoá đơn lưu trữ (INV-B4: phải cảnh báo số liệu Lịch sử giảm). */
export async function previewArchiveDelete(batchId) {
  const db = await getDb();
  const b = await db.getFirstAsync(`SELECT * FROM order_batches WHERE id = ?`, [batchId]);
  if (!b) return { ok: false, error: { code: 'ARCHIVE_NOT_FOUND' } };
  if (b.status === 'active') return fail('BATCH_ACTIVE');
  const entries = await db.getFirstAsync(
    `SELECT COUNT(*) AS c FROM production_entries e
     JOIN order_lines l ON l.id = e.order_line_id
     JOIN pos p ON p.id = l.po_id WHERE p.order_batch_id = ?`, [batchId]
  );
  const pos = await db.getFirstAsync(
    `SELECT COUNT(*) AS c FROM pos WHERE order_batch_id = ?`, [batchId]
  );
  const pallets = await db.getFirstAsync(
    `SELECT COUNT(*) AS c FROM pallets pa
     JOIN containers c ON c.id = pa.container_id WHERE c.order_batch_id = ?`, [batchId]
  );
  return done({
    id: batchId,
    entryCount: num(entries?.c),
    poCount: num(pos?.c),
    palletCount: num(pallets?.c),
    finishedDate: b.finished_date,
  });
}

/**
 * Xoá hẳn đơn lưu trữ (INV-B2).
 *
 * Mọi bảng con đều `ON DELETE CASCADE` từ `order_batches` ⇒ xoá **một** câu, không cần liệt kê
 * `entries`/`items`/`pallet_status`/`container_data` như bản cũ (bản cũ buộc phải xoá tay từng
 * bảng và dễ sót). Chỉ nhắm `status='archived'`.
 */
export async function deleteArchive(batchId) {
  const db = await getDb();
  const b = await db.getFirstAsync(`SELECT status FROM order_batches WHERE id = ?`, [batchId]);
  if (!b) return fail('ARCHIVE_NOT_FOUND');
  if (b.status === 'active') return fail('BATCH_ACTIVE');
  await db.runAsync(`DELETE FROM order_batches WHERE id = ? AND status = 'archived'`, [batchId]);
  return done({ id: batchId });
}

// ════════════════════════════════════════════════════════════════════════════
// ĐƠN HÀNG
// ════════════════════════════════════════════════════════════════════════════

/**
 * Hoàn tất đơn: archive đơn cũ + tạo đơn mới **trắng** (FEAT-14), trong MỘT transaction
 * (INV-B3). `AND status='active'` chống gọi song song (INV-B1).
 */
export async function finishOrder() {
  const db = await getDb();
  const active = await db.getFirstAsync(
    `SELECT id FROM order_batches WHERE status = 'active' ORDER BY id DESC LIMIT 1`
  );
  if (!active) return fail('NO_ACTIVE_BATCH');
  return db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE order_batches SET status='archived', finished_date=? WHERE id = ? AND status='active'`,
      [todayLocal(), active.id]
    );
    const res = await db.runAsync(
      `INSERT INTO order_batches (status, imported_at) VALUES ('active', ?)`, [todayLocal()]
    );
    return done({ id: res.lastInsertRowId });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// NHẬP JSON
// ════════════════════════════════════════════════════════════════════════════

/**
 * Nhập `packing_data.json` (`schema_version: 1`) — nguồn dữ liệu chính.
 *
 * `buildImportPlanV2` là hàm thuần (không đụng SQLite) nên kế hoạch được kiểm bằng `node` thuần và
 * bằng chính `src/data/Dmac.json`. Ở đây chỉ ghi đúng thứ tự mà kế hoạch đã sắp.
 *
 * **all-or-nothing** (INV-I4): mọi việc nằm trong MỘT transaction ⇒ lỗi giữa chừng thì DB không
 * đổi, không để lại dữ liệu nửa vời.
 */
export async function importPackingV1(batchId, jsonData) {
  const db = await getDb();
  const batchIdToUse = batchId ?? (await getActiveBatchId(db));
  if (!batchIdToUse) return fail('NO_ACTIVE_BATCH');

  const plan = buildImportPlanV2(jsonData);
  if (plan.pos.length === 0) return fail('NO_SHIPMENTS');
  if (plan.lines.length === 0) return fail('ITEMS_EMPTY');

  return db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE order_batches SET source_file = ?, mark = ? WHERE id = ?`,
      [plan.order.sourceFile, plan.order.mark, batchIdToUse]
    );
    // Xoá dữ liệu nhập cũ của đơn này để nạp lại không nhân đôi.
    // `ON DELETE RESTRICT` ⇒ phải xoá kiện trước rồi tới dòng đơn hàng.
    await db.runAsync(
      `DELETE FROM pallets WHERE container_id IN (SELECT id FROM containers WHERE order_batch_id = ?)`,
      [batchIdToUse]
    );
    await db.runAsync(`DELETE FROM containers WHERE order_batch_id = ?`, [batchIdToUse]);
    await db.runAsync(
      `DELETE FROM order_lines WHERE po_id IN (SELECT id FROM pos WHERE order_batch_id = ?)`,
      [batchIdToUse]
    );
    await db.runAsync(`DELETE FROM item_refs WHERE order_batch_id = ?`, [batchIdToUse]);
    await db.runAsync(`DELETE FROM pos WHERE order_batch_id = ?`, [batchIdToUse]);

    const posIds = [];
    for (const po of plan.pos) {
      const r = await db.runAsync(
        `INSERT INTO pos (order_batch_id, code, consignee, address, destination, invoice_no)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [batchIdToUse, po.code, po.consignee, po.address, po.destination, po.invoice_no]
      );
      posIds.push(r.lastInsertRowId);
    }

    const lineIds = [];
    for (const l of plan.lines) {
      const r = await db.runAsync(
        `INSERT INTO order_lines (po_id, item_code, target, nw_kg, gw_kg, volume_cbm, package_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [posIds[l.poIdx], l.itemCode, l.target, l.nw_kg, l.gw_kg, l.volume_cbm, l.package_count]
      );
      lineIds.push(r.lastInsertRowId);
    }

    for (const r of plan.refs) {
      await db.runAsync(
        `INSERT OR IGNORE INTO item_refs (order_batch_id, item_code, ref_no) VALUES (?, ?, ?)`,
        [batchIdToUse, r.itemCode, r.refNo]
      );
    }

    const containerIds = [];
    for (const c of plan.containers) {
      const r = await db.runAsync(
        `INSERT INTO containers (order_batch_id, po_id, container_no, seal_no) VALUES (?, ?, ?, ?)`,
        [batchIdToUse, posIds[c.poIdx], c.containerNo, c.sealNo]
      );
      containerIds.push(r.lastInsertRowId);
    }

    const palletIds = [];
    for (const p of plan.pallets) {
      const r = await db.runAsync(
        `INSERT INTO pallets (container_id, po_id, pallet_no, c_no, is_mixed,
                              length_m, width_m, height_m, volume_cbm, nw_kg, gw_kg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [containerIds[p.containerIdx], posIds[p.poIdx], p.palletNo, p.cNo, p.isMixed,
         p.length_m, p.width_m, p.height_m, p.volume_cbm, p.nw_kg, p.gw_kg]
      );
      palletIds.push(r.lastInsertRowId);
    }

    for (const pl of plan.palletLines) {
      await db.runAsync(
        `INSERT INTO pallet_lines (pallet_id, order_line_id, qty) VALUES (?, ?, ?)`,
        [palletIds[pl.palletIdx], lineIds[pl.lineIdx], pl.qty]
      );
    }

    return done({
      pos: plan.pos.length, lines: plan.lines.length,
      containers: plan.containers.length, pallets: plan.pallets.length,
    });
  });
}

/**
 * Nhập nhật ký sản xuất từ JSON (`entries`).
 *
 * Mỗi mục phải có `po` để xác định dòng đơn hàng — bản cũ cho phép thiếu PO và tạo ra trạng
 * thái "chưa gắn PO" không giải quyết được; ở đây thiếu PO là **lỗi dữ liệu**, báo rõ thay vì
 * nhập vào đâu không rõ.
 */
export async function importEntriesFromJson(batchId, entries) {
  const db = await getDb();
  const bid = batchId ?? (await getActiveBatchId(db));
  if (!Array.isArray(entries) || entries.length === 0) return fail('ENTRIES_EMPTY');

  // (po, item_code) → order_line_id
  const map = new Map(
    (await db.getAllAsync(
      `SELECT l.id, p.code AS po, l.item_code
       FROM order_lines l JOIN pos p ON p.id = l.po_id WHERE p.order_batch_id = ?`, [bid]
    )).map(r => [`${r.po}\u0000${r.item_code}`, r.id])
  );

  const problems = [];
  let idx = 0;
  for (const e of entries) {
    idx += 1;
    const po = String(e?.po ?? '').trim();
    const code = String(e?.ntk ?? '').trim();
    const key = `${po}\u0000${code}`;
    if (!po) { problems.push(`Dòng ${idx}: thiếu PO`); continue; }
    if (!map.has(key)) { problems.push(`Dòng ${idx}: không có mã ${code} trong PO ${po}`); continue; }
    const q = parseQty(e?.qty);
    if (q === null || q <= 0) { problems.push(`Dòng ${idx}: số lượng không hợp lệ`); continue; }
    const d = String(e?.date ?? '').trim();
    if (!isValidDate(d)) { problems.push(`Dòng ${idx}: ngày "${d}" sai định dạng YYYY-MM-DD`); continue; }
    // Số lượng vượt hạn mức ⇒ cảnh báo nhưng **vẫn nhập** (không tự sửa dữ liệu nguồn).
    const lineId = map.get(key);
    const line = await db.getFirstAsync(`SELECT target FROM order_lines WHERE id = ?`, [lineId]);
    const used = num((await db.getFirstAsync(
      `SELECT COALESCE(SUM(qty),0) c FROM production_entries WHERE order_line_id = ?`, [lineId]
    ))?.c);
    if (num(line?.target) > 0 && used + q > num(line.target)) {
      problems.push(`Dòng ${idx}: ${code} (PO ${po}) vượt hạn mức (đã có ${used}, thêm ${q}, hạn mức ${line.target})`);
    }
    const defect = Math.max(parseQty(e?.defect_qty ?? e?.defectQty) ?? 0, 0);
    const res = await db.runAsync(
      `INSERT INTO production_entries (order_line_id, date, qty, line, defect_qty)
       VALUES (?, ?, ?, ?, ?)`,
      [lineId, d, q, e?.line === 'auto' ? 'auto' : 'manual', defect]
    );
    const types = String(e?.defect_types ?? e?.defectTypes ?? '').split(',').map(x => x.trim()).filter(Boolean);
    await writeDefects(db, res.lastInsertRowId, defect, types);
  }

  return done({
    imported: entries.length - problems.length,
    total: entries.length,
    problems,
  });
}

/**
 * Nhập danh sách mã hàng dạng phẳng (định dạng `總表` / `Column1..Column10` của bản cũ).
 * Mỗi dòng phải có PO; mã + PO là khoá duy nhất nên nạp lại không nhân đôi.
 */
export async function importItemsFromJson(batchId, jsonData) {
  const db = await getDb();
  const bid = batchId ?? (await getActiveBatchId(db));
  if (!bid) return fail('NO_ACTIVE_BATCH');
  const rows = Array.isArray(jsonData) ? jsonData : (jsonData?.items ?? []);
  if (rows.length === 0) return fail('ITEMS_EMPTY');

  const problems = [];
  let n = 0;
  for (const [i, r] of rows.entries()) {
    const po = String(r?.po ?? '').trim();
    const code = String(r?.ntk ?? r?.item_code ?? '').trim();
    if (!po || !code) { problems.push(`Dòng ${i + 1}: thiếu PO hoặc mã hàng`); continue; }
    const target = parseQty(r?.target);
    if (target === null || target < 0) { problems.push(`Dòng ${i + 1}: số lượng không hợp lệ`); continue; }
    const poRow = await db.getFirstAsync(
      `SELECT id FROM pos WHERE order_batch_id = ? AND code = ?`, [bid, po]
    );
    if (!poRow) { problems.push(`Dòng ${i + 1}: PO ${po} không có trong đơn`); continue; }
    const r2 = await db.runAsync(
      `INSERT INTO order_lines (po_id, item_code, target) VALUES (?, ?, ?)
       ON CONFLICT(po_id, item_code) DO UPDATE SET target = excluded.target`,
      [poRow.id, code, target]
    );
    n += r2.changes > 0 ? 1 : 1;
  }
  return done({ imported: n, total: rows.length, problems });
}