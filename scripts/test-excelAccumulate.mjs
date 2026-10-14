// scripts/test-excelAccumulate.mjs
// Kiểm thử chức năng cộng dồn dữ liệu khi nạp liên tiếp nhiều file Excel vào đơn hàng active
// và đảm bảo tính idempotent khi nạp lại file cũ.

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { parseExcelOrCsv } from '../src/utils/excelParser.js';

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

const tmp = mkdtempSync(join(tmpdir(), 'ptracker-test-accum-'));
const DB = join(tmp, 'production_tracker.db');
process.env.EXPO_SQLITE_FILE = DB;

const { getDb } = await import('../src/db/index.js');
const q = await import('../src/db/queries.js');

const db = await getDb();
const activeBatch = await db.getFirstAsync(`SELECT id FROM order_batches WHERE status='active'`);
const batchId = activeBatch.id;

console.log('=== PHẦN 1: TEST CỘNG DỒN VỚI EXCEL SYNTHETIC (LUÔN CHẠY TRÊN MỌI MÔI TRƯỜNG) ===');

function makeWorkbook(rows, sheetName = 'Sheet1') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// File Synthetic A: PO_ALPHA, Container 1, 2 kiện
const rowsA = [
  ['装箱计划单 PACKING/WEIGHT LIST'],
  ['Invoice No.', '', '', '', '', '', '', 'Date'],
  ['From', 'VIET NAM', '', '', 'To', '', 'PO_ALPHA'],
  ['Package', 'No.', '', 'NTK No.', 'SKU', 'Quantity'],
  ['Container 1 / Pallet 1-2'],
  ['PO_ALPHA', '1', '', 'ITEM_A', '0', '100'],
  ['PO_ALPHA', '2', '', 'ITEM_B', '0', '200'],
  ['SAY TOTAL 2 PACKAGES ONLY'],
  ['Mã biểu mẫu: RE-CP4-16-S'],
];
const bufA = makeWorkbook(rowsA, 'PO_ALPHA');
const resA = parseExcelOrCsv(bufA, 'File_A.xlsx');
check('Parse File Synthetic A thành công', resA.ok);
await q.importPackingV1(batchId, resA.data);

let qty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [batchId])).s;
let containers = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [batchId])).c;
let pallets = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [batchId])).c;
eq('Sau File A: 1 container', containers, 1);
eq('Sau File A: 2 kiện', pallets, 2);
eq('Sau File A: 300 pcs', qty, 300);

// File Synthetic B: PO_BETA (cùng tên Container 1 nhưng khác PO), 3 kiện
const rowsB = [
  ['装箱计划单 PACKING/WEIGHT LIST'],
  ['Invoice No.', '', '', '', '', '', '', 'Date'],
  ['From', 'VIET NAM', '', '', 'To', '', 'PO_BETA'],
  ['Package', 'No.', '', 'NTK No.', 'SKU', 'Quantity'],
  ['Container 1 / Pallet 1-3'],
  ['PO_BETA', '1', '', 'ITEM_C', '0', '150'],
  ['PO_BETA', '2', '', 'ITEM_D', '0', '250'],
  ['PO_BETA', '3', '', 'ITEM_E', '0', '100'],
  ['SAY TOTAL 3 PACKAGES ONLY'],
  ['Mã biểu mẫu: RE-CP4-16-S'],
];
const bufB = makeWorkbook(rowsB, 'PO_BETA');
const resB = parseExcelOrCsv(bufB, 'File_B.xlsx');
check('Parse File Synthetic B thành công', resB.ok);
await q.importPackingV1(batchId, resB.data);

qty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [batchId])).s;
containers = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [batchId])).c;
pallets = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [batchId])).c;
eq('Sau File B: cộng dồn thành 2 containers (Container 1 và Container 1 (PO_BETA))', containers, 2);
eq('Sau File B: cộng dồn thành 5 kiện (2 + 3)', pallets, 5);
eq('Sau File B: cộng dồn thành 800 pcs (300 + 500)', qty, 800);

