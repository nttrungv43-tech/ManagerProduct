// scripts/test-importFormat.mjs
// FEAT-16 — Unit test hàm thuần `src/utils/importFormat.js` (AC-FMT-01/02/03).
// Chạy bằng node, KHÔNG cần Expo.
import fs from 'node:fs';
import path from 'node:path';
import { findRealDataFile, warnMissingRealData } from './real-data-file.mjs';
import {
  detectFormat, detectFormatError, estimateImportCount, looksLikePackingV1,
  countValidSummaryRows, summaryArrayOf,
  FORMAT_ENTRIES, FORMAT_PACKING_LIST, FORMAT_PACKING_V1, FORMAT_UNKNOWN,
} from '../src/utils/importFormat.js';

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond) {
  if (cond) { pass += 1; return; }
  fail += 1;
  failures.push(name);
  console.error(`  ✗ ${name}`);
}
function eq(name, actual, expected) {
  check(name, actual === expected);
  if (actual !== expected) {
    console.error(`    thực tế: ${JSON.stringify(actual)}\n    mong đợi: ${JSON.stringify(expected)}`);
  }
}

const row = (ntk, qty) => ({ Column4: ntk, Column6: qty });

// ---------- 1. Hồi quy: 2 định dạng cũ phải nhận đúng ----------
console.log('1) Hồi quy — nhật ký sản xuất');
const entriesArr = [{ ntk: '107327GF', date: '2026-10-01', qty: 5 }];
eq('mảng entries', detectFormat(entriesArr), FORMAT_ENTRIES);
eq('đếm entries', estimateImportCount(entriesArr), 1);
eq('{entries: [...]}', detectFormat({ entries: entriesArr }), FORMAT_ENTRIES);
eq('đếm {entries}', estimateImportCount({ entries: entriesArr }), 1);
eq('không lỗi', detectFormatError({ entries: entriesArr }, 'a.json'), null);

console.log('2) Hồi quy — packing list phẳng');
const legacy = { '總表': [row('107327GF', 149), row('106160GF', 100)] };
eq('có 總表', detectFormat(legacy), FORMAT_PACKING_LIST);
eq('đếm 2 mã', estimateImportCount(legacy), 2);
eq('đếm MÃ DUY NHẤT, không phải số dòng', estimateImportCount({
  '總表': [row('A1', 5), row('A1', 7), row('A2', 1)],
}), 2);
eq('kiện trộn mã: 5 dòng → 3 mã', estimateImportCount({
  '總表': [row('A1', 5), row('A2', 3), row('A1', 1), row('B1', 2), row('A2', 4)],
}), 3);
eq('không lỗi', detectFormatError(legacy, 'PO23492.json'), null);
const legacyNoKey = { Sheet1: [row('A1', 1)] };
eq('mảng dòng không tên key', detectFormat(legacyNoKey), FORMAT_PACKING_LIST);
eq('đếm được', estimateImportCount(legacyNoKey), 1);
eq('summaryArrayOf tìm thấy', summaryArrayOf(legacyNoKey).length, 1);

// ---------- 2. File thật của dự án: định dạng MỚI (FEAT-17: đã được hỗ trợ) ----------

const real0 = findRealDataFile(import.meta.dirname);
const REAL = real0.path;
if (REAL && fs.existsSync(REAL)) {
  const real = JSON.parse(fs.readFileSync(REAL, 'utf8'));
  eq('nhận diện là packingListV1', detectFormat(real), FORMAT_PACKING_V1);
  check('looksLikePackingV1', looksLikePackingV1(real));
  // AC-NEW-01: app nhập thẳng được ⇒ KHÔNG còn chặn, số mã đếm được khớp số mã trong nguồn
  // (suy ra từ file, không ghim số của một bộ dữ liệu cụ thể).
  const srcNtk = new Set(
    real.batches.flatMap(b => b.shipments).flatMap(s => s.item_summary || []).map(r => r.item_code)
  );
  eq('đếm đúng số mã của nguồn', estimateImportCount(real), srcNtk.size);
  eq('không còn báo lỗi định dạng', detectFormatError(real, 'packing_data.json'), null);
  console.log(`    → nhận thẳng, không cần chạy npm run convert:packing (${srcNtk.size} mã)`);
} else {
  warnMissingRealData(real0);
}

