#!/usr/bin/env node
// scripts/convert-packing-data.mjs
// FEAT-16 — CLI chuyển packing list `schema_version 1` sang định dạng app nhận.
//
//   node scripts/convert-packing-data.mjs [--in <file>] [--out <dir>] [--force]
//
// Vì sao cần (xem spec `specs/features/FEAT-16-convert-packing-data-v1.md`):
// app chỉ nhận định dạng legacy (`總表` + `Column1..Column10`); file chuẩn hoá mới lồng 4 tầng
// ⇒ import trực tiếp báo lỗi và **không** ghi gì.
//
// ⚠️ Vì sao GỘP thành MỘT file (đo thật, không phải suy đoán):
//   • `container_data` PK `batch_id` ⇒ mỗi batch chỉ giữ một cấu trúc container.
//   • `items` PK `(ntk, order_batch_id)` ⇒ cùng `ntk` ở file sau đè target của file trước.
//   Import 22 file (1 file/shipment) chỉ còn Σ target 17.935/51.568 ⇒ MẤT DỮ LIỆU.
// Gộp tất cả vào `packing_legacy.json` là cách duy nhất nạp trọn vẹn 26 container/468 kiện.
//
// Nguyên tắc (AC-CONV-07/10): **kiểm tra tất cả trước, ghi sau** — có `problem` chặn thì không
// ghi file nào, thoát với mã lỗi. Hàm chuyển đổi nằm ở `src/utils/packingV1.js` (hàm thuần).

import fs from 'node:fs';
import path from 'node:path';
import {
  convertPackingDataV1,
  verifyAgainstShipmentList,
} from '../src/utils/packingV1.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_IN = path.join(ROOT, 'src/data/packing_data.json');
const DEFAULT_OUT = path.join(ROOT, 'src/data/packing_legacy');
const OUT_NAME = 'packing_legacy.json';

function parseArgs(argv) {
  const args = { in: DEFAULT_IN, out: DEFAULT_OUT, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') args.in = path.resolve(argv[++i]);
    else if (a === '--out') args.out = path.resolve(argv[++i]);
    else if (a === '--force') args.force = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Tham số lạ: ${a}`);
  }
  return args;
}

const fmt = n => Number(n ?? 0).toLocaleString('vi-VN');
const pad = (s, n) => String(s).padEnd(n);

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(2);
  }

  if (args.help) {
    console.log('Dùng: node scripts/convert-packing-data.mjs [--in file.json] [--out thư_mục] [--force]');
    console.log(`  --in    file nguồn (mặc định: src/data/packing_data.json)`);
    console.log(`  --out   thư mục ghi kết quả (mặc định: src/data/packing_legacy)`);
    console.log(`  --force ghi đè thư mục đã có`);
    return 0;
  }

  if (!fs.existsSync(args.in)) {
    console.error(`❌ Không tìm thấy file nguồn: ${args.in}`);
    return 2;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(args.in, 'utf8'));
  } catch (e) {
    console.error(`❌ File JSON không hợp lệ: ${e.message}`);
    return 2;
  }

  const version = data?.schema_version;
  if (version !== 1) {
    console.error(`❌ schema_version = ${JSON.stringify(version)} — converter chỉ hỗ trợ schema_version 1.`);
    return 2;
  }

  const res = convertPackingDataV1(data);
  const v = verifyAgainstShipmentList(data, res.stats);

  console.log(`Nguồn: ${args.in}  (schema_version ${version}, generated_at ${data.generated_at || '—'})\n`);

  // --- Báo cáo vấn đề chặn: KHÔNG ghi file nào (AC-CONV-07/10) ---
  if (res.blocking) {
    console.error('❌ Có vấn đề chặn ⇒ KHÔNG ghi file nào:');
    for (const p of res.problems) console.error(`   PO ${p.po ?? '?'}: ${p.code}`);
    return 1;
  }

  if (!res.ok) {
    console.error('❌ Không tạo được file nào từ dữ liệu đầu vào.');
    return 1;
  }

  // --- Ghi (sau khi đã kiểm tra xong) ---
  if (fs.existsSync(args.out)) {
    const existing = fs.readdirSync(args.out).filter(f => f.endsWith('.json'));
    if (existing.length > 0 && !args.force) {
      console.error(`❌ Thư mục đã tồn tại và có ${existing.length} file: ${args.out}`);
      console.error('   Dùng --force để ghi đè.');
      return 2;
    }
    fs.rmSync(args.out, { recursive: true, force: true });
  }
  fs.mkdirSync(args.out, { recursive: true });

  const manifest = {
    generated_at: new Date().toISOString(),
    source: path.relative(ROOT, args.in),
    schema_version: version,
    output: OUT_NAME,
    stats: res.stats,
    verify: v,
    // Giới hạn sẵn có của app: `importItemsFromJson` chỉ đọc `Column10` dòng đầu ⇒ mọi mã sẽ
    // mang nhãn PO của `dominantPo`. Bản đồ PO đầy đủ nằm ở đây để đối chiếu (AC-CONV-11).
    app_po_label: res.stats.dominantPo,
    items: res.items,
    needsReview: res.needsReview,
    problems: res.problems,
  };
  fs.writeFileSync(path.join(args.out, OUT_NAME), `${JSON.stringify(res.file.json, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(args.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // --- Báo cáo ---
  const s = res.stats;
  console.log('Đã ghi:');
  console.log(`  thư mục     : ${args.out}`);
  console.log(`  file        : ${OUT_NAME} (+ manifest.json)`);
  console.log(`  shipment    : ${s.shipments}`);
  console.log(`  container   : ${fmt(s.containers)}`);
  console.log(`  kiện        : ${fmt(s.pallets)}`);
  console.log(`  mã hàng     : ${fmt(s.items)}`);
  console.log(`  tổng số lượng: ${fmt(s.qty)}`);

  console.log('\nĐối chiếu với shipment_list của file nguồn:');
  console.log(`  ${pad('chỉ số', 12)} ${pad('file nguồn', 14)} ${pad('chuyển đổi', 14)} kết quả`);
  for (const k of ['shipments', 'containers', 'pallets', 'qty']) {
    const okRow = v.expected[k] === v.actual[k];
    console.log(`  ${pad(k, 12)} ${pad(fmt(v.expected[k]), 14)} ${pad(fmt(v.actual[k]), 14)} ${okRow ? '✅' : '❌'}`);
  }

  if (res.needsReview.length > 0) {
    console.warn(`\n⚠ ${res.needsReview.length} shipment được đánh dấu needsReview (nguồn có ok=false hoặc warnings):`);
    for (const r of res.needsReview) {
      console.warn(`   PO ${r.po}`);
      for (const w of r.warnings) console.warn(`     - ${w}`);
    }
  }

  const multiPo = res.items.filter(i => i.pos.length > 1);
  if (multiPo.length > 0) {
    console.warn(`\n⚠ GIỚI HẠN SẴN CÓ: ${multiPo.length}/${res.items.length} mã thuộc NHIỀU PO.`);
    console.warn('   App chỉ đọc `Column10` của dòng đầu ⇒ mọi mã sẽ mang nhãn PO "' + s.dominantPo + '".');
    console.warn('   Bản đồ PO chính xác theo từng mã nằm trong manifest.json (`items[].pos`).');
  }

  console.log(`\n👉 Mở app → tab "Mã hàng" → 📥 Nhập JSON → chọn: ${path.join(path.relative(process.cwd(), args.out), OUT_NAME)}`);
  return v.matched ? 0 : 1;
}

process.exit(main());