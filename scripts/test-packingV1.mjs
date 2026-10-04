// scripts/test-packingV1.mjs
// FEAT-16 — Unit test hàm thuần `src/utils/packingV1.js`.
// Chạy bằng node, KHÔNG cần Expo (SPEC-test.md §11.2).
//
// Vì sao test kỹ: file converter sinh ra được nạp thẳng vào DB. Sai số kiện / sai `target`
// ⇒ dữ liệu sai trong app, mà phía import legacy **không** có validator nào ngoài regex mã.
// Bài học từ E2E: gộp 22 file (1 file/shipment) làm Σ target tụt 17.935/51.568 ⇒ phải gộp
// MỘT file; test bên dưới khoá lại đúng hành vi đó.
import fs from 'node:fs';
import path from 'node:path';
import { findRealDataFile, warnMissingRealData } from './real-data-file.mjs';
import {
  convertPackingDataV1,
  convertShipment,
  collectShipments,
  verifyAgainstShipmentList,
  toPositiveInt,
  toPoNumber,
  palletRangeLabel,
  singlePalletLabel,
  LEGACY_SUMMARY_KEY,
  NTK_RE,
} from '../src/utils/packingV1.js';

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
function hasCode(name, problems, code) {
  check(name, Array.isArray(problems) && problems.includes(code));
}

// ---------- Helper dựng dữ liệu (mô phỏng đúng cấu trúc packing_data.json) ----------
function pkg(package_no, items, extra = {}) {
  return { package_no, items, total_qty: items.reduce((s, i) => s + i.qty, 0), ...extra };
}
function container(container_no, from, packages) {
  return { container_no, pallet_range: { from, to: from + packages.length - 1 }, packages };
}
function shipment(po_no, containers, extra = {}) {
  const packages = containers.flatMap(c => c.packages || []);
  return {
    po_no,
    containers,
    totals: {
      containers: containers.length,
      packages: packages.length,
      qty: packages.reduce((s, p) => s + (p.total_qty || 0), 0),
    },
    ok: true,
    ...extra,
  };
}
function doc(shipments) {
  return { schema_version: 1, batches: [{ id: 'b1', shipments }], shipment_list: shipments, warnings: [] };
}
function rowsOf(res) { return res.file.json[LEGACY_SUMMARY_KEY]; }
function containerKeys(res) { return Object.keys(res.file.json).filter(k => k !== LEGACY_SUMMARY_KEY); }

// ---------- 1. Helper thuần ----------
console.log('1) Helper: nhãn dải kiện / ép số / ép PO');
eq('nhãn dải kiện', palletRangeLabel(1, 18), 'Pallet 1-18');
eq('nhãn 1 kiện', singlePalletLabel(7), 'Pallet 7-7');
eq('số nguyên dương', toPositiveInt('12'), 12);
eq('số thực bị cắt', toPositiveInt(3.7), 3);
eq('chuỗi rác', toPositiveInt('abc'), null);
eq('0', toPositiveInt(0), null);
eq('null', toPositiveInt(null), null);
eq('số âm', toPositiveInt(-5), null);
eq('PO dạng số', toPoNumber('23522'), 23522);
eq('PO số nguyên', toPoNumber(2919), 2919);
eq('PO nhiều số PO không ép được', toPoNumber('2919-2930'), null);
eq('PO rỗng', toPoNumber(''), null);
eq('PO null', toPoNumber(null), null);
check('regex chấp nhận mã có hậu tố GF', NTK_RE.test('107327GF'));
check('regex chặn dấu gạch', !NTK_RE.test('107-327'));
check('regex chặn khoảng trắng', !NTK_RE.test('107 327'));

// ---------- 2. collectShipments ----------
console.log('2) collectShipments — đọc được cả 2 cấu trúc');
eq('từ batches[].shipments', collectShipments(doc([shipment('1', [])])).length, 1);
eq('từ shipment_list phẳng', collectShipments({ shipment_list: [{ po_no: '1' }] }).length, 1);
eq('rỗng khi không có gì', collectShipments({}).length, 0);
eq('null an toàn', collectShipments(null).length, 0);
eq('shipment rác bị bỏ qua', collectShipments({ shipment_list: [null, 5, { po_no: '1' }] }).length, 1);

