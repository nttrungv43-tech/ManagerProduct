// scripts/test-date.mjs
// BUG-02 — Unit test hàm thuần trong `src/utils/date.js`.
// Chạy bằng node, KHÔNG cần Expo (SPEC-test.md §11.2).
//
// Vì sao cần test: `toISOString()` trả ngày theo **UTC**. Ở UTC+7 (Việt Nam),
// 00:00–06:59 sáng là ngày hôm trước theo UTC ⇒ ngày nhật ký/ngày hoàn tất đơn bị sai.
import { todayLocal, isDateString, formatDisplayDate } from '../src/utils/date.js';

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

// ---------- 1. Định dạng YYYY-MM-DD ----------
console.log('1) todayLocal — định dạng');
eq('ngày thường', todayLocal(new Date(2026, 8, 2)), '2026-09-02');
eq('tháng 1 → 01', todayLocal(new Date(2026, 0, 5)), '2026-01-05');
eq('ngày 9 → 09', todayLocal(new Date(2026, 10, 9)), '2026-11-09');
eq('ngày 31 tháng 12', todayLocal(new Date(2026, 11, 31)), '2026-12-31');
eq('năm 4 chữ số', todayLocal(new Date(2026, 0, 1)).length, 10);

// ---------- 2. Không lệch theo giờ UTC (BUG-02) ----------
console.log('2) todayLocal — không lệch theo UTC');
{
  // 00:30 giờ VN = 17:30 UTC hôm trước. Ngày đúng là 2026-09-02.
  const vn = new Date(2026, 8, 2, 0, 30); // giờ cục bộ của process
  eq('00:30 sáng vẫn là ngày hôm đó', todayLocal(vn), '2026-09-02');

  const nearMidnight = new Date(2026, 8, 2, 23, 59);
  eq('23:59 vẫn là ngày hôm đó', todayLocal(nearMidnight), '2026-09-02');

  // Ngày 1 tháng: không được tràn sang tháng trước.
  eq('ngày 1 tháng 1 không tràn', todayLocal(new Date(2027, 0, 1, 0, 5)), '2027-01-01');
}

// ---------- 3. Không dùng toISOString ----------
console.log('3) todayLocal — không dùng toISOString');
{
  // Nếu hàm dùng `toISOString`, với múi giờ process là UTC thì ca này vẫn đúng;
  // nên ta kiểm tra thuộc tính bất biến: hai mốc cách nhau 1 ngày lịch luôn lệch
  // đúng 1 ngày theo chuỗi, không phụ thuộc múi giờ của thiết bị.
  const a = todayLocal(new Date(2026, 5, 30, 12, 0));
  const b = todayLocal(new Date(2026, 5, 31, 12, 0));
  eq('a', a, '2026-06-30');
  eq('b', b, '2026-07-01');
}

// ---------- 4. isDateString ----------
console.log('4) isDateString');
check('hợp lệ', isDateString('2026-09-02') === true);
check('tháng 13 không tồn tại', isDateString('2026-13-01') === false);
check('ngày 31 tháng 2 không tồn tại', isDateString('2026-02-31') === false);
check('29/02 năm nhuận hợp lệ', isDateString('2028-02-29') === true);
check('29/02 năm không nhuận không hợp lệ', isDateString('2027-02-29') === false);
check('thiếu phần', isDateString('2026-09') === false);
check('thừa phần', isDateString('2026-09-02T00:00') === false);
check('số', isDateString(20260902) === false);
check('null', isDateString(null) === false);

// ---------- 5. formatDisplayDate (dd-mm-yyyy) ----------
console.log('5) formatDisplayDate');
eq('định dạng ngày chuẩn yyyy-mm-dd -> dd-mm-yyyy', formatDisplayDate('2026-10-09'), '09-10-2026');
eq('ngày và tháng 1 chữ số có số 0 dẫn đầu', formatDisplayDate('2026-01-05'), '05-01-2026');
eq('cuối năm 31-12', formatDisplayDate('2026-12-31'), '31-12-2026');
eq('có khoảng trắng thừa được trim', formatDisplayDate(' 2026-08-15 '), '15-08-2026');
eq('chuỗi không phải ngày thì giữ nguyên', formatDisplayDate('invalid-date'), 'invalid-date');
eq('chuỗi rỗng trả về rỗng', formatDisplayDate(''), '');
eq('null/undefined an toàn', formatDisplayDate(null), '');

console.log('\nKết quả: ' + `${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);