// Nạp lại File B -> Không cộng dồn lặp (idempotent)
await q.importPackingV1(batchId, resB.data);
qty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [batchId])).s;
containers = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [batchId])).c;
pallets = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [batchId])).c;
eq('Nạp lại File B: vẫn giữ nguyên 2 containers', containers, 2);
eq('Nạp lại File B: vẫn giữ nguyên 5 kiện', pallets, 5);
eq('Nạp lại File B: vẫn giữ nguyên 800 pcs', qty, 800);

const dir = '/home/oem/.gemini/antigravity/brain/f0a4d503-3395-4629-8ea9-f13f2b37c65f/.user_uploaded';
const filesExist = existsSync(dir) &&
  existsSync(`${dir}/media_1791984371363_c8b06b36.xls`) &&
  existsSync(`${dir}/media_1791984371363_f78afaa5.xls`) &&
  existsSync(`${dir}/media_1791984371368_4fc5dd17.xls`) &&
  existsSync(`${dir}/media_1791984371368_1133eab3.xls`) &&
  existsSync(`${dir}/media_1791984371368_412145b8.xlsx`);

if (filesExist) {
  console.log('\n=== PHẦN 2: TEST CỘNG DỒN 5 FILE EXCEL CỦA NGƯỜI DÙNG ===');
  // Chuyển đơn active sang archived và tạo batch active mới cho 5 file người dùng
  const finishRes = await q.finishOrder();
  const freshBatchId = finishRes.id;

  console.log('--- 1. NẠP FILE 1: Đài Loan (10-11) ---');
  const buf1 = readFileSync(`${dir}/media_1791984371363_c8b06b36.xls`);
  const res1 = parseExcelOrCsv(buf1, 'Đài Loan (10-11).xls');
  check('Parse File 1 thành công', res1.ok);
  await q.importPackingV1(freshBatchId, res1.data);

  let totalQty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [freshBatchId])).s;
  let contCount = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [freshBatchId])).c;
  let palCount = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [freshBatchId])).c;
  eq('Sau File 1: có đúng 1 container', contCount, 1);
  eq('Sau File 1: có đúng 10 kiện', palCount, 10);
  eq('Sau File 1: tổng sản lượng kế hoạch = 4270 pcs', totalQty, 4270);

  console.log('\n--- 2. NẠP FILE 2: Đài Loan (10-11) + Đài Loan (2-10-11) ---');
  const buf2 = readFileSync(`${dir}/media_1791984371363_f78afaa5.xls`);
  const res2 = parseExcelOrCsv(buf2, 'Đài Loan 2 containers.xls');
  check('Parse File 2 thành công', res2.ok);
  await q.importPackingV1(freshBatchId, res2.data);

  totalQty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [freshBatchId])).s;
  contCount = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [freshBatchId])).c;
  palCount = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [freshBatchId])).c;
  eq('Sau File 2: có đúng 2 containers (Container 1 cập nhật, Container 2 thêm mới)', contCount, 2);
  eq('Sau File 2: có đúng 20 kiện', palCount, 20);
  eq('Sau File 2: tổng sản lượng kế hoạch = 7220 pcs (4270 + 2950)', totalQty, 7220);

  console.log('\n--- 3. NẠP FILE 3: Đài Loan (12-10) ---');
  const buf3 = readFileSync(`${dir}/media_1791984371368_4fc5dd17.xls`);
  const res3 = parseExcelOrCsv(buf3, 'Đài Loan (12-10).xls');
  check('Parse File 3 thành công', res3.ok);
  await q.importPackingV1(freshBatchId, res3.data);

  totalQty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [freshBatchId])).s;
  contCount = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [freshBatchId])).c;
  palCount = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [freshBatchId])).c;
  eq('Sau File 3: có đúng 3 containers (Container 1 bổ sung thành Container 1 (2600168))', contCount, 3);
  eq('Sau File 3: có đúng 30 kiện', palCount, 30);
  eq('Sau File 3: tổng sản lượng kế hoạch = 10540 pcs (7220 + 3320)', totalQty, 10540);

  console.log('\n--- 4. NẠP FILE 4: KIA (11 containers) ---');
  const buf4 = readFileSync(`${dir}/media_1791984371368_1133eab3.xls`);
  const res4 = parseExcelOrCsv(buf4, 'KIA.xls');
  check('Parse File 4 thành công', res4.ok);
  eq('PO File 4 nhận diện đúng KIA', res4.data.batches[0].shipments[0].po_no, 'KIA');
  await q.importPackingV1(freshBatchId, res4.data);

  totalQty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [freshBatchId])).s;
  contCount = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [freshBatchId])).c;
  palCount = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [freshBatchId])).c;
  eq('Sau File 4: có đúng 14 containers (3 + 11)', contCount, 14);
  eq('Sau File 4: có đúng 202 kiện (30 + 172)', palCount, 202);
  eq('Sau File 4: tổng sản lượng kế hoạch cộng dồn = 37587 pcs (10540 + 27047)', totalQty, 37587);

  console.log('\n--- 5. NẠP FILE 5: HYUNDAI (15 containers) ---');
  const buf5 = readFileSync(`${dir}/media_1791984371368_412145b8.xlsx`);
  const res5 = parseExcelOrCsv(buf5, 'HYUNDAI.xlsx');
  check('Parse File 5 thành công', res5.ok);
  eq('PO File 5 nhận diện đúng HYUNDAI', res5.data.batches[0].shipments[0].po_no, 'HYUNDAI');
  await q.importPackingV1(freshBatchId, res5.data);

  totalQty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [freshBatchId])).s;
  contCount = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [freshBatchId])).c;
  palCount = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [freshBatchId])).c;
  eq('Sau File 5: có đúng 29 containers (14 + 15)', contCount, 29);
  eq('Sau File 5: có đúng 436 kiện (202 + 234)', palCount, 436);
  eq('Sau File 5: tổng sản lượng kế hoạch cộng dồn = 74027 pcs (37587 + 36440)', totalQty, 74027);

  console.log('\n--- 6. KIỂM TRA IDEMPOTENT KHI NẠP LẠI FILE 4 (KIA) ---');
  await q.importPackingV1(freshBatchId, res4.data);

  totalQty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [freshBatchId])).s;
  contCount = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [freshBatchId])).c;
  palCount = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [freshBatchId])).c;
  eq('Nạp lại KIA: vẫn đúng 29 containers (không nhân đôi)', contCount, 29);
  eq('Nạp lại KIA: vẫn đúng 436 kiện (không nhân đôi)', palCount, 436);
  eq('Nạp lại KIA: tổng sản lượng vẫn đúng 74027 pcs', totalQty, 74027);

  console.log('\n--- 7. KIỂM TRA IDEMPOTENT KHI NẠP LẠI FILE 5 (HYUNDAI) ---');
  await q.importPackingV1(freshBatchId, res5.data);

  totalQty = (await db.getFirstAsync(`SELECT SUM(ol.target) s FROM order_lines ol JOIN pos p ON p.id = ol.po_id WHERE p.order_batch_id=?`, [freshBatchId])).s;
  contCount = (await db.getFirstAsync(`SELECT COUNT(*) c FROM containers WHERE order_batch_id=?`, [freshBatchId])).c;
  palCount = (await db.getFirstAsync(`SELECT COUNT(p.id) c FROM pallets p JOIN containers c ON c.id=p.container_id WHERE c.order_batch_id=?`, [freshBatchId])).c;
  eq('Nạp lại HYUNDAI: vẫn đúng 29 containers (không nhân đôi)', contCount, 29);
  eq('Nạp lại HYUNDAI: vẫn đúng 436 kiện (không nhân đôi)', palCount, 436);
  eq('Nạp lại HYUNDAI: tổng sản lượng vẫn đúng 74027 pcs', totalQty, 74027);
}

console.log(`\nKết quả test-excelAccumulate: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
