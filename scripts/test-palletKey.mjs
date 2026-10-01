#!/usr/bin/env node
// scripts/test-palletKey.mjs
// Unit test cho FEAT-10 — chạy: npm run test:pallet
// Chỉ test hàm thuần trong src/utils/palletKey.js — không cần Expo/SQLite/device.

import assert from 'node:assert/strict';
import {
  palletKey, palletKeyList, isMultiItemPallet,
  remapPalletStatus, recalcPalletTotals,
} from '../src/utils/palletKey.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, message: e.message });
    console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`);
  }
}

const group = t => console.log(`\n${t}`);
const eq = (a, b, m) => assert.equal(a, b, m);

const A = { ntk: 'A', qty: 10 };
const B = { ntk: 'B', qty: 20 };
const C = { ntk: 'C', qty: 30 };
const single = (no, item) => ({ no, items: [item] });
const multi = (no, ...items) => ({ no, items });

// ------------------------------------------------------------------ palletKey
group('palletKey — định dạng khoá (Q1 = PA A)');

test('kiện 1 loại → không có hậu tố ntk', () => eq(palletKey('c1', 5), 'c1-5'));
test('kiện nhiều loại → hậu tố ntk', () => eq(palletKey('c1', 5, A), 'c1-5-A'));
test('containerId thật (import) vẫn hoạt động', () => eq(palletKey('HFMU2620080', 12, A), 'HFMU2620080-12-A'));
test('isMultiItemPallet: 1 phần tử → false', () => eq(isMultiItemPallet(single(1, A)), false));
test('isMultiItemPallet: 2 phần tử → true', () => eq(isMultiItemPallet(multi(1, A, B)), true));
test('isMultiItemPallet: mảng rỗng → false', () => eq(isMultiItemPallet({ no: 1, items: [] }), false));

group('palletKeyList');

test('kiện 1 loại → 1 khoá', () => eq(palletKeyList('c1', single(5, A)).join(), 'c1-5'));
test('kiện 3 loại → 3 khoá theo ntk', () => {
  eq(palletKeyList('c1', multi(5, A, B, C)).join(), 'c1-5-A,c1-5-B,c1-5-C');
});
test('pallet null → mảng rỗng', () => eq(palletKeyList('c1', null).length, 0));

// --------------------------------------------------------- remapPalletStatus
group('remapPalletStatus — không đổi cấu trúc (dùng cho migration)');

test('đọc khoá CŨ theo chỉ số → chuyển sang khoá ntk, giữ tick', () => {
  const before = [{ id: 'c1', pallets: [multi(2, A, B)] }];
  const after = [{ id: 'c1', pallets: [multi(2, A, B)] }];
  const done = { 'c1-2-0': true, 'c1-2-1': false };
  const out = remapPalletStatus(before, after, done);
  eq(out['c1-2-A'], true);
  eq(out['c1-2-B'], false);
  eq(out['c1-2-0'], undefined, 'khoá cũ phải bị loại bỏ');
});

test('khoá ntk đã tồn tại → ưu tiên khoá mới hơn khoá cũ', () => {
  const struct = [{ id: 'c1', pallets: [multi(2, A, B)] }];
  const done = { 'c1-2-0': true, 'c1-2-1': false, 'c1-2-A': false, 'c1-2-B': true };
  const out = remapPalletStatus(struct, struct, done);
  eq(out['c1-2-A'], false);
  eq(out['c1-2-B'], true);
});

group('remapPalletStatus — AC-EDIT-16: sửa số lượng');

test('đổi qty không đổi khoá → tick giữ nguyên', () => {
  const before = [{ id: 'c1', pallets: [multi(2, { ntk: 'A', qty: 10 }, B)] }];
  const after = [{ id: 'c1', pallets: [multi(2, { ntk: 'A', qty: 99 }, B)] }];
  const out = remapPalletStatus(before, after, { 'c1-2-A': true, 'c1-2-B': false });
  eq(out['c1-2-A'], true);
  eq(out['c1-2-B'], false);
});

group('remapPalletStatus — AC-EDIT-17: xoá 1 dòng giữa kiện nhiều loại');

test('xoá dòng đầu → tick của dòng sau KHÔNG bị mất', () => {
  const before = [{ id: 'c1', pallets: [multi(2, A, B, C)] }];
  const after = [{ id: 'c1', pallets: [multi(2, B, C)] }];
  const out = remapPalletStatus(before, after, {
    'c1-2-A': true, 'c1-2-B': true, 'c1-2-C': false,
  });
  eq(out['c1-2-B'], true, 'B đã tick ở vị trí cũ ⇒ vẫn tick');
  eq(out['c1-2-C'], false);
  eq(out['c1-2-A'], undefined, 'dòng đã xoá không còn khoá');
  eq(Object.keys(out).length, 2);
});

test('xoá dòng giữa (giữa A và C) → C giữ tick', () => {
  const before = [{ id: 'c1', pallets: [multi(2, A, B, C)] }];
  const after = [{ id: 'c1', pallets: [multi(2, A, C)] }];
  const out = remapPalletStatus(before, after, { 'c1-2-A': false, 'c1-2-B': true, 'c1-2-C': true });
  eq(out['c1-2-C'], true, 'đây chính là lỗi của khoá theo chỉ số');
  eq(out['c1-2-A'], false);
});

test('xoá dòng cuối → hai dòng đầu giữ nguyên', () => {
  const before = [{ id: 'c1', pallets: [multi(2, A, B, C)] }];
  const after = [{ id: 'c1', pallets: [multi(2, A, B)] }];
  const out = remapPalletStatus(before, after, { 'c1-2-A': true, 'c1-2-B': true, 'c1-2-C': true });
  eq(out['c1-2-A'], true);
  eq(out['c1-2-B'], true);
  eq(Object.keys(out).length, 2);
});

group('remapPalletStatus — AC-EDIT-18: 1 loại ↔ nhiều loại');

test('1 loại → 2 loại: dòng cũ giữ tick, dòng mới chưa tick', () => {
  const before = [{ id: 'c1', pallets: [single(5, A)] }];
  const after = [{ id: 'c1', pallets: [multi(5, A, B)] }];
  const out = remapPalletStatus(before, after, { 'c1-5': true });
  eq(out['c1-5-A'], true, 'dòng A vốn đã đóng kiện');
  eq(out['c1-5-B'], false, 'dòng B mới thêm');
  eq(out['c1-5'], undefined, 'khoá dạng 1-loại đã bị loại');
});

test('2 loại → 1 loại: giữ trạng thái của dòng còn lại', () => {
  const before = [{ id: 'c1', pallets: [multi(5, A, B)] }];
  const after = [{ id: 'c1', pallets: [single(5, A)] }];
  const out = remapPalletStatus(before, after, { 'c1-5-A': true, 'c1-5-B': false });
  eq(out['c1-5'], true);
  eq(Object.keys(out).length, 1);
});

group('remapPalletStatus — AC-EDIT-19/20: thêm & xoá kiện');

test('xoá kiện giữa dãy → chỉ mất khoá của kiện đó, số hiệu kiện khác giữ nguyên', () => {
  const before = [{ id: 'c1', pallets: [single(1, A), single(2, A), single(3, A), single(4, A)] }];
  const after = [{ id: 'c1', pallets: [single(1, A), single(3, A), single(4, A)] }];
  const out = remapPalletStatus(before, after, {
    'c1-1': true, 'c1-2': true, 'c1-3': false, 'c1-4': true,
  });
  eq(out['c1-1'], true);
  eq(out['c1-3'], false);
  eq(out['c1-4'], true);
  eq(out['c1-2'], undefined, 'kiện đã xoá không còn khoá');
  eq(Object.keys(out).length, 3);
});

test('thêm kiện mới → khoá mới mặc định chưa tick', () => {
  const before = [{ id: 'c1', pallets: [single(1, A)] }];
  const after = [{ id: 'c1', pallets: [single(1, A), single(2, B)] }];
  const out = remapPalletStatus(before, after, { 'c1-1': true });
  eq(out['c1-1'], true);
  eq(out['c1-2'], false, 'kiện mới chưa tick (AC-EDIT-15)');
});

test('nhiều container độc lập, không lẫn khoá', () => {
  const before = [
    { id: 'c1', pallets: [multi(1, A, B)] },
    { id: 'c2', pallets: [single(1, C)] },
  ];
  const after = [
    { id: 'c1', pallets: [multi(1, A, B)] },
    { id: 'c2', pallets: [single(1, C)] },
  ];
  // c1 dùng khoá cũ theo chỉ số, c2 dùng khoá 1-loại — phải xử lý độc lập.
  const out = remapPalletStatus(before, after, { 'c1-1-0': true, 'c1-1-1': false, 'c2-1': true });
  eq(out['c1-1-A'], true);
  eq(out['c1-1-B'], false);
  eq(out['c2-1'], true);
  eq(Object.keys(out).length, 3);
});

group('remapPalletStatus — dữ liệu seed thực tế');

test('vật chất hoá seed: tick kiện 1 loại giữ nguyên', () => {
  const seed = [
    { id: 'c1', pallets: [single(1, A), single(6, B)] },
    { id: 'c2', pallets: [single(2, C)] },
  ];
  const done = { 'c1-1': true, 'c1-6': true, 'c2-2': false };
  const out = remapPalletStatus(seed, seed, done);
  eq(out['c1-1'], true);
  eq(out['c1-6'], true);
  eq(out['c2-2'], false);
  eq(Object.keys(out).length, 3);
});

group('remapPalletStatus — trường hợp biên');

test('doneMap rỗng → mọi khoá mới = false', () => {
  const struct = [{ id: 'c1', pallets: [multi(1, A, B)] }];
  const out = remapPalletStatus(struct, struct, {});
  eq(out['c1-1-A'], false);
  eq(out['c1-1-B'], false);
});
test('cấu trúc rỗng → kết quả rỗng', () => {
  eq(Object.keys(remapPalletStatus([], [], { 'c1-1': true })).length, 0);
});
test('undefined/null an toàn', () => {
  eq(Object.keys(remapPalletStatus(null, null, null)).length, 0);
});
test('kiện có mã không tồn tại trong cấu trúc cũ → false, không ném lỗi', () => {
  const before = [{ id: 'c1', pallets: [] }];
  const after = [{ id: 'c1', pallets: [single(1, A)] }];
  const out = remapPalletStatus(before, after, {});
  eq(out['c1-1'], false);
});

// --------------------------------------------------------- recalcPalletTotals
group('recalcPalletTotals');

test('đếm kiện và tổng pcs', () => {
  const r = recalcPalletTotals([
    { id: 'c1', pallets: [single(1, A), multi(2, A, B)] },
    { id: 'c2', pallets: [single(1, C)] },
  ]);
  eq(r.count, 3);
  eq(r.totalQty, 10 + 10 + 20 + 30);
});
test('rỗng → {count:0, totalQty:0}', () => {
  eq(recalcPalletTotals([]).count, 0);
  eq(recalcPalletTotals(null).totalQty, 0);
});
test('khớp số kiện của seed (26)', () => {
  const seed = [
    { id: 'c1', pallets: Array.from({ length: 10 }, (_, i) => single(i + 1, A)) },
    { id: 'c2', pallets: Array.from({ length: 5 }, (_, i) => single(i + 1, A)) },
    { id: 'c3', pallets: Array.from({ length: 11 }, (_, i) => single(i + 1, A)) },
  ];
  eq(recalcPalletTotals(seed).count, 26);
});

// ------------------------------------------------------------------- Tổng kết
console.log(`\n${'─'.repeat(50)}`);
console.log(`Kết quả: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nCác test lỗi:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.message.split('\n')[0]}`));
  process.exit(1);
}
console.log('✅ Tất cả unit test FEAT-10 (palletKey) đạt.');