// ---------- 3. Quy đổi cơ bản + đánh số kiện toàn cục ----------
console.log('3) Quy đổi cơ bản — đánh số kiện TOÀN CỤC');
const basic = convertPackingDataV1(doc([
  shipment('23522', [
    container('HFMU2620027', 1, [pkg(1, [{ item_code: '1069050GF', qty: 149 }])]),
    container('HFMU2620028', 1, [pkg(1, [{ item_code: '106160GF', qty: 100 }])]),
  ]),
]));
check('ok', basic.ok === true);
eq('1 file đầu ra (GỘP)', basic.file.fileName, 'packing_legacy.json');
eq('2 container', basic.stats.containers, 2);
eq('2 kiện', basic.stats.pallets, 2);
eq('2 mã', basic.stats.items, 2);
eq('tổng qty 249', basic.stats.qty, 249);
const rows1 = rowsOf(basic);
eq('số dòng 總表', rows1.length, 2);
eq('kiện 1: Column2 = 1', rows1[0].Column2, 1);
eq('kiện 2: Column2 = 2 (KHÔNG phải 1)', rows1[1].Column2, 2);
eq('kiện 2: Column4', rows1[1].Column4, '106160GF');
eq('kiện 2: Column6', rows1[1].Column6, 100);
eq('Container1 dải 1-1', basic.file.json.HFMU2620027[0].Column1, 'Pallet 1-1');
eq('Container2 dải 2-2 (KHÔNG 1-1)', basic.file.json.HFMU2620028[0].Column1, 'Pallet 2-2');
eq('Column10 là number', typeof rows1[0].Column10, 'number');
eq('Column10 = PO', rows1[0].Column10, 23522);
eq('key container = container_no', containerKeys(basic).join(','), 'HFMU2620027,HFMU2620028');

// ---------- 4. Gộp nhiều shipment: target CỘNG DỒN, kiện nối tiếp ----------
console.log('4) Gộp nhiều shipment — mục tiêu chính của FEAT-16');
const merged = convertPackingDataV1(doc([
  shipment('111', [container('A', 1, [
    pkg(1, [{ item_code: 'X1', qty: 10 }]),
    pkg(2, [{ item_code: 'X2', qty: 20 }]),
  ])]),
  shipment('222', [container('B', 1, [pkg(1, [{ item_code: 'X1', qty: 30 }])])]),
]));
check('ok', merged.ok === true);
eq('vẫn chỉ 1 file', merged.file.fileName, 'packing_legacy.json');
eq('3 container', merged.stats.containers, 2);
eq('3 kiện', merged.stats.pallets, 3);
eq('2 mã', merged.stats.items, 2);
const x1 = merged.items.find(i => i.ntk === 'X1');
eq('target X1 = 10 + 30 = 40 (CỘNG DỒN)', x1.target, 40);
eq('X1 thuộc 2 PO', x1.pos.join('+'), '111+222');
eq('X2 chỉ 1 PO', merged.items.find(i => i.ntk === 'X2').pos.join('+'), '111');
// app đọc 1 PO cho mọi mã ⇒ PO đại diện = PO đóng góp nhiều nhất (111: 30 vs 222: 30 → 111)
eq('PO đại diện (qty lớn nhất)', merged.stats.dominantPo, '111');
check('mọi dòng dùng cùng Column10', rowsOf(merged).every(r => r.Column10 === 111));
eq('kiện nối tiếp 1,2,3', [...new Set(rowsOf(merged).map(r => r.Column2))].sort((a, b) => a - b).join(','), '1,2,3');
eq('Container B dải 3-3', merged.file.json.B[0].Column1, 'Pallet 3-3');

// ---------- 5. Kiện trộn nhiều mã ----------
console.log('5) Kiện trộn nhiều mã (is_mixed)');
const mixedRes = convertPackingDataV1(doc([
  shipment('333', [container('A', 1, [
    pkg(1, [{ item_code: 'M1', qty: 50 }, { item_code: 'M2', qty: 30 }], { is_mixed: true }),
    pkg(2, [{ item_code: 'M1', qty: 20 }]),
  ])]),
]));
const rows5 = rowsOf(mixedRes);
eq('3 dòng 總表 (2 mã ở kiện 1 + 1 mã ở kiện 2)', rows5.length, 3);
eq('kiện 1 sinh 2 dòng cùng Column2', rows5[0].Column2 === rows5[1].Column2, true);
eq('kiện 2 dòng riêng', rows5[2].Column2, 2);
eq('target M1 = 70', mixedRes.items.find(i => i.ntk === 'M1').target, 70);
eq('target M2 = 30', mixedRes.items.find(i => i.ntk === 'M2').target, 30);
eq('tổng qty 100', mixedRes.stats.qty, 100);

