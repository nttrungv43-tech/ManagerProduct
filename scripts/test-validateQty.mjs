#!/usr/bin/env node
// scripts/test-validateQty.mjs
// Unit test cho FEAT-09 — chạy: npm test  (hoặc: node --no-warnings scripts/test-validateQty.mjs)
// Chỉ test hàm thuần trong src/utils/validateQty.js — không cần Expo/SQLite/device.

import assert from 'node:assert/strict';
import {
  parseQty, checkQtyLimit, formatQtyError,
  INVALID_QTY_TITLE, INVALID_QTY_MESSAGE, OVER_TARGET_TITLE,
} from '../src/utils/validateQty.js';

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

function group(title) {
  console.log(`\n${title}`);
}

const eq = (actual, expected, msg) => assert.equal(actual, expected, msg);

// ---------------------------------------------------------------- parseQty
group('parseQty — giá trị hợp lệ');

test("'120' → 120", () => eq(parseQty('120'), 120));
test("' 120 ' → 120 (bỏ khoảng trắng)", () => eq(parseQty(' 120 '), 120));
test("'1.200' → 1200 (dấu chấm phân tách nghìn)", () => eq(parseQty('1.200'), 1200));
test("'1 200' → 1200 (dấu cách phân tách nghìn)", () => eq(parseQty('1 200'), 1200));
test("'1.000.000' → 1000000", () => eq(parseQty('1.000.000'), 1000000));
test("'0' → 0 (khác null: số 0 hợp lệ)", () => eq(parseQty('0'), 0));
test("'007' → 7", () => eq(parseQty('007'), 7));
test('số 120 (number) → 120', () => eq(parseQty(120), 120));
test('số 0 (number) → 0', () => eq(parseQty(0), 0));

group('parseQty — giá trị không hợp lệ → null');

test("'' → null", () => eq(parseQty(''), null));
test("'   ' → null", () => eq(parseQty('   '), null));
test("'abc' → null", () => eq(parseQty('abc'), null));
test("'12abc' → null", () => eq(parseQty('12abc'), null));
test("'-5' → null (âm)", () => eq(parseQty('-5'), null));
test("'1.5' → null (số thực, không phải phân tách nghìn)", () => eq(parseQty('1.5'), null));
test("'1e3' → null (ký hiệu khoa học)", () => eq(parseQty('1e3'), null));
test("'1 2 3' → null (nhóm không đủ 3 chữ số)", () => eq(parseQty('1 2 3'), null));
test('null → null', () => eq(parseQty(null), null));
test('undefined → null', () => eq(parseQty(undefined), null));
test('NaN → null', () => eq(parseQty(NaN), null));
test('Infinity → null', () => eq(parseQty(Infinity), null));
test('-5 (number) → null', () => eq(parseQty(-5), null));
test('1.5 (number) → null', () => eq(parseQty(1.5), null));
test("'99999999999999999999' → null (quá số nguyên an toàn)", () => eq(parseQty('99999999999999999999'), null));

// ----------------------------------------------------------- checkQtyLimit
group('checkQtyLimit — cho phép');

test('đạt đúng hạn mức → ok', () => {
  eq(checkQtyLimit({ target: 1000, produced: 900, incomingQty: 100, hasLimit: true }).ok, true);
});
test('dưới hạn mức → ok', () => {
  eq(checkQtyLimit({ target: 1000, produced: 100, incomingQty: 100, hasLimit: true }).ok, true);
});
test('sửa giảm số khi đã đạt hạn mức → ok (AC-VAL-06)', () => {
  // `produced` ĐÃ trừ dòng đang sửa (qty 50): 1000 − 50 = 950; 950 + 20 = 970 ≤ 1000
  eq(checkQtyLimit({ target: 1000, produced: 950, incomingQty: 20, hasLimit: true }).ok, true);
});
test('incomingQty = 0 → ok', () => {
  eq(checkQtyLimit({ target: 1000, produced: 1500, incomingQty: 0, hasLimit: true }).ok, true);
});
test('hasLimit = false → luôn ok (target = 0, AC-VAL-09)', () => {
  eq(checkQtyLimit({ target: 0, produced: 99999, incomingQty: 99999, hasLimit: false }).ok, true);
});
test('bỏ hasLimit → suy ra từ target > 0', () => {
  eq(checkQtyLimit({ target: 0, produced: 10, incomingQty: 10 }).ok, true);
  eq(checkQtyLimit({ target: 100, produced: 10, incomingQty: 10 }).ok, true);
});
test('gọi không tham số → ok', () => {
  eq(checkQtyLimit().ok, true);
});

group('checkQtyLimit — chặn (OVER_TARGET)');

