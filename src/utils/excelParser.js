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
 * Chuẩn hóa mã PO / mã hàng / số hiệu: chuyển "2930.0" thành "2930".
 */
const cleanCode = v => {
  const s = cleanStr(v);
  if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
  return s;
};

/**
 * Chuẩn hóa mã PO: nếu bắt đầu bằng PO (ví dụ PO2600168) thì chuẩn hóa.
 */
const cleanPoCode = v => {
  const s = cleanCode(v);
  const m = s.match(/^PO\s*[-:#]?\s*(\d+)$/i);
  return m ? m[1] : s;
};

/**
 * Trích xuất PO từ tên Sheet hoặc tên File khi trong các dòng dữ liệu không có mã PO.
 */
export function detectPoFromSheetOrFile(sheetName, filename) {
  const cleanSheet = cleanStr(sheetName);
  const mPo = cleanSheet.match(/^PO\s*[-:#]?\s*([A-Za-z0-9_-]+)$/i);
  if (mPo) return mPo[1].trim();

  if (cleanSheet && !/^sheet\s*\d*$/i.test(cleanSheet) && !/^trang\s*tính\s*\d*$/i.test(cleanSheet)) {
    const mDigits = cleanSheet.match(/\b\d{6,}\b/);
    if (mDigits) return mDigits[0];
    return cleanSheet;
  }

  const baseFile = cleanStr(filename).replace(/\.[^/.]+$/, '').trim();
  const mFilePo = baseFile.match(/^PO\s*[-:#]?\s*([A-Za-z0-9_-]+)$/i);
  if (mFilePo) return mFilePo[1].trim();

  if (baseFile && !/^media_\d+_[a-f0-9]+$/i.test(baseFile) && !/^import\b/i.test(baseFile) && !/^file\b/i.test(baseFile)) {
    return baseFile;
  }
  return null;
}

/**
 * Phân tích các dòng dạng bảng (2D array) của biểu mẫu RE-CP4-16-S (Packing List).
 * @param {Array<Array<any>>} rows 
 * @param {object|string} options Hoặc sheetName trực tiếp
 * @returns {Array<object>} Danh sách container tìm được
 */
export function extractContainersFromRows(rows, options = {}) {
  const { sheetName = '', filename = '' } = typeof options === 'string' ? { sheetName: options } : options;
  const fallbackPo = detectPoFromSheetOrFile(sheetName, filename);
  const containers = [];
  let curContainer = null;
  let lastDetectedPo = fallbackPo;
  let lastDetectedCNo = null;
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

    // 1. Nhận diện Container No ở header (ví dụ: "Container No.,,MCCU1134870")
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
        po_no: lastDetectedPo,
        c_no: lastDetectedCNo,
        packages: [],
      };
      inData = false;
      continue;
    }

    // 2. Nhận diện dòng "From ... To ... [PO]" (ví dụ: "From VIET NAM To 2600168" hoặc "To 2930.0")
    const toIndex = row.findIndex(c => cleanStr(c).toLowerCase() === 'to');
    if (toIndex !== -1) {
      for (let j = toIndex + 1; j < row.length; j++) {
        const val = cleanCode(row[j]);
        if (val && !val.includes('-') && /^(?:PO\s*[-:#]?\s*)?[0-9A-Za-z_]+$/i.test(val)) {
          lastDetectedPo = cleanPoCode(val);
          if (curContainer && !curContainer.po_no) {
            curContainer.po_no = lastDetectedPo;
          }
          break;
        }
      }
    }

    // 3. Nhận diện "C/No., 1-18"
    const cNoIdx = row.findIndex(c => cleanStr(c).includes('C/No'));
    if (cNoIdx !== -1) {
      for (let j = cNoIdx + 1; j < row.length; j++) {
        const val = cleanStr(row[j]);
        if (val) {
          lastDetectedCNo = val;
          if (curContainer && !curContainer.c_no) {
            curContainer.c_no = val;
          }
          break;
        }
      }
    }

    // 4. Nhận diện thông tin Seal và Pallet / Container:
    // ví dụ "MCCU1134870/ VN22588AT / Pallet 1-18" hoặc "Container 1/ Seal  No. / Pallet 1-10"
    const isPalletLine = /pallet|c\/no/i.test(rowStr) && /(?:\/|\bcontainer\b|[A-Z]{4}\d{7})/i.test(rowStr);
    if (isPalletLine) {
      const cMatch = rowStr.match(/([A-Z]{4}\d{7}|Container\s*\d+)/i);
      const pMatch = rowStr.match(/(?:Pallet|C\/No\.?)\s*([\d\s-]+)/i);
      const cName = cMatch ? cMatch[1].trim() : (curContainer?.container_no || 'Container 1');
      const pRange = pMatch ? pMatch[1].trim() : null;

      let sealNo = null;
      if (rowStr.includes('/')) {
        const parts = rowStr.split('/').map(s => s.trim());
        if (parts.length >= 3) {
          const mid = parts[1].replace(/^seal\s*(no\.?)?\s*[:\-]?\s*/i, '').trim();
          if (mid && !/^seal(\s*no\.?)?$/i.test(mid) && /^[A-Z0-9_-]+$/i.test(mid)) {
            sealNo = mid;
          }
        }
      }

      if (curContainer && curContainer.packages.length > 0) {
        containers.push(curContainer);
        curContainer = null;
      }

      if (!curContainer) {
        curContainer = {
          container_no: cName,
          container_label: cName,
          seal_no: sealNo,
          po_no: lastDetectedPo,
          c_no: pRange || lastDetectedCNo,
          packages: [],
        };
      } else {
        curContainer.container_no = cName;
        curContainer.container_label = cName;
        if (sealNo) curContainer.seal_no = sealNo;
        if (pRange && !curContainer.c_no) curContainer.c_no = pRange;
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
      const ntkVal = cleanCode(row[colIdx.ntk]);
      const qtyVal = cleanNum(row[colIdx.qty]);
      const noVal = cleanNum(row[colIdx.no]);
      const poVal = cleanCode(row[colIdx.po]);
      const rowPo = (poVal && /^(?:PO\s*[-:#]?\s*)?[0-9A-Za-z_-]+$/i.test(poVal) && !/^(?:package|no\.?|ntk|đóng gói)$/i.test(poVal))
        ? cleanPoCode(poVal)
        : (curContainer.po_no || lastDetectedPo);

      if (ntkVal && qtyVal > 0) {
        const refVal = cleanCode(row[colIdx.ref]);
        const nwVal = cleanNum(row[colIdx.nw]);
        const gwVal = cleanNum(row[colIdx.gw]);
        const cbmVal = cleanNum(row[colIdx.cbm]);

        if (noVal > 0) {
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
        } else if (curContainer.packages.length > 0) {
          // Dòng bổ sung của kiện mix (cột No. để trống)
          const lastPkg = curContainer.packages[curContainer.packages.length - 1];
          lastPkg.is_mixed = true;
          lastPkg.item_count += 1;
          lastPkg.total_qty += qtyVal;
          lastPkg.nw_kg += nwVal;
          lastPkg.gw_kg += gwVal;
          lastPkg.volume_cbm = Math.round((lastPkg.volume_cbm + cbmVal) * 1000) / 1000;
          lastPkg.items.push({
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

    // Nếu workbook có các sheet chi tiết 'PO...' (ví dụ: PO2919, PO2920...) thì ưu tiên đọc các sheet đó,
    // tránh trùng lặp dữ liệu với sheet tổng hợp (như 'DMAC').
    const poSheetNames = workbook.SheetNames.filter(s => /^PO\s*\d+/i.test(s));
    const sheetsToProcess = poSheetNames.length > 1 ? poSheetNames : workbook.SheetNames;

    // Quét qua các sheet được chọn trong file
    for (const sheetName of sheetsToProcess) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows && rows.length > 0) {
        const found = extractContainersFromRows(rows, { sheetName, filename });
        allContainers.push(...found);
      }
    }

    if (allContainers.length === 0) {
      return {
        ok: false,
        error: 'Không tìm thấy dữ liệu container theo biểu mẫu RE-CP4-16-S trong file này.',
      };
    }

    // Nhóm kiện theo PO và theo Container:
    // Hỗ trợ trường hợp 1 container chứa kiện của nhiều PO khác nhau
    const poMap = new Map();
    const allDistinctItems = new Set();
    const allDistinctRefs = new Set();
    let grandTotalQty = 0;
    let grandTotalPackages = 0;
    const uniqueContainerNames = new Set();

    for (const cont of allContainers) {
      uniqueContainerNames.add(cont.container_no);
      grandTotalPackages += cont.packages.length;

      for (const pkg of cont.packages) {
        const po = pkg.po_no || cont.po_no || 'PO_CHUNG';
        if (!poMap.has(po)) {
          poMap.set(po, {
            po_no: po,
            mark: 'DMAC',
            containerMap: new Map(),
          });
        }

        const poEntry = poMap.get(po);
        if (!poEntry.containerMap.has(cont.container_no)) {
          poEntry.containerMap.set(cont.container_no, {
            container_no: cont.container_no,
            container_label: cont.container_label,
            seal_no: cont.seal_no,
            c_no: cont.c_no,
            packages: [],
          });
        }

        poEntry.containerMap.get(cont.container_no).packages.push(pkg);
      }
    }

    const shipments = [];
    const shipmentList = [];

    for (const [po, data] of poMap.entries()) {
      const containers = Array.from(data.containerMap.values());
      const itemMap = new Map();
      let totalQty = 0;
      let totalNw = 0;
      let totalGw = 0;
      let totalCbm = 0;
      let totalPkgs = 0;

      for (const cont of containers) {
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

      const item_summary = Array.from(itemMap.values());

      shipments.push({
        id: `shipment:${po}`,
        po_no: po,
        mark: 'DMAC',
        containers,
        item_summary,
      });

      shipmentList.push({
        id: `shipment:${po}`,
        po_no: po,
        mark: 'DMAC',
        totals: {
          containers: containers.length,
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
        containerCount: uniqueContainerNames.size,
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
