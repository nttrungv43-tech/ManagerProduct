// src/utils/importFormat.js
// FEAT-16 + FEAT-17 — Nhận diện + đếm trước khi import JSON. Hàm thuần, không React Native, không fs
// ⇒ test được bằng `node` (scripts/test-importFormat.mjs).
//
// Vì sao phải tách ra khỏi component (AC-FMT-02): `detectFormat` cũ rất "rộng" — file định dạng
// MỚI (`schema_version: 1`, lồng 4 tầng) cũng có mảng ở top-level nên bị nhận nhầm là
// `packingList`, rồi `queries.js` ném *"Không tìm thấy mã hàng nào trong file JSON."* —
// người dùng không hiểu vì sao. Đo thật trên `src/data/packing_data.json`:
//   `importItemsFromJson` nhầm `shipment_list` là bảng `總表` ⇒ 22 dòng, 0 dòng có `Column4` ⇒ lỗi.
//
// **FEAT-17 (2026-10-04):** app đã nhập thẳng được định dạng mới (`queries.importPackingV1`), nên
// `packingListV1` là định dạng **được hỗ trợ** — không còn chặn, không còn cần `npm run convert:packing`.

export const SUMMARY_KEY = '總表';
export const LEGACY_ROW_KEYS = ['Column4', 'Column6'];
export const PACKING_V1_KEYS = ['batches', 'shipment_list'];

/** Mã hàng hợp lệ — khớp regex ở `queries.js` và `utils/packingV1.js`. */
export const NTK_RE = /^[0-9A-Za-z]+$/;

export const FORMAT_ENTRIES = 'entries';
export const FORMAT_PACKING_LIST = 'packingList';
export const FORMAT_PACKING_V1 = 'packingListV1';
export const FORMAT_BACKUP = 'backup';
export const FORMAT_UNKNOWN = 'unknown';

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Mảng dòng phẳng kiểu legacy: phần tử có `Column4` (mã) và `Column6` (số lượng). */
function findSummaryArray(data) {
  if (isPlainObject(data) && Array.isArray(data[SUMMARY_KEY])) return data[SUMMARY_KEY];
  if (!isPlainObject(data)) return null;
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (Array.isArray(value) && value.some(r => isPlainObject(r) && typeof r.Column4 === 'string')) {
      return value;
    }
  }
  return null;
}

/** File `schema_version: 1` của tool ngoài. **FEAT-17:** app nhập thẳng được (không cần converter). */
export function looksLikePackingV1(parsed) {
  if (!isPlainObject(parsed)) return false;
  if (parsed.format === 'production_tracker_backup') return false;
  if (PACKING_V1_KEYS.some(k => Array.isArray(parsed[k]))) return true;
  return typeof parsed.schema_version === 'number';
}

/**
 * AC-FMT-01: siết nhận diện — `packingList` **chỉ** khi có `總表` hoặc dòng `Column4`.
 * Trước đây "có mảng bất kỳ" ⇒ `packingList`, khiến file mới lọt vào nhánh sai.
 */
export function detectFormat(parsed) {
  if (Array.isArray(parsed)) {
    const sample = parsed.find(e => isPlainObject(e));
    return sample && sample.ntk && sample.date ? FORMAT_ENTRIES : FORMAT_UNKNOWN;
  }
  if (isPlainObject(parsed)) {
    if (parsed.format === 'production_tracker_backup' || (parsed.schema_version && parsed.data?.order_batches)) {
      return FORMAT_BACKUP;
    }
    if (Array.isArray(parsed.entries)) return FORMAT_ENTRIES;
    if (looksLikePackingV1(parsed)) return FORMAT_PACKING_V1;
    if (findSummaryArray(parsed)) return FORMAT_PACKING_LIST;
  }
  return FORMAT_UNKNOWN;
}

