// scripts/test-excelParser.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseExcelOrCsv } from '../src/utils/excelParser.js';
import { buildImportPlanV2 } from '../src/utils/packingV2Import.js';

let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${name}`);
}

function eq(name, actual, expected) {
  check(name, actual === expected);
  if (actual !== expected) console.error(`    thực tế: ${JSON.stringify(actual)}\n    mong đợi: ${JSON.stringify(expected)}`);
}

console.log('--- TEST 1: Đọc file CSV mẫu RE-CP4-16-S ---');
const csvPath = path.resolve(import.meta.dirname, '../src/data/TestData/sample_dmac.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

const csvResult = parseExcelOrCsv(csvContent, 'sample_dmac.csv');
check('csvResult.ok === true', csvResult.ok === true);
eq('Số PO tìm thấy', csvResult.stats.poCount, 2);
eq('Số Container tìm thấy', csvResult.stats.containerCount, 2);
eq('Tổng số kiện', csvResult.stats.packageCount, 37);
eq('Tổng số lượng pcs', csvResult.stats.totalQty, 3954); // 2272 (PO 2930) + 1682 (PO 2929)
eq('Số mã hàng distinct', csvResult.stats.itemsCount, 10);

const plan1 = buildImportPlanV2(csvResult.data);
check('buildImportPlanV2 chấp nhận kết quả từ CSV', plan1.pos.length === 2);
check('plan1 có 37 kiện', plan1.pallets.length === 37);
check('plan1 có 2 container', plan1.containers.length === 2);

console.log('\n--- TEST 2: Đọc file nhị phân Excel .xlsx ---');
// Tạo một file .xlsx nhị phân thật từ CSV bằng XLSX
const wbXlsx = XLSX.read(csvContent, { type: 'string' });
const xlsxBuffer = XLSX.write(wbXlsx, { type: 'buffer', bookType: 'xlsx' });

const xlsxResult = parseExcelOrCsv(xlsxBuffer, 'test_packing.xlsx');
check('xlsxResult.ok === true', xlsxResult.ok === true);
eq('Số PO từ file xlsx', xlsxResult.stats.poCount, 2);
eq('Số kiện từ file xlsx', xlsxResult.stats.packageCount, 37);
eq('Tổng số lượng từ file xlsx', xlsxResult.stats.totalQty, 3954);

console.log('\n--- TEST 3: Đọc file nhị phân Excel .xls (BIFF8 cũ) ---');
const xlsBuffer = XLSX.write(wbXlsx, { type: 'buffer', bookType: 'biff8' });
const xlsResult = parseExcelOrCsv(xlsBuffer, 'test_packing.xls');
check('xlsResult.ok === true', xlsResult.ok === true);
eq('Số PO từ file xls', xlsResult.stats.poCount, 2);
eq('Số kiện từ file xls', xlsResult.stats.packageCount, 37);
eq('Tổng số lượng từ file xls', xlsResult.stats.totalQty, 3954);

console.log('\n--- TEST 4: Xử lý file lỗi / không đúng định dạng ---');
const invalidResult = parseExcelOrCsv('foo,bar,baz\n1,2,3', 'random.csv');
check('File không có container phải báo lỗi', invalidResult.ok === false);
check('Có thông báo lỗi thân thiện', typeof invalidResult.error === 'string');

console.log('\n--- TEST 5: File rỗng ---');
const emptyResult = parseExcelOrCsv('', 'empty.csv');
check('File rỗng phải báo lỗi', emptyResult.ok === false);

console.log(`\nKết quả test-excelParser: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