// ---------- 6. Problem chặn ----------
console.log('6) Problem chặn');
hasCode('PO không ép được', convertShipment(shipment('2919-2930', [container('A', 1, [pkg(1, [{ item_code: 'X1', qty: 1 }])])]), { startPalletNo: 1 }).problems, 'PO_NOT_NUMERIC');
hasCode('mã sai regex', convertShipment(shipment('1', [container('A', 1, [pkg(1, [{ item_code: 'A-B', qty: 1 }])])]), { startPalletNo: 1 }).problems, 'INVALID_NTK');
hasCode('package rỗng', convertShipment(shipment('1', [container('A', 1, [pkg(1, [])])]), { startPalletNo: 1 }).problems, 'EMPTY_PACKAGE');
hasCode('qty <= 0', convertShipment(shipment('1', [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 0 }])])]), { startPalletNo: 1 }).problems, 'EMPTY_PACKAGE');
hasCode('dải pallet lệch', convertShipment(shipment('1', [{ container_no: 'A', pallet_range: { from: 1, to: 5 }, packages: [pkg(1, [{ item_code: 'A1', qty: 1 }]), pkg(2, [{ item_code: 'A2', qty: 1 }])] }]), { startPalletNo: 1 }).problems, 'PALLET_RANGE_MISMATCH');
hasCode('thiếu pallet_range', convertShipment(shipment('1', [{ container_no: 'A', packages: [pkg(1, [{ item_code: 'A1', qty: 1 }])] }]), { startPalletNo: 1 }).problems, 'PALLET_RANGE_MISMATCH');
hasCode('package_no trùng', convertShipment(shipment('1', [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 1 }]), pkg(1, [{ item_code: 'A2', qty: 1 }])])]), { startPalletNo: 1 }).problems, 'PKG_NO_INVALID');
hasCode('package_no không tăng', convertShipment(shipment('1', [container('A', 1, [pkg(2, [{ item_code: 'A1', qty: 1 }]), pkg(1, [{ item_code: 'A2', qty: 1 }])])]), { startPalletNo: 1 }).problems, 'PKG_NO_INVALID');
hasCode('items qty lệch total_qty', convertShipment(shipment('1', [container('A', 1, [{ package_no: 1, total_qty: 99, items: [{ item_code: 'A1', qty: 5 }] }])]), { startPalletNo: 1 }).problems, 'PACKAGE_QTY_MISMATCH');
hasCode('qty khai báo lệch', convertShipment({ po_no: '1', containers: [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 5 }])])], totals: { containers: 1, packages: 1, qty: 99 }, ok: true }, { startPalletNo: 1 }).problems, 'QTY_MISMATCH');
hasCode('số container lệch', convertShipment({ po_no: '1', containers: [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 1 }])])], totals: { containers: 3, packages: 1, qty: 1 }, ok: true }, { startPalletNo: 1 }).problems, 'CONT_COUNT_MISMATCH');
hasCode('số package lệch', convertShipment({ po_no: '1', containers: [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 1 }])])], totals: { containers: 1, packages: 7, qty: 1 }, ok: true }, { startPalletNo: 1 }).problems, 'PKG_COUNT_MISMATCH');

// ---------- 7. all-or-nothing ----------
console.log('7) convertPackingDataV1 — all-or-nothing (AC-CONV-07/10)');
const badRes = convertPackingDataV1(doc([
  shipment('111', [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 10 }])])]),
  shipment('222', [container('B', 1, [pkg(1, [{ item_code: 'B-1', qty: 10 }])])]),
]));
check('ok=false', badRes.ok === false);
check('blocking=true', badRes.blocking === true);
eq('file = null (KHÔNG ghi gì)', badRes.file, null);
eq('items rỗng', badRes.items.length, 0);
check('có problem', badRes.problems.length >= 1);
eq('problem gắn đúng PO', badRes.problems[0].po, '222');
check('báo INVALID_NTK', badRes.problems.some(p => p.code === 'INVALID_NTK'));
const emptyRes = convertPackingDataV1({ schema_version: 1 });
check('file không có shipment ⇒ ok=false', emptyRes.ok === false);
hasCode('mã NO_SHIPMENTS', emptyRes.problems.map(p => p.code), 'NO_SHIPMENTS');

