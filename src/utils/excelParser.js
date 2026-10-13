// src/utils/excelParser.js
import * as XLSX from 'xlsx';

/**
 * Chuẩn hóa chuỗi ký tự (cắt khoảng trắng, null-safe).
 */
const cleanStr = v => String(v ?? '').trim();

/**
 * Chuẩn hóa số (loại bỏ dấu phẩy ngăn cách hàng nghìn, null-safe).
 */
const cleanNum = v => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Chuẩn hóa mã PO: chuyển "2930.0" thành "2930".
 */
const cleanPo = v => {
  const s = cleanStr(v);
  if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
  return s;
};

/**
 * Phân tích các dòng dạng bảng (2D array) của biểu mẫu RE-CP4-16-S (Packing List).
 * @param {Array<Array<any>>} rows 
 * @returns {Array<object>} Danh sách container tìm được
 */
export function extractContainersFromRows(rows) {
  const containers = [];
  let curContainer = null;
  let inData = false;

  let colIdx = {
    po: 0,
    no: 1,
    ref: 2,
    ntk: 3,
    sku: 4,
    qty: 5,
    nw: 6,
    gw: 8,
    len: 10,
    wid: 12,
    height: 14,
    cbm: 15,
  };

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rowStr = row.map(cleanStr).join(' ');

    // 1. Nhận diện Container No (ví dụ: "Container No.,,MCCU1134870")
    // Tiêu chuẩn container quốc tế: 4 chữ cái + 7 chữ số (ví dụ MCCU1134870)
    const containerNoMatch = row.find(c => /^[A-Z]{4}\d{7}$/.test(cleanStr(c)));
    if (containerNoMatch) {
      if (curContainer && curContainer.packages.length > 0) {
        containers.push(curContainer);
      }
      curContainer = {
        container_no: cleanStr(containerNoMatch),
        container_label: cleanStr(containerNoMatch),
        seal_no: null,
        po_no: null,
        c_no: null,
        packages: [],
      };
      inData = false;
      continue;
    }

    // 2. Nhận diện dòng "From ... To ... [PO]"
    if (curContainer && !curContainer.po_no) {
      const toIndex = row.findIndex(c => cleanStr(c).toLowerCase() === 'to');
      if (toIndex !== -1) {
        for (let j = toIndex + 1; j < row.length; j++) {
          const val = cleanStr(row[j]);
          if (val && !val.includes('-') && /^\d+(\.0+)?$/.test(val)) {
            curContainer.po_no = cleanPo(val);
            break;
          }
        }
      }
    }

    // 3. Nhận diện "C/No., 1-18"
    if (curContainer && !curContainer.c_no) {
      const cNoIdx = row.findIndex(c => cleanStr(c).includes('C/No'));
      if (cNoIdx !== -1) {
        for (let j = cNoIdx + 1; j < row.length; j++) {
          const val = cleanStr(row[j]);
          if (val) {
            curContainer.c_no = val;
            break;
          }
        }
      }
    }

    // 4. Nhận diện thông tin Seal và Pallet:
    // ví dụ "MCCU1134870/ VN22588AT / Pallet 1-18" hoặc "Container 1/ Seal No. / Pallet 1-18"
    const sealMatch = rowStr.match(/(?:([A-Z]{4}\d{7}|Container\s*\d+)\s*\/\s*)?([A-Z0-9]+)\s*\/\s*(?:Pallet|C\/No\.)\s*([\d\s-]+)/i);
    if (sealMatch) {
      const detectedCont = sealMatch[1]?.trim();
      const detectedSeal = sealMatch[2]?.trim();
      const detectedRange = sealMatch[3]?.trim();

      if (!curContainer) {
        curContainer = {
          container_no: detectedCont || 'Container 1',
          container_label: detectedCont || 'Container 1',
          seal_no: detectedSeal && !detectedSeal.toLowerCase().includes('seal') ? detectedSeal : null,
          po_no: null,
          c_no: detectedRange,
          packages: [],
        };
      } else {
        if (detectedSeal && !detectedSeal.toLowerCase().includes('seal')) {
          curContainer.seal_no = detectedSeal;
        }
        if (detectedRange && !curContainer.c_no) {
          curContainer.c_no = detectedRange;
        }
      }
      inData = true;
      continue;
    }

    // 5. Nhận diện dòng tiêu đề bảng: "Package", "DMAC No.", "NTK No."
    const hasNtk = row.some(c => cleanStr(c).includes('NTK'));
    const hasDmac = row.some(c => cleanStr(c).includes('DMAC'));
    const hasQty = row.some(c => cleanStr(c).includes('Quantity') || cleanStr(c).includes('Số lượng'));

    if (hasNtk || (hasDmac && hasQty)) {
      row.forEach((cell, idx) => {
        const text = cleanStr(cell).toLowerCase();
        if (text.includes('dmac')) colIdx.ref = idx;
        else if (text.includes('ntk')) colIdx.ntk = idx;
        else if (text.includes('no.') && !text.includes('container') && !text.includes('dmac') && !text.includes('ntk')) colIdx.no = idx;
        else if (text.includes('quantity') || text.includes('số lượng')) colIdx.qty = idx;
        else if (text.includes('n.w')) colIdx.nw = idx;
        else if (text.includes('g.w')) colIdx.gw = idx;
        else if (text.includes('体积') || text.includes('thể tích')) colIdx.cbm = idx;
      });
      inData = true;
      continue;
    }

    // 6. Nhận diện kết thúc dữ liệu container: "SAY TOTAL", "计划出货", "表单编号"
    if (rowStr.includes('SAY TOTAL') || rowStr.includes('计划出货') || rowStr.includes('Kế hoạch xuất hàng') || rowStr.includes('RE-CP4-16-S')) {
      inData = false;
      continue;
    }

    // 7. Xử lý dòng dữ liệu kiện
    if (inData && curContainer) {
      const ntkVal = cleanStr(row[colIdx.ntk]);
      const qtyVal = cleanNum(row[colIdx.qty]);
      const noVal = cleanNum(row[colIdx.no]);
      const poVal = cleanPo(row[colIdx.po]);

      if (ntkVal && qtyVal > 0 && noVal > 0) {
        const refVal = cleanStr(row[colIdx.ref]);
        const nwVal = cleanNum(row[colIdx.nw]);
        const gwVal = cleanNum(row[colIdx.gw]);
        const cbmVal = cleanNum(row[colIdx.cbm]);
        const rowPo = poVal || curContainer.po_no;

        if (rowPo && !curContainer.po_no) {
          curContainer.po_no = rowPo;
        }

        let pkg = curContainer.packages.find(p => p.package_no === noVal);
        if (!pkg) {
          pkg = {
            package_no: noVal,
            seq: noVal,
            po_no: rowPo,
            is_mixed: false,
            item_count: 1,
            total_qty: qtyVal,
            nw_kg: nwVal,
            gw_kg: gwVal,
            height_m: cleanNum(row[colIdx.height]),
            volume_cbm: cbmVal,
            items: [],
          };
          curContainer.packages.push(pkg);
        } else {
          pkg.is_mixed = true;
          pkg.item_count += 1;
          pkg.total_qty += qtyVal;
        }

        pkg.items.push({
          order_ref: refVal || null,
          item_code: ntkVal,
          qty: qtyVal,
          nw_kg: nwVal,
          gw_kg: gwVal,
          height_m: cleanNum(row[colIdx.height]),
          volume_cbm: cbmVal,
        });
      }
    }
  }

  if (curContainer && curContainer.packages.length > 0) {
    containers.push(curContainer);
  }

  return containers;
}