// ---------- 3. AC-FMT-01: siết packingList ----------
console.log('4) AC-FMT-01 — siết nhận diện');
eq('mảng rỗng', detectFormat([]), FORMAT_UNKNOWN);
eq('mảng không có ntk/date', detectFormat([{ foo: 1 }]), FORMAT_UNKNOWN);
eq('null', detectFormat(null), FORMAT_UNKNOWN);
eq('undefined', detectFormat(undefined), FORMAT_UNKNOWN);
eq('chuỗi', detectFormat('abc'), FORMAT_UNKNOWN);
eq('số', detectFormat(42), FORMAT_UNKNOWN);
eq('object rỗng', detectFormat({}), FORMAT_UNKNOWN);
eq('mảng lồng nhau (không phải packing list)', detectFormat({ data: [[1, 2], [3]] }), FORMAT_UNKNOWN);
eq('object có mảng rỗng', detectFormat({ a: [] }), FORMAT_UNKNOWN);
check('báo lỗi cho unknown', detectFormatError({ a: [] }, 'x.json').includes('không được nhận diện'));
check('báo lỗi có nhắc 總表', detectFormatError({ a: [] }).includes('總表'));

console.log('5) Định dạng MỚI nhận diện qua nhiều hình dạng');
eq('batches', detectFormat({ schema_version: 1, batches: [] }), FORMAT_PACKING_V1);
eq('shipment_list', detectFormat({ shipment_list: [] }), FORMAT_PACKING_V1);
eq('chỉ schema_version', detectFormat({ schema_version: 2 }), FORMAT_PACKING_V1);
eq('entries thắng packingV1', detectFormat({ entries: entriesArr, batches: [] }), FORMAT_ENTRIES);
eq('packingV1 hợp lệ ⇒ không báo lỗi', detectFormatError({
  schema_version: 1,
  batches: [{ shipments: [{ item_summary: [{ item_code: 'A1', qty: 5 }] }] }],
}, 'x.json'), null);
check('packingV1 rỗng mã ⇒ báo lỗi', detectFormatError({ schema_version: 1, batches: [] }, 'x.json') !== null);
check('mọi mã trùng nhau chỉ đếm 1', estimateImportCount({
  schema_version: 1,
  batches: [{ shipments: [
    { item_summary: [{ item_code: 'A1', qty: 5 }, { item_code: 'A1', qty: 7 }] },
    { item_summary: [{ item_code: 'A1', qty: 1 }, { item_code: 'B2', qty: 2 }] },
  ] }],
}) === 2);

// ---------- 4. Bộ lọc dòng hợp lệ: phải KHỚP `importItemsFromJson` ----------
console.log('6) Bộ lọc dòng hợp lệ (khớp queries.js)');
eq('bỏ mã có dấu gạch', countValidSummaryRows([row('A-B', 5)]), 0);
eq('bỏ qty = 0', countValidSummaryRows([row('A1', 0)]), 0);
eq('bỏ qty âm', countValidSummaryRows([row('A1', -3)]), 0);
eq('bỏ qty chuỗi', countValidSummaryRows([{ Column4: 'A1', Column6: '5' }]), 0);
eq('bỏ qty thiếu', countValidSummaryRows([{ Column4: 'A1' }]), 0);
eq('bỏ dòng null', countValidSummaryRows([null, undefined, 5, 'x']), 0);
eq('chấp nhận hậu tố chữ', countValidSummaryRows([row('107327GF', 1)]), 1);
eq('không phải mảng', countValidSummaryRows(null), 0);
const zeroValid = { '總表': [row('A-B', 5), row('A1', 0)] };
eq('packingList mà 0 dòng hợp lệ', detectFormat(zeroValid), FORMAT_PACKING_LIST);
const zmsg = detectFormatError(zeroValid, 'x.json');
check('báo lỗi riêng cho 0 dòng hợp lệ', zmsg.includes('Column4') && zmsg.includes('Column6'));
check('0 dòng hợp lệ KHÔNG bị gọi là định dạng mới', !zmsg.includes('convert:packing'));

console.log(`\nKết quả: ${pass} passed, ${fail} failed`);
if (failures.length) console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);