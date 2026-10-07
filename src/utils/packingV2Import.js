// src/utils/packingV2Import.js
// FEAT-21 — Bộ chuyển `packing_data.json` (`schema_version: 1`) → **kế hoạch dữ liệu** cho DB mới.
//
// Vì sao tách "kế hoạch" khỏi "ghi DB": hàm này **thuần**, không đụng SQLite ⇒ chạy được bằng
// `node` thuần (`scripts/test-schemaV2.mjs`) và kiểm được bằng chính file `src/data/Dmac.json`
// thật. `queries.js` chỉ việc `INSERT` theo đúng thứ tự mà hàm này đã sắp sẵn.
//
// Kế hoạch trả về **mảng phẳng, tham chiếu bằng chỉ số** (không phải object lồng nhau) vì đây đúng
// là thứ `INSERT … VALUES` cần: giảm tham chiếu chéo trong JS và giữ câu SQL đơn giản.
//
// NGUYÊN TẮC: kế hoạch này phải **tái tạo đúng** những gì file nguồn nói. Không suy diễn, không
// bịa số: thiếu dữ liệu thì để NULL, không đặt 0.

/**
 * @typedef {{code: string, consignee: string|null, address: string|null,
 *            destination: string|null, invoice_no: string|null}} PoRow
 */

/**
 * Bước 1 — thông tin đơn hàng + danh sách PO.
 *
 * Lấy PO từ `batches[].shipments[]` (giữ nguyên `id`/`po_no`), **không** lấy từ
 * `shipment_list[]`: `shipment_list` chỉ là bản tóm tắt, không có `consignee`/`invoice_no`.
 *
 * @param {object} json nội dung `packing_data.json`
 * @returns {{order: {sourceFile: string, mark: string}, pos: PoRow[]}}
 */
export function buildOrderPlan(json) {
  const batches = Array.isArray(json?.batches) ? json.batches : [];
  const pos = [];
  const seen = new Set();
  for (const b of batches) {
    for (const sh of b?.shipments ?? []) {
      const code = String(sh?.po_no ?? '').trim();
      // PO trùng lặp giữa các batch: `pos` khác `order_batch_id` nên vẫn hợp lệ, nhưng
      // trong một lần nhập thì PO phải là duy nhất ⇒ bỏ bản lặp thay vì tạo rác.
      if (!code || seen.has(code)) continue;
      seen.add(code);
      pos.push({
        code,
        consignee: sh.consignee ?? null,
        address: sh.address ?? null,
        destination: sh.destination ?? null,
        invoice_no: sh.invoice_no ?? null,
      });
    }
  }
  const first = batches[0] ?? {};
  return {
    order: {
      sourceFile: String(first.source_file ?? json?.source_file ?? ''),
      mark: String(first.mark ?? ''),
    },
    pos,
  };
}

/**
 * Bước 2 — `order_lines` + `item_refs` + `order_line_refs`.
 *
 * `target` lấy từ `item_summary` của **từng shipment** ⇒ đây là số của riêng PO đó, đúng thứ bản
 * cũ không làm được (nó cộng dồn rồi tự suy diễn ngược). `Dmac.json` đã tính sẵn và `checks.ok`
 * xác nhận khớp với tổng kiện.
 *
 * 4 cột KL/TKL/thể tích/số kiện lấy cùng chỗ. `NULL` = không có dữ liệu (INV-I1), KHÔNG đặt 0.
 *
 * @param {object} json
 * @param {PoRow[]} posRows kết quả `buildOrderPlan().pos` (dùng để tra `po` → chỉ số)
 * @returns {{lines: Array<object>, refs: Array<{itemCode: string, refNo: string}>,
 *            lineRefs: Array<{poIdx: number, itemCode: string, refNo: string, target: number}>}}
 */
export function buildLinePlan(json, posRows) {
  const poIndex = new Map(posRows.map((p, i) => [p.code, i]));
  const lines = [];
  const refs = new Map(); // key = `${itemCode}\u0000${refNo}`

  for (const b of Array.isArray(json?.batches) ? json.batches : []) {
    for (const sh of b?.shipments ?? []) {
      const poIdx = poIndex.get(String(sh?.po_no ?? '').trim());
      if (poIdx === undefined) continue; // PO không có trong `pos` ⇒ bỏ, không đoán
      for (const s of sh?.item_summary ?? []) {
        const itemCode = String(s?.item_code ?? '').trim();
        if (!itemCode) continue;
        lines.push({
          poIdx,
          itemCode,
          target: toInt(s.qty),
          nw_kg: toNumOrNull(s.nw_kg),
          gw_kg: toNumOrNull(s.gw_kg),
          volume_cbm: toNumOrNull(s.volume_cbm),
          package_count: toIntOrNull(s.package_count),
        });
      }
    }
  }

  // Số hiệu nhà máy nằm ở tầng **kiện** (`packages[].items[].order_ref`), không có ở `item_summary`.
  //
  // FEAT-22: gom **hai** cách, vì chúng ở hai tầng khác nhau và cả hai đều cần:
  //   • `refs`     — (mã, ref) cho bảng `item_refs`: "mã này có mấy số hiệu" (55 dòng).
  //   • `lineRefs` — (PO, mã, ref, target) cho bảng `order_line_refs`: số hiệu của **riêng thẻ**.
  //
  // `target` của ref = tổng `qty` các kiện mang ref đó. Đo trên `Dmac.json`: tổng này bằng đúng
  // `order_lines.target` của dòng đó (76/76) nên đây là dữ liệu thật, không phải chia đều.
  // `refs` giữ dùng chỗ cũ (một `(mã, ref)` có thể ở nhiều PO) — không dùng nó để hiển thị thẻ.
  const lineRefQty = new Map(); // key = `${poIdx}\u0000${itemCode}\u0000${refNo}`
  for (const b of Array.isArray(json?.batches) ? json.batches : []) {
    for (const sh of b?.shipments ?? []) {
      const poIdx = poIndex.get(String(sh?.po_no ?? '').trim());
      if (poIdx === undefined) continue;
      for (const ct of sh?.containers ?? []) {
        for (const pkg of ct?.packages ?? []) {
          for (const it of pkg?.items ?? []) {
            const itemCode = String(it?.item_code ?? '').trim();
            const refNo = String(it?.order_ref ?? '').trim();
            if (!itemCode || !refNo) continue;
            refs.set(`${itemCode}\u0000${refNo}`, { itemCode, refNo });
            const key = `${poIdx}\u0000${itemCode}\u0000${refNo}`;
            lineRefQty.set(key, (lineRefQty.get(key) ?? 0) + toInt(it?.qty));
          }
        }
      }
    }
  }

  const lineRefs = [];
  for (const [key, target] of lineRefQty) {
    const [poIdx, itemCode, refNo] = key.split('\u0000');
    lineRefs.push({ poIdx: Number(poIdx), itemCode, refNo, target });
  }

  return { lines, refs: [...refs.values()], lineRefs };
}