/** Số dòng hợp lệ theo **đúng** bộ lọc của `importItemsFromJson` (`/^[0-9A-Za-z]+$/`, `Column6 > 0`). */
export function countValidSummaryRows(summary) {
  if (!Array.isArray(summary)) return 0;
  return summary.filter(r => isPlainObject(r)
    && typeof r.Column4 === 'string'
    && /^[0-9A-Za-z]+$/.test(r.Column4)
    && typeof r.Column6 === 'number'
    && r.Column6 > 0).length;
}

export function summaryArrayOf(parsed) {
  if (Array.isArray(parsed)) return null;
  return findSummaryArray(parsed);
}

/** Số mã **duy nhất** trong `batches[].shipments[].item_summary[]` (định dạng `packing_v1`). */
export function countPackingV1Items(parsed) {
  const batches = Array.isArray(parsed?.batches) ? parsed.batches : [];
  const shipments = [];
  for (const b of batches) if (Array.isArray(b?.shipments)) shipments.push(...b.shipments);
  if (shipments.length === 0 && Array.isArray(parsed?.shipment_list)) shipments.push(...parsed.shipment_list);
  const ntkSet = new Set();
  for (const s of shipments) {
    for (const row of Array.isArray(s?.item_summary) ? s.item_summary : []) {
      if (isPlainObject(row) && typeof row.item_code === 'string' && NTK_RE.test(row.item_code)
          && typeof row.qty === 'number' && row.qty > 0) {
        ntkSet.add(row.item_code);
      }
    }
  }
  return ntkSet.size;
}

/** Số mã **duy nhất** sẽ ghi vào DB — khớp đúng `res.imported` của `importItemsFromJson`.
 *  Đếm *số dòng* sẽ báo sai (kiện trộn mã sinh nhiều dòng cho cùng một mã). */
export function estimateImportCount(parsed) {
  const fmt = detectFormat(parsed);
  if (fmt === FORMAT_ENTRIES) {
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    return Array.isArray(entries) ? entries.length : 0;
  }
  if (fmt === FORMAT_PACKING_V1) return countPackingV1Items(parsed);
  if (fmt === FORMAT_PACKING_LIST) {
    const summary = summaryArrayOf(parsed);
    if (!Array.isArray(summary)) return 0;
    const ntkSet = new Set();
    for (const r of summary) {
      if (isPlainObject(r)
        && typeof r.Column4 === 'string'
        && NTK_RE.test(r.Column4)
        && typeof r.Column6 === 'number'
        && r.Column6 > 0) {
        ntkSet.add(r.Column4);
      }
    }
    return ntkSet.size;
  }
  return 0;
}

/** Chuỗi trong `Alert` — tiếng Việt (INV-U2). `null` ⇒ không có vấn đề gì. */
export function detectFormatError(parsed, fileName) {
  const fmt = detectFormat(parsed);
  const name = fileName ? `"${fileName}"` : 'file này';
  if (fmt === FORMAT_BACKUP) {
    return `${name} là file sao lưu toàn bộ dữ liệu ứng dụng.\n`
      + 'Vui lòng sang tab "Lịch sử" và sử dụng chức năng "Phục hồi JSON" để khôi phục cơ sở dữ liệu.';
  }
  if (fmt === FORMAT_UNKNOWN) {
    return 'File JSON không được nhận diện.\n'
      + 'Cần có mảng `entries` (nhật ký sản xuất) hoặc dữ liệu packing list (cot 總表 / Column4).';
  }
  if (fmt === FORMAT_PACKING_V1 && estimateImportCount(parsed) === 0) {
    return `${name} có vẻ là packing list định dạng mới nhưng không tìm thấy mã hàng nào.\n`
      + 'Cần có batches[].shipments[].item_summary[] với item_code và qty > 0.';
  }
  if (fmt === FORMAT_PACKING_LIST && estimateImportCount(parsed) === 0) {
    return `${name} có bảng 總表 nhưng không có dòng nào hợp lệ.\n`
      + 'Mỗi dòng cần có "Column4" (mã chữ/số) và "Column6" (số lượng > 0).';
  }
  return null;
}