/**
 * Đọc toàn bộ Workbook (Excel .xlsx, .xls hoặc CSV) và chuyển đổi sang schema_version: 1.
 * @param {ArrayBuffer|Uint8Array|string} fileData Dữ liệu nhị phân hoặc chuỗi CSV
 * @param {string} filename Tên file gốc
 * @returns {{ok: boolean, data?: object, stats?: object, error?: string}}
 */
export function parseExcelOrCsv(fileData, filename = 'import.xlsx') {
  try {
    let workbook;
    if (typeof fileData === 'string') {
      workbook = XLSX.read(fileData, { type: 'string' });
    } else {
      const data = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
      workbook = XLSX.read(data, { type: 'array' });
    }

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { ok: false, error: 'File rỗng hoặc không có bảng dữ liệu.' };
    }

    let allContainers = [];

    // Quét qua tất cả các sheet trong file
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows && rows.length > 0) {
        const found = extractContainersFromRows(rows);
        allContainers.push(...found);
      }
    }

    if (allContainers.length === 0) {
      return {
        ok: false,
        error: 'Không tìm thấy dữ liệu container theo biểu mẫu RE-CP4-16-S trong file này.',
      };
    }

    // Khử trùng lặp: nếu sheet tổng hợp liệt kê lại container đã có ở sheet chi tiết
    const validContainers = [];
    const seen = new Set();
    for (const c of allContainers) {
      const key = `${c.container_no}:${c.po_no}`;
      if (seen.has(key)) continue;
      seen.add(key);
      validContainers.push(c);
    }

    // Nhóm container theo PO để tạo shipments
    const poMap = new Map();
    for (const cont of validContainers) {
      const po = cont.po_no || 'PO_CHUNG';
      if (!poMap.has(po)) {
        poMap.set(po, {
          po_no: po,
          mark: 'DMAC',
          containers: [],
        });
      }
      poMap.get(po).containers.push(cont);
    }

    const shipments = [];
    const shipmentList = [];
    const allDistinctItems = new Set();
    const allDistinctRefs = new Set();
    let grandTotalQty = 0;
    let grandTotalPackages = 0;

    for (const [po, data] of poMap.entries()) {
      const itemMap = new Map();
      let totalQty = 0;
      let totalNw = 0;
      let totalGw = 0;
      let totalCbm = 0;
      let totalPkgs = 0;

      for (const cont of data.containers) {
        totalPkgs += cont.packages.length;
        for (const pkg of cont.packages) {
          for (const it of pkg.items) {
            totalQty += it.qty;
            totalNw += it.nw_kg;
            totalGw += it.gw_kg;
            totalCbm += it.volume_cbm;
            allDistinctItems.add(it.item_code);
            if (it.order_ref) allDistinctRefs.add(it.order_ref);

            if (!itemMap.has(it.item_code)) {
              itemMap.set(it.item_code, {
                item_code: it.item_code,
                qty: 0,
                nw_kg: 0,
                gw_kg: 0,
                volume_cbm: 0,
                package_count: 0,
              });
            }
            const summary = itemMap.get(it.item_code);
            summary.qty += it.qty;
            summary.nw_kg += it.nw_kg;
            summary.gw_kg += it.gw_kg;
            summary.volume_cbm = Math.round((summary.volume_cbm + it.volume_cbm) * 100) / 100;
            summary.package_count += 1;
          }
        }
      }

      grandTotalQty += totalQty;
      grandTotalPackages += totalPkgs;

      const item_summary = Array.from(itemMap.values());

      shipments.push({
        id: `shipment:${po}`,
        po_no: po,
        mark: 'DMAC',
        containers: data.containers,
        item_summary,
      });

      shipmentList.push({
        id: `shipment:${po}`,
        po_no: po,
        mark: 'DMAC',
        totals: {
          containers: data.containers.length,
          packages: totalPkgs,
          qty: totalQty,
          nw_kg: Math.round(totalNw),
          gw_kg: Math.round(totalGw),
          volume_cbm: Math.round(totalCbm * 100) / 100,
        },
      });
    }

    const resultJson = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source_file: filename,
      shipment_list: shipmentList,
      batches: [
        {
          id: `batch-${Date.now()}`,
          source_file: filename,
          mark: 'DMAC',
          shipments,
        },
      ],
    };

    return {
      ok: true,
      data: resultJson,
      stats: {
        poCount: shipments.length,
        containerCount: validContainers.length,
        packageCount: grandTotalPackages,
        totalQty: grandTotalQty,
        itemsCount: allDistinctItems.size,
        refsCount: allDistinctRefs.size,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi đọc file: ${err?.message || 'Không thể phân tích dữ liệu bảng tính'}`,
    };
  }
}