/**
 * Bước 3 — `containers` + `pallets` + `pallet_lines`.
 *
 * `pallet_lines` nối kiện với **dòng đơn hàng** qua `(po, item_code)` ⇒ chính là quan hệ mà bản cũ
 * buộc phải đoán bằng `remapPalletStatus`.
 *
 * @param {object} json
 * @param {PoRow[]} posRows
 * @param {Array<object>} lines kết quả `buildLinePlan().lines`
 * @returns {{containers: Array<object>, pallets: Array<object>, palletLines: Array<object>}}
 */
export function buildPalletPlan(json, posRows, lines) {
  const poIndex = new Map(posRows.map((p, i) => [p.code, i]));
  // (po, itemCode) → chỉ số dòng trong `lines`, để tra ngược khi ghi `pallet_lines`.
  const lineIndex = new Map(lines.map((l, i) => [`${l.poIdx}\u0000${l.itemCode}`, i]));

  const containers = [];
  const pallets = [];
  const palletLines = [];
  const containerSeen = new Map(); // container_no → chỉ số

  for (const b of Array.isArray(json?.batches) ? json.batches : []) {
    for (const sh of b?.shipments ?? []) {
      const poIdx = poIndex.get(String(sh?.po_no ?? '').trim());
      if (poIdx === undefined) continue;
      for (const ct of sh?.containers ?? []) {
        const containerNo = String(
          ct?.container_no || ct?.container_label || (ct?.container_index ? `Container ${ct.container_index}` : '')
        ).trim();
        if (!containerNo) continue;
        let cIdx = containerSeen.get(containerNo);
        if (cIdx === undefined) {
          cIdx = containers.length;
          containerSeen.set(containerNo, cIdx);
          containers.push({ poIdx, containerNo, sealNo: ct.seal_no ?? null });
        }
        for (const pkg of ct?.packages ?? []) {
          const palletNo = toInt(pkg?.package_no);
          if (!palletNo || palletNo <= 0) continue;
          const itemCount = Array.isArray(pkg?.items) ? pkg.items.length : 0;
          const pIdx = pallets.length;
          pallets.push({
            containerIdx: cIdx,
            poIdx,
            palletNo,
            cNo: pkg.c_no ?? null,
            // `is_mixed` của nguồn, nhưng tự kiểm lại bằng số dòng hàng thật: tin dữ liệu, không
            // tin nhãn. Nếu nguồn ghi sai nhãn thì `item_count > 1` mới là sự thật.
            isMixed: itemCount > 1 ? 1 : (pkg?.is_mixed ? 1 : 0),
            length_m: toNumOrNull(pkg?.length_m),
            width_m: toNumOrNull(pkg?.width_m),
            height_m: toNumOrNull(pkg?.height_m),
            volume_cbm: toNumOrNull(pkg?.volume_cbm),
            nw_kg: toNumOrNull(pkg?.nw_kg),
            gw_kg: toNumOrNull(pkg?.gw_kg),
          });
          for (const it of pkg?.items ?? []) {
            const itemCode = String(it?.item_code ?? '').trim();
            const lIdx = lineIndex.get(`${poIdx}\u0000${itemCode}`);
            // Dòng hàng không có trong `item_summary` ⇒ bỏ và ghi cảnh báo ở bước kiểm tra;
            // ghi `pallet_lines` với `lineIdx: null` sẽ vi phạm FK ⇒ bỏ hẳn ở đây.
            if (!itemCode || lIdx === undefined) continue;
            palletLines.push({ palletIdx: pIdx, lineIdx: lIdx, qty: toInt(it?.qty) });
          }
        }
      }
    }
  }

  return { containers, pallets, palletLines };
}

/** Kế hoạch đầy đủ cho một lần nhập `packing_data.json`. */
export function buildImportPlanV2(json) {
  const { order, pos } = buildOrderPlan(json);
  const { lines, refs, lineRefs } = buildLinePlan(json, pos);
  const { containers, pallets, palletLines } = buildPalletPlan(json, pos, lines);
  return { order, pos, lines, refs, lineRefs, containers, pallets, palletLines };
}

// ── helper ──────────────────────────────────────────────────────────────────
function toInt(v) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  return toInt(v);
}
function toNumOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}