// ---------- 8. needsReview ----------
console.log('8) needsReview — ok=false / warnings của nguồn');
const rWarn = convertPackingDataV1(doc([
  shipment('444', [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 1 }])])], { ok: false }),
]));
check('vẫn tạo file', rWarn.ok === true);
eq('1 shipment needsReview', rWarn.needsReview.length, 1);
check('có cảnh báo', rWarn.needsReview[0].warnings.length > 0);
eq('shipment sạch không needsReview',
  convertPackingDataV1(doc([shipment('555', [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 1 }])])])])).needsReview.length, 0);
const rShipW = convertPackingDataV1(doc([
  shipment('666', [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 1 }])]), container('B', 1, [pkg(1, [{ item_code: 'B1', qty: 1 }])])],
    { ok: false, warnings: ['Tổng G.W lệch: 18343 vs 17097'] }),
]));
check('warnings của shipment được mang sang', rShipW.needsReview[0].warnings.some(w => w.includes('G.W lệch')));

// ---------- 9. Đối chiếu ----------
console.log('9) verifyAgainstShipmentList');
const docV = doc([
  shipment('111', [container('A', 1, [pkg(1, [{ item_code: 'A1', qty: 10 }])]), container('B', 1, [pkg(1, [{ item_code: 'A2', qty: 20 }])])]),
  shipment('222', [container('C', 1, [pkg(1, [{ item_code: 'A1', qty: 5 }])])]),
]);
const convV = convertPackingDataV1(docV);
const verV = verifyAgainstShipmentList(docV, convV.stats);
check('đối chiếu khớp', verV.matched);
eq('shipments kỳ vọng', verV.expected.shipments, 2);
eq('containers kỳ vọng', verV.expected.containers, 3);
eq('pallets kỳ vọng', verV.expected.pallets, 3);
eq('qty kỳ vọng', verV.expected.qty, 35);
const verBad = verifyAgainstShipmentList(docV, { ...convV.stats, qty: 999 });
check('phát hiện lệch', verBad.matched === false);
check('ghi chú lệch', verBad.notes.length === 1);
check('shipment_list thiếu ⇒ expected 0', verifyAgainstShipmentList({}, { shipments: 0, containers: 0, pallets: 0, qty: 0 }).matched);

// ---------- 10. Hồi quy: file đầu ra phải parse được đúng logic app ----------
console.log('10) Hồi quy — mô phỏng đúng 2 hàm của app');
const legacy = mixedRes.file.json;
// -- importItemsFromJson: gom theo Column4, cộng Column6, lấy Column10 dòng đầu --
const appItems = new Map();
let appPo = null;
for (const row of legacy[LEGACY_SUMMARY_KEY]) {
  if (!NTK_RE.test(row.Column4) || typeof row.Column6 !== 'number' || row.Column6 <= 0) continue;
  appItems.set(row.Column4, (appItems.get(row.Column4) || 0) + row.Column6);
  if (typeof row.Column10 === 'number' && appPo === null) appPo = String(row.Column10);
}
eq('app đọc 2 mã', appItems.size, 2);
eq('app tính target M1 = 70', appItems.get('M1'), 70);
eq('app lấy PO dòng đầu = 333', appPo, '333');
// -- parsePackingListContainers: palletItems theo Column2, duyệt dải `Pallet a-b` --
const palletItems = {};
for (const row of legacy[LEGACY_SUMMARY_KEY]) {
  if (!palletItems[row.Column2]) palletItems[row.Column2] = [];
  palletItems[row.Column2].push({ ntk: row.Column4, qty: row.Column6 });
}
const appContainers = [];
for (const key of containerKeys(mixedRes)) {
  const m = String(legacy[key][0].Column1).match(/Pallet\s+(\d+)-(\d+)/);
  check(`app đọc được dải kiện của ${key}`, !!m);
  const from = Number(m[1]); const to = Number(m[2]);
  const pallets = [];
  for (let p = from; p <= to; p++) if (palletItems[p]?.length) pallets.push({ no: p, items: palletItems[p] });
  appContainers.push({ id: key, pallets });
}
eq('app dựng 1 container', appContainers.length, 1);
eq('app dựng 2 kiện', appContainers[0].pallets.length, 2);
eq('kiện 1 nhiều mã (2 item)', appContainers[0].pallets[0].items.length, 2);
eq('kiện 2 một mã', appContainers[0].pallets[1].items.length, 1);
eq('mọi mã trong container đều có trong items', [...new Set(appContainers.flatMap(c => c.pallets.flatMap(p => p.items.map(i => i.ntk))))].every(n => appItems.has(n)), true);

