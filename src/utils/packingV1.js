// src/utils/packingV1.js
// FEAT-16 — Chuyển packing list `schema_version 1` (thang JSON lồng 4 tầng) sang định dạng
// legacy mà `queries.importItemsFromJson` + `queries.importContainerData` đang nhận.
//
// VÌ SAO LÀM CONVERTER MÀ KHÔNG THÊM PARSER VÀO APP:
// xem `specs/features/FEAT-16-convert-packing-data-v1.md` §2. Tóm lại: parser mới trong app
// phải duy trì song song 2 nhánh import và có nguy cơ ghi **số liệu sai âm thầm**; converter thì
// lỗi ⇒ báo, không ghi gì.
//
// ⚠️ HÀM THUẦN: không `fs`, không `react-native`, không network ⇒ test được bằng
// `node scripts/test-packingV1.mjs` (SPEC-test.md §11.2).
//
// ⚠️ HAI RÀNG BUỘC ĐÃ PHÁT HIỆN KHI CHẠY E2E (bắt buộc gộp thành MỘT file):
// (1) `container_data` có PK `batch_id` ⇒ mỗi batch chỉ giữ **một** cấu trúc container.
//     Import nhiều file ⇒ `INSERT OR REPLACE` ⇒ chỉ còn cấu trúc của file cuối cùng.
// (2) `items` có PK `(ntk, order_batch_id)` ⇒ cùng `ntk` ở file sau sẽ **đè** target của file trước.
//     Đo thật trên `packing_data.json`: import 22 file chỉ còn Σ target 17.935/51.568 ⇒ MẤT DỮ LIỆU.
// ⇒ Converter gộp **toàn bộ** shipment vào MỘT file: số kiện đánh số toàn cục, mỗi (kiện, mã)
// một dòng `總表` ⇒ app cộng dồn ra `target` đúng cho từng mã, và toàn bộ container được giữ.
// Hệ quả (giới hạn sẵn có của app, xem AC-CONV-11): `importItemsFromJson` chỉ đọc `Column10` của
// dòng ĐẦU TIÊN rồi gán cho mọi item ⇒ nhãn PO của các mã sẽ là một PO duy nhất. Bản đồ PO đầy đủ
// theo từng mã được ghi vào `manifest.json` để đối chiếu.

/** Khóa mảng tổng hợp trong định dạng legacy (app đọc key này). */
export const LEGACY_SUMMARY_KEY = '總表';

/** Mã hàng hợp lệ — khớp regex đang dùng ở `queries.js`. */
export const NTK_RE = /^[0-9A-Za-z]+$/;

/** Chuỗi `Column1` mà app nhận diện khoảng kiện: `"Pallet 1-18"`. */
export function palletRangeLabel(from, to) {
  return `Pallet ${from}-${to}`;
}

/** Chuỗi `Column1` cho hàng đơn kiện: app chỉ dùng `Column1` ở mảng container ⇒ `"Pallet 7-7"`. */
export function singlePalletLabel(no) {
  return palletRangeLabel(no, no);
}

/**
 * Chuẩn hoá một giá trị thành số nguyên an toàn (không dùng `parseInt` trên chuỗi rác).
 * @param {unknown} value
 * @returns {number|null} `null` nếu không phải số nguyên dương.
 */