test('vượt hạn mức khi thêm mới (AC-VAL-01)', () => {
  const r = checkQtyLimit({ target: 1000, produced: 900, incomingQty: 200, hasLimit: true });
  eq(r.ok, false);
  eq(r.code, 'OVER_TARGET');
  eq(r.remaining, 100);
  eq(r.overBy, 100);
});
test('vượt khi đã đạt đúng hạn mức (AC-VAL-03)', () => {
  const r = checkQtyLimit({ target: 1000, produced: 1000, incomingQty: 1, hasLimit: true });
  eq(r.ok, false);
  eq(r.remaining, 0);
  eq(r.overBy, 1);
});
test('vượt khi sửa dòng cũ (AC-VAL-04): produced đã trừ qtyCũ', () => {
  // Tổng đang có 900 gồm dòng cũ 50 ⇒ produced truyền vào = 850.
  // Tổng sau khi sửa = 850 + 200 = 1050 > 1000 ⇒ vượt 50.
  const r = checkQtyLimit({ target: 1000, produced: 850, incomingQty: 200, hasLimit: true });
  eq(r.ok, false);
  eq(r.overBy, 50);
  eq(r.remaining, 150);
});
test('sửa được khi tổng mới vẫn ≤ hạn mức (AC-VAL-05)', () => {
  eq(checkQtyLimit({ target: 1000, produced: 900, incomingQty: 100, hasLimit: true }).ok, true);
});
test('kết quả trả về đủ trường cho thông báo', () => {
  const r = checkQtyLimit({ target: 1000, produced: 900, incomingQty: 200, hasLimit: true });
  assert.deepEqual(Object.keys(r).sort(), ['code', 'incomingQty', 'ok', 'overBy', 'produced', 'remaining', 'target']);
});

// ------------------------------------------------------------- Thông báo UI
group('formatQtyError — thông báo tiếng Việt');

test('chứa ntk, target, produced, remaining, overBy', () => {
  const r = checkQtyLimit({ target: 1000, produced: 900, incomingQty: 200, hasLimit: true });
  const msg = formatQtyError(r, '106160');
  for (const token of ['106160', '1.000', '900', '100', '200']) {
    assert.ok(msg.includes(token), `thiếu "${token}" trong: ${msg}`);
  }
});
test('định dạng nghìn kiểu Việt Nam', () => {
  const r = checkQtyLimit({ target: 8030, produced: 8000, incomingQty: 500, hasLimit: true });
  assert.ok(formatQtyError(r, 'X').includes('8.030'), formatQtyError(r, 'X'));
});
test('ok:true → chuỗi rỗng', () => {
  eq(formatQtyError({ ok: true }, '106160'), '');
});
test('result null → chuỗi rỗng', () => {
  eq(formatQtyError(null, '106160'), '');
});
test('mã lỗi lạ → thông báo chung', () => {
  eq(formatQtyError({ ok: false, code: 'SOMETHING' }, 'X'), 'Dữ liệu không hợp lệ.');
});
test('nhãn tiếng Việt đầy đủ dấu', () => {
  eq(OVER_TARGET_TITLE, 'Vượt đơn đặt hàng');
  eq(INVALID_QTY_TITLE, 'Số lượng không hợp lệ');
  assert.ok(INVALID_QTY_MESSAGE.includes('số nguyên không âm'));
});

// ------------------------------------------- AC-ITEM-05: qty≤0 && defectQty≤0
group('Hồi quy AC-ITEM-05 — ô trống hoặc 0 thì không ghi, không lỗi');

test('cả hai ô trống → qty=0, defectQty=0 ⇒ bị chặn bởi điều kiện của AC-ITEM-05', () => {
  const q = readNumberLike('');
  const d = readNumberLike('');
  assert.equal(q.invalid, false);
  assert.equal(d.invalid, false);
  assert.equal(q.value <= 0 && d.value <= 0, true);
});
test("ô nhập '0' → 0, không phải invalid", () => {
  eq(readNumberLike('0').value, 0);
  eq(readNumberLike('0').invalid, false);
});

// Hàm phụ lặp lại logic readNumber của ItemCard để test độc lập UI.
function readNumberLike(raw) {
  if (typeof raw === 'string' && raw.trim() === '') return { value: 0, empty: true, invalid: false };
  const parsed = parseQty(raw);
  if (parsed === null) return { value: 0, empty: false, invalid: true };
  return { value: parsed, empty: false, invalid: false };
}

// ------------------------------------------------------------------- Tổng kết
console.log(`\n${'─'.repeat(50)}`);
console.log(`Kết quả: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nCác test lỗi:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.message.split('\n')[0]}`));
  process.exit(1);
}
console.log('✅ Tất cả unit test FEAT-09 (validateQty) đạt.');