// ---------- 11. File thật của dự án ----------

const real0 = findRealDataFile(import.meta.dirname);
const REAL = real0.path;
if (REAL && fs.existsSync(REAL)) {
  const real = JSON.parse(fs.readFileSync(REAL, 'utf8'));
  const conv = convertPackingDataV1(real);
  const ver = verifyAgainstShipmentList(real, conv.stats);
  console.log(`    ${conv.stats.shipments} shipment | ${conv.stats.containers} container | ${conv.stats.pallets} kiện`
    + ` | ${conv.stats.items} mã | ${conv.stats.qty.toLocaleString('vi-VN')} pcs | PO đại diện ${conv.stats.dominantPo}`);
  console.log(`    đối chiếu shipment_list: ${ver.matched ? 'khớp ✅' : ver.notes.join('; ')}`);
  check('file thật: không problem chặn', conv.ok === true);
  check('file thật: đối chiếu khớp', ver.matched === true);
  // Số lượng suy ra từ chính file nguồn — không ghim số của một bộ dữ liệu cụ thể, vì file
  // nguồn được thay nhiều lần (xem `scripts/real-data-file.mjs`). Cái cần kiểm là converter
  // khớp 100% với dữ liệu nguồn.
  const srcShipments = real.batches.flatMap(b => b.shipments);
  const srcContainers = srcShipments.flatMap(s => s.containers || []);
  const srcPackages = srcContainers.flatMap(c => c.packages || []);
  const srcQty = srcShipments.reduce((sum, s) => sum + (Number(s.totals?.qty) || 0), 0);
  check('file thật: đủ shipment', conv.stats.shipments === srcShipments.length);
  check('file thật: đủ container', conv.stats.containers === srcContainers.length);
  check('file thật: đủ kiện', conv.stats.pallets === srcPackages.length);
  eq('file thật: tổng qty khớp nguồn', conv.stats.qty, srcQty);
  check('file thật: đủ mã', conv.stats.items === new Set(srcPackages.flatMap(p => p.items || []).map(i => i.item_code)).size);

  const rRows = conv.file.json[LEGACY_SUMMARY_KEY];
  const nos = [...new Set(rRows.map(x => x.Column2))].sort((a, b) => a - b);
  const totalPallets = conv.stats.pallets;
  check(`số kiện liên tục 1..${totalPallets}`,
    nos.length === totalPallets && nos[0] === 1 && nos[nos.length - 1] === totalPallets);
  check('mọi Column10 là number', rRows.every(x => typeof x.Column10 === 'number'));
  check('mọi Column4 khớp regex', rRows.every(x => NTK_RE.test(x.Column4)));
  check('mọi Column6 là số dương', rRows.every(x => typeof x.Column6 === 'number' && x.Column6 > 0));

  // Dải `Pallet a-b` của mọi container phải phủ đúng toàn bộ kiện, không đè nhau.
  const blocks = containerKeys(conv).map(k => conv.file.json[k][0].Column1.match(/Pallet (\d+)-(\d+)/).slice(1).map(Number));
  let covered = 0;
  let overlap = false;
  const used = new Set();
  for (const [from, to] of blocks) {
    covered += to - from + 1;
    for (let p = from; p <= to; p++) {
      if (used.has(p)) overlap = true;
      used.add(p);
    }
  }
  eq(`tổng kiện theo dải = ${totalPallets}`, covered, totalPallets);
  check('các dải kiện không chồng lấn', !overlap);
  check('mọi kiện trong 總表 đều được dải phủ', [...new Set(rRows.map(x => x.Column2))].every(p => used.has(p)));

  // target tích luỹ theo mã = tổng qty nguồn (đo lại bằng cách app cộng dồn)
  const appSum = new Map();
  for (const row of rRows) appSum.set(row.Column4, (appSum.get(row.Column4) || 0) + row.Column6);
  eq('app cộng dồn ra đúng tổng nguồn', [...appSum.values()].reduce((a, b) => a + b, 0), srcQty);
  check('khớp items[] của converter',
    conv.items.every(i => appSum.get(i.ntk) === i.target));
  check('mọi mã có ít nhất 1 PO', conv.items.every(i => i.pos.length >= 1));
} else {
  warnMissingRealData(real0);
}

console.log(`\nKết quả: ${pass} passed, ${fail} failed`);
if (failures.length) console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);