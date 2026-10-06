// scripts/test-refFormat.mjs
// FEAT-22 — Unit test hàm thuần `src/utils/refFormat.js` (hiển thị số hiệu nhà máy).
// FEAT-23 — thêm helper tiến độ + nhập theo số hiệu.
// Chạy: node --no-warnings scripts/test-refFormat.mjs
import {
  normalizeRefs, hasRefs, refLabel, refLines,
  normalizeRefProgress, hasRefProgress, refProgressText, unattributedText, formatRefOverLimit,
} from '../src/utils/refFormat.js';

let pass = 0;
let fail = 0;
const failures = [];
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failures.push(`${label}\n      nhận: ${JSON.stringify(actual)}\n      cần : ${JSON.stringify(expected)}`));
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : ` — ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`}`);
};
const check = (label, cond) => eq(label, !!cond, true);

// ══════════════════════════════════════════════════════════════════════
console.log('1) `normalizeRefs` — chuẩn hoá dữ liệu từ tầng DB');
// ══════════════════════════════════════════════════════════════════════
eq('mảng rỗng → []', normalizeRefs([]), []);
eq('null → []', normalizeRefs(null), []);
eq('undefined → []', normalizeRefs(undefined), []);
eq('không phải mảng → []', normalizeRefs('abc'), []);

eq('1 ref giữ nguyên', normalizeRefs([{ ref_no: 'D980159', target: 74 }]),
  [{ ref_no: 'D980159', target: 74 }]);

eq('nhiều ref được sắp xếp tăng dần theo ref_no', normalizeRefs([
  { ref_no: 'D980781', target: 80 },
  { ref_no: 'D980470', target: 477 },
  { ref_no: 'D980973', target: 159 },
]), [
  { ref_no: 'D980470', target: 477 },
  { ref_no: 'D980781', target: 80 },
  { ref_no: 'D980973', target: 159 },
]);

// Dữ liệu bẩn từ GROUP_CONCAT/SQLite không được làm hỏng màn hình.
eq('ref_no rỗng / khoảng trắng bị bỏ', normalizeRefs([
  { ref_no: '', target: 10 },
  { ref_no: '   ', target: 10 },
  { ref_no: null, target: 10 },
  { ref_no: undefined, target: 10 },
  { ref_no: 'D1', target: 5 },
]), [{ ref_no: 'D1', target: 5 }]);

eq('ref_no có khoảng trắng thừa được trim', normalizeRefs([{ ref_no: '  D980159  ', target: 74 }]),
  [{ ref_no: 'D980159', target: 74 }]);

eq('target không phải số ⇒ 0 (không để NaN lọt ra màn hình)', normalizeRefs([
  { ref_no: 'D1', target: 'abc' },
  { ref_no: 'D2' },
  { ref_no: 'D3', target: null },
]), [
  { ref_no: 'D1', target: 0 },
  { ref_no: 'D2', target: 0 },
  { ref_no: 'D3', target: 0 },
]);

eq('target là số dạng chuỗi vẫn ép được', normalizeRefs([{ ref_no: 'D1', target: '159' }]),
  [{ ref_no: 'D1', target: 159 }]);

eq('target = 0 hợp lệ (không coi là thiếu dữ liệu)', normalizeRefs([{ ref_no: 'D1', target: 0 }]),
  [{ ref_no: 'D1', target: 0 }]);

eq('ref trùng chỉ giữ lần đầu', normalizeRefs([
  { ref_no: 'D1', target: 100 },
  { ref_no: 'D1', target: 999 },
]), [{ ref_no: 'D1', target: 100 }]);

eq('dòng thiếu object không làm hỏng cả danh sách', normalizeRefs([null, undefined, { ref_no: 'D1', target: 5 }]),
  [{ ref_no: 'D1', target: 5 }]);

// ══════════════════════════════════════════════════════════════════════
console.log('2) `hasRefs` / `refLabel` — quyết định ẩn (INV-I1)');
// ══════════════════════════════════════════════════════════════════════
eq('rỗng ⇒ false (ẩn cả khối)', hasRefs([]), false);
eq('null ⇒ false', hasRefs(null), false);
eq('chỉ ref rỗng ⇒ false', hasRefs([{ ref_no: '', target: 10 }]), false);
eq('có 1 ref ⇒ true', hasRefs([{ ref_no: 'D1', target: 5 }]), true);

eq('không có ref ⇒ nhãn rỗng', refLabel([]), '');
eq('1 ref ⇒ "Số hiệu" (không ghi "(1)")', refLabel([{ ref_no: 'D980159', target: 74 }]), 'Số hiệu');
eq('2 ref ⇒ "Số hiệu (2)"', refLabel([{ ref_no: 'A', target: 1 }, { ref_no: 'B', target: 2 }]), 'Số hiệu (2)');
eq('3 ref ⇒ "Số hiệu (3)"', refLabel([
  { ref_no: 'D980470', target: 477 }, { ref_no: 'D980781', target: 80 }, { ref_no: 'D980973', target: 159 },
]), 'Số hiệu (3)');

// Nhãn phải nói rõ "nhiều số hiệu" — đó là trường hợp đặc biệt người dùng cần để ý.
check('nhãn nhiều ref nêu rõ số lượng', refLabel([{ ref_no: 'A', target: 1 }, { ref_no: 'B', target: 2 }]).includes('(2)'));

// ══════════════════════════════════════════════════════════════════════
console.log('3) `refLines` — dòng hiển thị từng ref kèm số lượng');
// ══════════════════════════════════════════════════════════════════════
eq('không có ref ⇒ không có dòng nào', refLines([]), []);
eq('1 ref có số lượng', refLines([{ ref_no: 'D980159', target: 74 }]), ['D980159 — 74 pcs']);
eq('thứ tự dòng khớp thứ tự sắp xếp', refLines([
  { ref_no: 'D980973', target: 159 }, { ref_no: 'D980470', target: 477 },
]), ['D980470 — 477 pcs', 'D980973 — 159 pcs']);

// Dữ liệu thật của Dmac.json: PO 2919 / 1063048GF có 3 ref, tổng = 716 = `order_lines.target`.
eq('3 ref của 1063048GF (PO 2919) — số thật từ Dmac.json', refLines([
  { ref_no: 'D980470', target: 477 },
  { ref_no: 'D980973', target: 159 },
  { ref_no: 'D980781', target: 80 },
]), ['D980470 — 477 pcs', 'D980781 — 80 pcs', 'D980973 — 159 pcs']);

// Số lượng phải đọc kiểu Việt Nam (dấu chấm phân tách nghìn) — cùng quy ước `ItemCard` đang dùng.
eq('số lượng lớn hiển thị kiểu Việt Nam', refLines([{ ref_no: 'D1', target: 25520 }]), ['D1 — 25.520 pcs']);
eq('số lượng thập phân theo locale vi-VN (dấu phẩy thập phân)', refLines([{ ref_no: 'D1', target: 12.345 }]),
  ['D1 — 12,35 pcs']);
eq('target 0 vẫn hiện dòng (có ref, chỉ là chưa đủ số lượng)',
  refLines([{ ref_no: 'D1', target: 0 }]), ['D1 — 0 pcs']);

// ══════════════════════════════════════════════════════════════════════
console.log('4) Hồi quy — 7 thẻ từng sai nếu đọc ref theo mã thay vì theo PO');
// ══════════════════════════════════════════════════════════════════════
{
  // (PO, mã) → ref đúng của riêng PO đó, đo từ Dmac.json
  const cases = [
    ['2919', '106385GF', ['D980159']],
    ['2921', '106385GF', ['D980077']],
    ['2924', '1072014GF', ['D580422']],
    ['2926', '1072014GF', ['D581032']],
    ['2927', '106263GF', ['D980294']],
    ['2928', '106263GF', ['D980294']],
    ['2929', '1072014GF', ['D580422']],
  ];
  // ref ở tầng MÃ (item-level) — đây là thứ `item_refs` trả về và là nguồn của 7 lỗi sai.
  const itemLevel = {
    '106385GF': ['D980159', 'D980077'],
    '1072014GF': ['D580422', 'D581032'],
    '106263GF': ['D981041', 'D980294'],
  };
  for (const [po, ntk, expected] of cases) {
    const got = refLines(expected.map(ref_no => ({ ref_no, target: 1 })));
    const shown = expected.map(r => r.replace(/ — .*/, ''));
    eq(`PO ${po} / ${ntk} chỉ hiện ref của riêng PO`, shown, expected);
    // Chứng minh lỗi: nếu lấy theo mã thì thẻ này sẽ hiện thừa ref của PO khác.
    check(`PO ${po} / ${ntk}: item-level (${itemLevel[ntk].length} ref) ≠ ref của riêng PO này`,
      itemLevel[ntk].length !== expected.length || itemLevel[ntk].join() !== expected.join());
    check(`PO ${po} / ${ntk}: có ít nhất 1 dòng hiển thị`, got.length > 0);
  }
}

// ══════════════════════════════════════════════════════════════════════
console.log('— FEAT-23: tiến độ + nhập theo số hiệu —');
// ══════════════════════════════════════════════════════════════════════
{
  eq('normalizeRefProgress: số từ chuỗi → số', 
    normalizeRefProgress([
      { ref_no: 'D980470', produced: '200', target: '477' },
      { ref_no: 'D980781', produced: '50', target: '80' },
    ]),
    [{ ref_no: 'D980470', produced: 200, target: 477 },
     { ref_no: 'D980781', produced: 50, target: 80 }]);

  eq('normalizeRefProgress: SẮP LẠI theo ref_no (tất định, không phụ thuộc thứ tự quét SQL)',
    normalizeRefProgress([
      { ref_no: 'D980781', produced: 0, target: 80 },
      { ref_no: 'D980470', produced: 0, target: 477 },
    ]).map(r => r.ref_no),
    ['D980470', 'D980781']);
  eq('…thứ tự đó KHỚP normalizeRefs ⇒ khối "số hiệu" và khối "nhập theo số hiệu" cùng thứ tự',
    normalizeRefProgress([
      { ref_no: 'D980781', produced: 0, target: 80 },
      { ref_no: 'D980470', produced: 0, target: 477 },
    ]).map(r => r.ref_no),
    normalizeRefs([
      { ref_no: 'D980781', target: 80 },
      { ref_no: 'D980470', target: 477 },
    ]).map(r => r.ref_no));

  eq('normalizeRefProgress: NaN/undefined → 0 (không để "NaN" lọt ra màn hình)',
    normalizeRefProgress([{ ref_no: 'D980470', produced: 'x', target: null }]),
    [{ ref_no: 'D980470', produced: 0, target: 0 }]);

  eq('normalizeRefProgress: bỏ ref rỗng (AC-RF-07 — không bịa ref)',
    normalizeRefProgress([{ ref_no: '', produced: 5, target: 5 }, { ref_no: null }]), []);

  eq('normalizeRefProgress: bỏ ref trùng (view GROUP_CONCAT có thể lặp khi ref vừa gắp vừa có target)',
    normalizeRefProgress([
      { ref_no: 'D980470', produced: 10, target: 477 },
      { ref_no: 'D980470', produced: 20, target: 477 },
    ]).length, 1);

  eq('normalizeRefProgress: input không phải mảng → [] (thiếu cột không được làm vỡ render)',
    [normalizeRefProgress(null), normalizeRefProgress(undefined), normalizeRefProgress('x')], [[], [], []]);

  eq('hasRefProgress: rỗng ⇒ ẩn khối nhập (AC-RF-10)',
    [hasRefProgress([]), hasRefProgress(null), hasRefProgress([{ ref_no: 'D980470', produced: 0, target: 5 }])],
    [false, false, true]);

  eq('refProgressText: "Đã làm 200/477 · Còn lại 277"',
    refProgressText({ produced: 200, target: 477 }), 'Đã làm 200/477 · Còn lại 277');
  eq('refProgressText: vượt kế hoạch (200/150) KHÔNG hiện "Còn lại -50"',
    refProgressText({ produced: 200, target: 150 }), 'Đã làm 200/150 · Còn lại 0');
  eq('refProgressText: định dạng kiểu VN có dấu chấm phân tách nghìn',
    refProgressText({ produced: 12345, target: 123456 }), 'Đã làm 12.345/123.456 · Còn lại 111.111');
  eq('refProgressText: phần thập phân giữ nguyên tối đa 2 chữ số',
    refProgressText({ produced: 12.345, target: 100 }), 'Đã làm 12,35/100 · Còn lại 87,65');

  eq('unattributedText: > 0 thì báo, 0/rỗng thì im (AC-RF-08)',
    [unattributedText(20), unattributedText(0), unattributedText(null), unattributedText(NaN)],
    ['chưa gắn số hiệu: 20 pcs', '', '', '']);

  eq('unattributedText: dùng dấu phân tách VN',
    unattributedText(1234), 'chưa gắn số hiệu: 1.234 pcs');

  // Lỗi `fail()` của queries.js là `{ code, … }` — KHÔNG có `ok`. Test này chốt lại
  // `formatRefOverLimit` không được đòi `ok === false`, nếu không mọi cảnh báo sẽ rơi về
  // thông báo chung và người dùng không biết mình vượt hạn mức số hiệu nào.
  eq('formatRefOverLimit: chấp nhận lỗi dạng { code } của fail()',
    formatRefOverLimit({ code: 'OVER_TARGET', ref_no: 'D980470', target: 477, produced: 200, remaining: 277, incomingQty: 300, overBy: 23 }),
    'Số hiệu D980470: kế hoạch 477, đã làm 200. Chỉ còn nhập tối đa 277 (bạn nhập 300, vượt 23).');
  eq('formatRefOverLimit: chấp nhận cả kết quả thô có ok:false',
    formatRefOverLimit({ ok: false, code: 'OVER_TARGET', ref_no: 'D980470', target: 477, produced: 200, remaining: 277, incomingQty: 300, overBy: 23 }).includes('D980470'), true);
  eq('formatRefOverLimit: lỗi KHÁC thì im (không bịa nhãn vượt hạn mức)',
    [formatRefOverLimit({ code: 'INVALID_QTY' }), formatRefOverLimit({ code: 'OVER_TARGET' }), formatRefOverLimit(null), formatRefOverLimit(undefined)],
    ['', '', '', '']);
}

console.log(`\nKết quả: ${pass} passed, ${fail} failed`);
if (failures.length) console.error('Các ca lỗi:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);