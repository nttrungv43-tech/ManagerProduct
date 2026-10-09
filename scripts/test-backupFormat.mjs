// scripts/test-backupFormat.mjs
// Kiểm thử chức năng định dạng và kiểm tra hợp lệ của file sao lưu JSON.

import assert from 'node:assert/strict';
import {
  BACKUP_FORMAT_ID,
  CURRENT_SCHEMA_VERSION,
  buildBackupPayload,
  validateBackupPayload,
  generateBackupFilename,
  formatBackupSummary,
} from '../src/utils/backupFormat.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('--- test:backupFormat ---');

test('generateBackupFilename tạo đúng định dạng', () => {
  const d = new Date(2026, 9, 9, 14, 5, 30); // Tháng 10 = index 9
  const fn = generateBackupFilename(d);
  assert.equal(fn, 'production_tracker_backup_20261009_140530.json');
});

test('buildBackupPayload đóng gói đầy đủ metadata và bảng', () => {
  const sampleData = {
    order_batches: [
      { id: 1, status: 'archived', imported_at: '2026-10-01' },
      { id: 2, status: 'active', imported_at: '2026-10-05' },
    ],
    pos: [
      { id: 10, order_batch_id: 2, code: '2919' },
    ],
    order_lines: [
      { id: 100, po_id: 10, item_code: 'A1', target: 50 },
    ],
    item_refs: [],
    order_line_refs: [],
    production_entries: [
      { id: 1000, order_line_id: 100, date: '2026-10-05', qty: 20, defect_qty: 0 },
    ],
    production_defects: [],
    production_entry_refs: [],
    containers: [
      { id: 50, order_batch_id: 2, po_id: 10, container_no: 'CONT1' },
    ],
    pallets: [
      { id: 500, container_id: 50, po_id: 10, pallet_no: 1 },
    ],
    pallet_lines: [
      { id: 5000, pallet_id: 500, order_line_id: 100, qty: 20, done: 1 },
    ],
  };

  const payload = buildBackupPayload(sampleData, '1.2.3');
  assert.equal(payload.format, BACKUP_FORMAT_ID);
  assert.equal(payload.schema_version, CURRENT_SCHEMA_VERSION);
  assert.equal(payload.app_version, '1.2.3');
  assert.equal(payload.metadata.total_batches, 2);
  assert.equal(payload.metadata.active_batches, 1);
  assert.equal(payload.metadata.archived_batches, 1);
  assert.equal(payload.metadata.total_pos, 1);
  assert.equal(payload.metadata.total_lines, 1);
  assert.equal(payload.metadata.total_entries, 1);
  assert.equal(payload.metadata.total_containers, 1);
  assert.equal(payload.metadata.total_pallets, 1);
  assert.equal(payload.metadata.total_pallet_lines, 1);

  assert.equal(payload.data.order_batches.length, 2);
  assert.equal(payload.data.pos.length, 1);
});

test('validateBackupPayload chấp nhận payload hợp lệ', () => {
  const payload = buildBackupPayload({
    order_batches: [{ id: 1, status: 'active', imported_at: '2026-10-05' }],
    pos: [{ id: 1, order_batch_id: 1, code: 'PO1' }],
    order_lines: [{ id: 1, po_id: 1, item_code: 'M1', target: 10 }],
    production_entries: [],
    containers: [],
    pallets: [],
    pallet_lines: [],
  });

  const res = validateBackupPayload(payload);
  assert.equal(res.valid, true);
  assert.ok(res.data);
  assert.equal(res.data.order_batches.length, 1);
  assert.deepEqual(res.data.item_refs, []);
});

test('validateBackupPayload từ chối dữ liệu rỗng hoặc sai kiểu', () => {
  assert.equal(validateBackupPayload(null).valid, false);
  assert.equal(validateBackupPayload('string').valid, false);
  assert.equal(validateBackupPayload([]).valid, false);
});

test('validateBackupPayload từ chối thiếu schema_version hoặc sai format', () => {
  assert.equal(validateBackupPayload({ format: 'other' }).valid, false);
  assert.equal(validateBackupPayload({ format: BACKUP_FORMAT_ID, schema_version: 0 }).valid, false);
});

test('validateBackupPayload từ chối khi thiếu bảng bắt buộc', () => {
  const bad = {
    format: BACKUP_FORMAT_ID,
    schema_version: 3,
    data: {
      order_batches: [],
      pos: [],
      // thiếu order_lines
      production_entries: [],
      containers: [],
      pallets: [],
      pallet_lines: [],
    },
  };
  const res = validateBackupPayload(bad);
  assert.equal(res.valid, false);
  assert.match(res.error, /order_lines/);
});

test('formatBackupSummary trả về chuỗi thông tin chi tiết', () => {
  const payload = buildBackupPayload({
    order_batches: [
      { id: 1, status: 'archived' },
      { id: 2, status: 'active' },
    ],
    pos: [{ id: 1 }, { id: 2 }],
    order_lines: [{ id: 1 }],
    production_entries: [{ id: 1 }],
    containers: [{ id: 1 }],
    pallets: [{ id: 1 }, { id: 2 }],
    pallet_lines: [],
  });

  const summary = formatBackupSummary(payload);
  assert.match(summary, /Thời gian sao lưu/);
  assert.match(summary, /Đơn hàng: 2 \(1 đang sản xuất, 1 lưu trữ\)/);
  assert.match(summary, /Mã PO: 2/);
  assert.match(summary, /Dòng mã hàng: 1/);
  assert.match(summary, /Nhật ký sản xuất: 1 lượt/);
  assert.match(summary, /Vận chuyển: 1 container, 2 kiện/);
});

console.log(`\nKết quả test-backupFormat: ${passed} passed, 0 failed\n`);