export function toPositiveInt(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

/**
 * Ép `po_no` sang **number** — app yêu cầu `typeof col10 === 'number'`.
 * PO như `"2919-2930"` không ép được ⇒ file đó **không** tạo được ⇒ trả `null`.
 * @param {unknown} po
 * @returns {number|null}
 */
export function toPoNumber(po) {
  const n = typeof po === 'number' ? po : Number(String(po ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

/**
 * Gom các shipment từ `batches`, giữ nguyên thứ tự file.
 * Chấp nhận cả `batches[].shipments` lẫn `shipment_list` phẳng để tương thích nhiều bản.
 * @param {any} data
 * @returns {Array<object>}
 */
export function collectShipments(data) {
  if (!data || typeof data !== 'object') return [];
  const out = [];
  if (Array.isArray(data.batches)) {
    for (const batch of data.batches) {
      if (!batch || !Array.isArray(batch.shipments)) continue;
      for (const shipment of batch.shipments) {
        if (shipment && typeof shipment === 'object') out.push({ batch, shipment });
      }
    }
  }
  if (out.length === 0 && Array.isArray(data.shipment_list)) {
    for (const shipment of data.shipment_list) {
      if (shipment && typeof shipment === 'object') out.push({ batch: null, shipment });
    }
  }
  return out;
}

/**
 * Kiểm tra một container có mã hàng hợp lệ, không rỗng, `qty > 0` không.
 * @returns {string[]} danh sách `problem` (rỗng ⇒ hợp lệ)
 */
function validatePackages(packages) {
  const problems = [];
  const seen = new Set();
  let previous = null;

  for (const pkg of packages) {
    const no = toPositiveInt(pkg?.package_no);
    if (no === null) problems.push('PKG_NO_INVALID');
    if (no !== null) {
      if (seen.has(no)) problems.push('PKG_NO_INVALID');
      seen.add(no);
      if (previous !== null && no <= previous) problems.push('PKG_NO_INVALID');
      previous = no;
    }
    const items = Array.isArray(pkg?.items) ? pkg.items : [];
    if (items.length === 0) problems.push('EMPTY_PACKAGE');
    let itemsQty = 0;
    for (const it of items) {
      if (!it || typeof it.item_code !== 'string' || !NTK_RE.test(it.item_code)) problems.push('INVALID_NTK');
      const qty = Number(it?.qty);
      if (!Number.isFinite(qty) || qty <= 0) problems.push('EMPTY_PACKAGE');
      else itemsQty += qty;
    }
    const declared = Number(pkg?.total_qty);
    if (Number.isFinite(declared) && declared !== itemsQty) problems.push('PACKAGE_QTY_MISMATCH');
  }
  return problems;
}

/**
 * Kiểm tra + chuyển MỘT shipment thành **dòng `總表` và danh sách container** (chưa gộp).
 *
 * @param {object} shipment   Một phần tử của `batches[].shipments`.
 * @param {object} opts
 * @param {number} opts.startPalletNo  Số kiện toàn cục của shipment trước đó (đánh số nối tiếp).
 * @returns {{ok: boolean, problems: string[], warnings: string[], stats: object,
 *            rows: Array<object>, containers: Array<object>, itemPos: Map<string, Set<string>>}}
 */
export function convertShipment(shipment, { startPalletNo = 1 } = {}) {
  const problems = [];
  const warnings = [];
  const containers = Array.isArray(shipment?.containers) ? shipment.containers : [];
  const po = toPoNumber(shipment?.po_no);
  if (po === null) problems.push('PO_NOT_NUMERIC');

  let palletNo = startPalletNo;
  const rows = [];
  const containerBlocks = [];
  const itemsTotal = new Map();
  const itemPos = new Map();
  let qtyTotal = 0;

  for (const container of containers) {
    const packages = Array.isArray(container?.packages) ? container.packages : [];
    problems.push(...validatePackages(packages));

    const range = container?.pallet_range;
    const from = toPositiveInt(range?.from);
    const to = toPositiveInt(range?.to);
    if (from === null || to === null || to < from) problems.push('PALLET_RANGE_MISMATCH');
    else if (to - from + 1 !== packages.length) problems.push('PALLET_RANGE_MISMATCH');

    // AC-CONV-03: đánh số TOÀN CỤC, không dùng `package_no` (vốn đặt lại từ 1 mỗi container).
    const globalFrom = palletNo;
    for (const pkg of packages) {
      const items = (Array.isArray(pkg?.items) ? pkg.items : [])
        .filter(it => it && typeof it.item_code === 'string' && NTK_RE.test(it.item_code) && Number(it.qty) > 0)
        .map(it => ({ ntk: it.item_code, qty: Number(it.qty) }));

      for (const it of items) {
        // AC-CONV-04: kiện nhiều mã ⇒ nhiều dòng `總表` cùng `Column2`; app cộng dồn theo Column4
        // ⇒ `target` của mã = TỔNG qty của mã trên mọi kiện (đúng cả khi mã ở nhiều shipment).
        rows.push({
          Column1: singlePalletLabel(palletNo),
          Column2: palletNo,
          Column4: it.ntk,
          Column6: it.qty,
          Column10: po,
        });
        itemsTotal.set(it.ntk, (itemsTotal.get(it.ntk) || 0) + it.qty);
        qtyTotal += it.qty;
        if (!itemPos.has(it.ntk)) itemPos.set(it.ntk, new Set());
        if (shipment?.po_no != null) itemPos.get(it.ntk).add(String(shipment.po_no));
      }
      palletNo += 1;
    }

    const globalTo = palletNo - 1;
    if (globalTo < globalFrom) problems.push('EMPTY_PACKAGE');
    // AC-CONV-05: row của mảng container mang dải kiện toàn cục.
    containerBlocks.push({
      key: typeof container?.container_no === 'string' && container.container_no
        ? container.container_no
        : `Container${containerBlocks.length + 1}`,
      row: { Column1: palletRangeLabel(globalFrom, globalTo) },
    });
  }

  const palletCount = palletNo - startPalletNo;
  const totals = shipment?.totals || {};
  const declaredContainers = toPositiveInt(totals.containers);
  if (declaredContainers !== null && declaredContainers !== containers.length) problems.push('CONT_COUNT_MISMATCH');
  const declaredPackages = toPositiveInt(totals.packages);
  if (declaredPackages !== null && declaredPackages !== palletCount) problems.push('PKG_COUNT_MISMATCH');
  if (Number.isFinite(Number(totals.qty)) && Number(totals.qty) !== qtyTotal) problems.push('QTY_MISMATCH');

  if (shipment?.ok === false) warnings.push(`Shipment ${shipment.po_no} được đánh dấu ok=false trong file nguồn.`);
  for (const w of Array.isArray(shipment?.warnings) ? shipment.warnings : []) warnings.push(String(w));

  return {
    ok: problems.length === 0,
    problems: [...new Set(problems)],
    warnings,
    needsReview: warnings.length > 0,
    rows,
    containers: containerBlocks,
    itemPos,
    stats: {
      po: shipment?.po_no ?? null,
      containers: containers.length,
      pallets: palletCount,
      items: itemsTotal.size,
      qty: qtyTotal,
      palletFrom: startPalletNo,
      palletTo: palletNo - 1,
    },
  };
}

/**
 * Chuyển TOÀN BỘ file `packing_data.json` (schema v1) thành **MỘT** file legacy.
 *
 * Vì sao gộp: `container_data` PK `batch_id` và `items` PK `(ntk, order_batch_id)` ⇒ mỗi lần
 * import chỉ giữ được dữ liệu của file cuối cùng. Gộp tất cả vào một file là cách duy nhất
 * nạp được toàn bộ 26 container / 468 kiện / 51.568 pcs mà không mất hay ghi đè.
 *
 * @param {any} data Nội dung đã `JSON.parse`.
 * @returns {{ok: boolean, blocking: boolean, file: {fileName: string, json: object}|null,
 *            items: Array<{ntk: string, target: number, pos: string[]}>,
 *            problems: Array<{po: any, code: string}>, needsReview: Array<{po: any, warnings: string[]}>,
 *            stats: object}}
 *            `ok=false` khi có `problem` chặn ⇒ `file = null` (AC-CONV-07/10).
 */
export function convertPackingDataV1(data) {
  const shipments = collectShipments(data);
  const problems = [];
  const needsReview = [];
  const rows = [];
  const containerBlocks = [];
  const itemPos = new Map();
  const itemQty = new Map();
  const poQty = new Map();
  const stats = {
    shipments: 0, containers: 0, pallets: 0, qty: 0, items: 0, dominantPo: null,
  };
  let palletCursor = 1;

  if (shipments.length === 0) {
    return {
      ok: false, blocking: true, file: null, items: [], needsReview, problems: [{ po: null, code: 'NO_SHIPMENTS' }],
      stats, dominantPoQty: 0,
    };
  }

  for (const { shipment } of shipments) {
    const res = convertShipment(shipment, { startPalletNo: palletCursor });
    const po = shipment?.po_no ?? null;
    if (!res.ok) {
      for (const code of res.problems) problems.push({ po, code });
      palletCursor += res.stats.pallets; // vẫn tiến số kiện để báo cáo nhất quán
      continue;
    }
    palletCursor += res.stats.pallets;
    rows.push(...res.rows);
    containerBlocks.push(...res.containers);
    for (const [ntk, pos] of res.itemPos) {
      if (!itemPos.has(ntk)) itemPos.set(ntk, new Set());
      for (const p of pos) itemPos.get(ntk).add(p);
    }
    for (const row of res.rows) {
      itemQty.set(row.Column4, (itemQty.get(row.Column4) || 0) + row.Column6);
      const key = String(po);
      poQty.set(key, (poQty.get(key) || 0) + row.Column6);
    }
    if (res.needsReview) needsReview.push({ po, warnings: res.warnings });
    stats.shipments += 1;
    stats.containers += res.stats.containers;
    stats.pallets += res.stats.pallets;
    stats.qty += res.stats.qty;
  }

  if (problems.length > 0) {
    return { ok: false, blocking: true, file: null, items: [], needsReview, problems, stats, dominantPoQty: 0 };
  }

  // PO "đại diện": PO đóng góp nhiều số lượng nhất — dùng cho `Column10` vì app chỉ đọc dòng đầu.
  let dominantPo = null;
  let dominantQty = -1;
  for (const [po, qty] of poQty) {
    if (qty > dominantQty) { dominantQty = qty; dominantPo = po; }
  }
  const dominantPoNumber = toPoNumber(dominantPo);

  // Ghi PO đại diện vào MỌI dòng để `Column10` nhất quán (app lấy dòng đầu, nhưng đồng bộ
  // toàn bộ giúp file đọc được bằng mắt và không lệch nếu app đổi cách đọc).
  for (const row of rows) row.Column10 = dominantPoNumber;

  const json = { [LEGACY_SUMMARY_KEY]: rows };
  const usedKeys = new Set();
  containerBlocks.forEach((block, i) => {
    let key = block.key;
    if (usedKeys.has(key)) key = `${key}#${i}`;   // trùng `container_no` giữa 2 shipment
    usedKeys.add(key);
    json[key] = [block.row];
  });

  const items = [...itemQty.entries()]
    .map(([ntk, target]) => ({ ntk, target, pos: [...(itemPos.get(ntk) || [])].sort() }))
    .sort((a, b) => a.ntk.localeCompare(b.ntk));
  stats.items = items.length;
  stats.dominantPo = dominantPo;

  return {
    ok: true,
    blocking: false,
    file: { fileName: 'packing_legacy.json', json },
    items,
    needsReview,
    problems,
    stats,
    dominantPoQty: dominantQty,
  };
}

/**
 * Đối chiếu kết quả chuyển đổi với mảng `shipment_list` của file nguồn (AC-CONV-09).
 * @param {any} data
 * @param {{containers: number, pallets: number, qty: number}} stats
 * @returns {{matched: boolean, expected: object, actual: object, notes: string[]}}
 */
export function verifyAgainstShipmentList(data, stats) {
  const list = Array.isArray(data?.shipment_list) ? data.shipment_list : [];
  const expected = {
    shipments: list.length,
    containers: list.reduce((s, r) => s + (Number(r?.totals?.containers) || 0), 0),
    pallets: list.reduce((s, r) => s + (Number(r?.totals?.packages) || 0), 0),
    qty: list.reduce((s, r) => s + (Number(r?.totals?.qty) || 0), 0),
  };
  const actual = {
    shipments: stats?.shipments || 0,
    containers: stats?.containers || 0,
    pallets: stats?.pallets || 0,
    qty: stats?.qty || 0,
  };
  const notes = [];
  for (const key of ['shipments', 'containers', 'pallets', 'qty']) {
    if (expected[key] !== actual[key]) notes.push(`${key}: file nguồn ${expected[key]} ≠ kết quả chuyển đổi ${actual[key]}`);
  }
  return { matched: notes.length === 0, expected, actual, notes };
}