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

console.log('\n--- TEST 6: Biểu mẫu RE-CP4-16-S có Container 1, Seal No placeholder và kiện Mix ---');
const userCsv = `,,"装箱计划单
  PACKING/WEIGHT LIST  ",,,,,,,,,,,,,
,,,KẾ HOẠCH ĐÓNG CONTAINER,,,,,,,,,,,,
發票號碼,,,,,,,,日期,,,,,,,
Invoice No.,,,,,,,,Date,,,,,,,
Mã hóa đơn,,,,,,,,Ngày,,,,,,,
Container No.,,,,,,,,,,,,,,,
致,,,,,,,,,,,,,,,
"To
Đến",,,,,,,,MARK & NOS.,,,,,,,
,,,,,,,,Mã hiệu và số kiện,,,,,,,
裝由/Vận chuyển,,,,,,,,,,,,,,,
Shipped PRRSS,,,,,,,,,,,,,,,
裝船口岸,,,,,目的地,,,,,,,,,,
From,VIET NAM,,,,To,,,,2600168.0,,,,,,
Từ,,,,,Đến,,,,,,,,,,
裝由/Vận chuyển,,,,,,,,Made in VIETNAM,,,,,,,
Per S.S,,,,,,,,C/No.,1-10,,,,,,
,,,,,,,,,,,,,,,
,,"數量、包裝及品名
Số lượng, quy cách, tên hàng",,,,"淨重
Trọng lượng tịnh",,"毛重
Trọng lượng cả bì",,"體積
Thể tích",,,,,
"Package
Đóng gói",No.,,NTK No.,SKU,"Quantity
Số lượng",N.W. KG,,G.W. KG,,"Measurement
Đo lường",,,,,"体积
Thể tích"
Container 1/ Seal  No. / Pallet 1-10,,,,,,,,,,,,,,,
2600168.0,1.0,,1063022.0,0.0,660.0,2059.0,KGS,2084.0,KGS,1.22,*,1.02,*,1.1232,1.4
2600168.0,2.0,,106160.0,0.0,300.0,1365.0,KGS,1390.0,KGS,1.22,*,1.02,*,1.05,1.31
2600168.0,,,1063022.0,0.0,20.0,62.0,KGS,62.0,KGS,1.22,*,1.02,*,0.0304,0.04
2600189.0,3.0,,1063038.0,0.0,330.0,2046.0,KGS,2071.0,KGS,1.22,*,1.02,*,0.87385,1.09
2600168.0,4.0,,1061119.0,0.0,290.0,1908.0,KGS,1933.0,KGS,1.22,*,1.02,*,0.83875,1.04
2600189.0,5.0,,1061119.0,0.0,290.0,1908.0,KGS,1933.0,KGS,1.22,*,1.02,*,0.83875,1.04
2600168.0,6.0,,1063038.0,0.0,300.0,1860.0,KGS,1885.0,KGS,1.22,*,1.02,*,0.80745,1.0
2600168.0,7.0,,1063038.0,0.0,300.0,1860.0,KGS,1885.0,KGS,1.22,*,1.02,*,0.80745,1.0
2600168.0,8.0,,1063038.0,0.0,300.0,1860.0,KGS,1885.0,KGS,1.22,*,1.02,*,0.80745,1.0
2600168.0,9.0,,1063038.0,0.0,300.0,1860.0,KGS,1885.0,KGS,1.22,*,1.02,*,0.80745,1.0
2600189.0,10.0,,1061119.0,0.0,210.0,1382.0,KGS,1407.0,KGS,1.22,*,1.02,*,0.64595,0.8
2600189.0,,,1063048.0,0.0,20.0,146.0,KGS,146.0,KGS,1.22,*,1.02,*,0.04955,0.06
,,,,,,,,,,,,,,,
,,,,,3320.0,18316.0,KGS,18566.0,KGS,10.780000000000001,,CBM,,,
,SAY TOTAL TEN (10) PACKAGES ONLY,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,
,"计划出货
Kế hoạch xuất hàng",,3320.0,,,,,,,,,,,,
,取消数量,,,,,,,,,,,,,,
,"实际出货
Thực tế xuất hàng",,3320.0,,,,,"制表:
Lập biểu:",,"审核:
Xét duyệt:",,,,,
,"达成率
Tỷ lệ hoàn thành",,1.0,,,,,,,,,,,,
,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,
"表单编号：RE-CP4-16-S   
Mã biểu mẫu: RE-CP4-16-S                    ",,,"版次：1.0
Phiên bản: 1.0  ","日期：2025/12/05  
Ngày: 2025/12/05",,,,,"保存期限：最少三年
Thời hạn lưu trữ: Tối thiểu 3 năm",,,,,,
`;

const userResult = parseExcelOrCsv(userCsv, 'user_template.csv');
check('userResult.ok === true', userResult.ok === true);
eq('Số PO tìm thấy trong userCsv', userResult.stats.poCount, 2);
eq('Số Container tìm thấy trong userCsv', userResult.stats.containerCount, 1);
eq('Tổng số kiện trong userCsv', userResult.stats.packageCount, 10);
eq('Tổng sản lượng pcs trong userCsv', userResult.stats.totalQty, 3320);
eq('Số mã distinct trong userCsv', userResult.stats.itemsCount, 5);

const userPlan = buildImportPlanV2(userResult.data);
check('userPlan nhận diện 2 PO', userPlan.pos.length === 2);
check('userPlan nhận diện 1 container', userPlan.containers.length === 1);
check('userPlan có 10 kiện', userPlan.pallets.length === 10);

console.log(`\nKết quả test-excelParser: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
