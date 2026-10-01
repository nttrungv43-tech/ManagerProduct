// scripts/test-poSummary.mjs
// FEAT-12 — Unit test hàm thuần trong `src/utils/poSummary.js`.
// Chạy bằng node, KHÔNG cần Expo/SQLite (SPEC-test.md §11.2).
import { poSummaries, poRowLabel, MULTI_PO_LABEL } from '../src/utils/poSummary.js';

/**
 * Tương đương `allPOs()` của store — bản sao cố ý, vì `useAppStore` kéo theo
 * `expo-sqlite` và alias `@/` nên không import được trong test node thuần.
 * Phải giữ đúng logic tách `+` của store.
 */
function allPOs(items) {
  const s = new Set();
  items.forEach(it => it.po.split('+').forEach(p => s.add(p)));
  return [...s];
}

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

/** Tổng một trường của mọi dòng. */
function sum(rows, field) {
  return rows.reduce((s, r) => s + r[field], 0);
}

/** Đúng bộ seed thật trong src/data/seed.js (INV-D1: tổng = 8.030). */
const SEED = [
  { ntk: '106160',  po: '2600168+2600189', target: 1000 },
  { ntk: '106167',  po: '2600189',          target: 600 },
  { ntk: '1061119', po: '2600168+2600189', target: 710 },
  { ntk: '1063022', po: '2600189',          target: 800 },
  { ntk: '1063038', po: '2600168+2600189', target: 1300 },
  { ntk: '1063048', po: '2600168+2600189', target: 2400 },
  { ntk: '1063049', po: '2600189',          target: 580 },
  { ntk: '1063051', po: '2600168+2600189', target: 640 },
];

// ---------- 1. Rỗng ----------
console.log('1) Rỗng & dữ liệu thiếu');
eq('mảng rỗng', poSummaries([]).length, 0);
eq('undefined', poSummaries(undefined).length, 0);
eq('null', poSummaries(null).length, 0);

// ---------- 2. Gom nhóm cơ bản ----------
console.log('2) Gom nhóm theo PO');
{
  const rows = poSummaries([
    { ntk: 'A', po: 'P1', target: 100, produced: 40 },
    { ntk: 'B', po: 'P1', target: 200, produced: 60 },
    { ntk: 'C', po: 'P2', target: 50, produced: 0 },
  ]);
  eq('số nhóm', rows.length, 2);
  const p1 = rows.find(r => r.label === 'P1');
  eq('P1 target', p1.target, 300);
  eq('P1 produced', p1.produced, 100);
  eq('P1 remaining', p1.remaining, 200);
  eq('P1 itemCount', p1.itemCount, 2);
  eq('P1 pct', p1.pct, Math.round((100 / 300) * 1000) / 10);
  const p2 = rows.find(r => r.label === 'P2');
  eq('P2 target', p2.target, 50);
  eq('P2 remaining = target', p2.remaining, 50);
}

// ---------- 3. Quy tắc nhiều PO: KHÔNG cộng vào PO nào ----------
console.log('3) Mã thuộc nhiều PO ⇒ gom nhóm riêng, KHÔNG cộng vào PO nào');
{
  const items = [
    { ntk: 'X', po: 'A+B', target: 100, produced: 10 },
    { ntk: 'Y', po: 'C',   target: 20,  produced: 5 },
  ];
  const rows = poSummaries(items, allPOs(items));
  const multi = rows.find(r => r.isMulti);
  eq('có 1 nhóm nhiều PO', multi.label, `${MULTI_PO_LABEL} (1 mã)`);
  eq('nhóm nhiều PO gom đủ target', multi.target, 100);
  eq('nhóm nhiều PO gom đủ remaining', multi.remaining, 90);
  // AC-ITEM-24: PO có mã thuộc riêng vẫn có dòng, nhưng KHÔNG được cộng phần của mã nhiều PO.
  eq('dòng "A" tồn tại (AC-ITEM-24)', rows.find(r => r.label === 'A').target, 0);
  eq('dòng "B" tồn tại (AC-ITEM-24)', rows.find(r => r.label === 'B').target, 0);
  eq('dòng "A" không cộng nhầm', rows.find(r => r.label === 'A').itemCount, 0);
  eq('nhóm C giữ nguyên', rows.find(r => r.label === 'C').target, 20);
  eq('INV-D6: Σ dòng == tổng toàn đơn', sum(rows, 'target'), 120);
}

// ---------- 4. Nhiều mã nhiều PO vẫn là MỘT nhóm ----------
console.log('4) Nhiều mã nhiều PO ⇒ vẫn MỘT nhóm nhiều PO');
{
  const items = [
    { ntk: 'X', po: 'A+B', target: 100 },
    { ntk: 'Y', po: 'A+B', target: 300 },
    { ntk: 'Z', po: 'A+B', target: 50 },
  ];
  const rows = poSummaries(items, allPOs(items));
  eq('chỉ 1 nhóm nhiều PO', rows.filter(r => r.isMulti).length, 1);
  const multi = rows.find(r => r.isMulti);
  eq('itemCount = 3', multi.itemCount, 3);
  eq('target gộp', multi.target, 450);
  eq('nhãn', multi.label, `${MULTI_PO_LABEL} (3 mã)`);
  eq('A = 0', rows.find(r => r.label === 'A').target, 0);
  eq('B = 0', rows.find(r => r.label === 'B').target, 0);
  eq('INV-D6: Σ dòng == tổng toàn đơn', sum(rows, 'target'), 450);
}

// ---------- 5. A+B và B+A phải CÙNG nhóm ----------
console.log('5) A+B và B+A ⇒ cùng nhóm');
{
  const items = [
    { ntk: 'X', po: 'A+B', target: 100 },
    { ntk: 'Y', po: 'B+A', target: 250 },
  ];
  const rows = poSummaries(items, allPOs(items));
  eq('chỉ 1 dòng nhiều PO', rows.filter(r => r.isMulti).length, 1);
  eq('gộp cả hai', rows[0].target, 350);
  eq('itemCount = 2', rows[0].itemCount, 2);
  eq('INV-D6: Σ dòng == tổng toàn đơn', sum(rows, 'target'), 350);
}

// ---------- 6. remaining âm => 0 ----------
console.log('6) Sản xuất vượt kế hoạch => còn lại = 0');
{
  const rows = poSummaries([{ ntk: 'A', po: 'P1', target: 100, produced: 250 }]);
  eq('remaining không âm', rows[0].remaining, 0);
  eq('produced giữ nguyên', rows[0].produced, 250);
  check('pct có thể > 100', rows[0].pct > 100);
}

// ---------- 7. target = 0 không crash ----------
console.log('7) target = 0');
{
  const rows = poSummaries([
    { ntk: 'A', po: 'P1', target: 0, produced: 0 },
    { ntk: 'B', po: 'P2', target: 10, produced: 0 },
  ]);
  eq('P1 pct = 0', rows.find(r => r.label === 'P1').pct, 0);
  eq('P1 remaining = 0', rows.find(r => r.label === 'P1').remaining, 0);
}

// ---------- 8. Sắp xếp ----------
console.log('8) Sắp xếp');
{
  const rows = poSummaries([
    { ntk: 'A', po: 'P1', target: 50 },
    { ntk: 'B', po: 'P2', target: 900 },
    { ntk: 'C', po: 'P3', target: 100 },
  ]);
  eq('target giảm dần', rows.map(r => r.target).join(','), '900,100,50');
}
{
  const rows = poSummaries([
    { ntk: 'A', po: 'ZZZ', target: 100 },
    { ntk: 'B', po: 'AAA', target: 100 },
  ]);
  eq('bằng target ⇒ tên tăng dần', rows.map(r => r.label).join(','), 'AAA,ZZZ');
}

// ---------- 9. INV-D6: Σ dòng == tổng toàn đơn (bộ số seed thật) ----------
console.log('9) INV-D6 — Σ bảng PO khớp tổng toàn đơn');
{
  const rows = poSummaries(SEED, allPOs(SEED));
  eq('tổng target của items', SEED.reduce((s, i) => s + i.target, 0), 8030);
  eq('Σ target của bảng PO', sum(rows, 'target'), 8030);
  eq('số dòng', rows.length, 3);
  eq('PO 2600168 = 0', rows.find(r => r.label === '2600168').target, 0);
  eq('PO 2600189 = 1.980', rows.find(r => r.label === '2600189').target, 1980);
  const multi = rows.find(r => r.isMulti);
  eq('nhiều PO = 6.050', multi.target, 6050);
  eq('nhiều PO = 5 mã', multi.itemCount, 5);
  eq('nhãn', multi.label, `${MULTI_PO_LABEL} (5 mã)`);
  eq('tổng itemCount = 8', sum(rows, 'itemCount'), 8);
}

// ---------- 10. INV-D6 với dữ liệu đã nhập sản xuất ----------
console.log('10) INV-D6 khi đã nhập sản xuất');
{
  const produced = SEED.map((it, i) => ({ ...it, produced: i * 100, defect: i }));
  const rows = poSummaries(produced, allPOs(produced));
  eq('Σ produced == tổng produced', sum(rows, 'produced'), produced.reduce((s, i) => s + i.produced, 0));
  eq('Σ remaining == tổng remaining',
    sum(rows, 'remaining'),
    produced.reduce((s, i) => s + Math.max(i.target - i.produced, 0), 0));
  eq('Σ target vẫn = 8.030', sum(rows, 'target'), 8030);
}

// ---------- 11. Chống lỗi dữ liệu thiếu ----------
console.log('11) Dữ liệu thiếu / null');
{
  const rows = poSummaries([
    { ntk: 'A', po: 'P1', target: 10, produced: null, defect: null },
    { ntk: 'B', po: 'P2' },
  ]);
  eq('produced null → 0', rows.find(r => r.label === 'P1').produced, 0);
  eq('defect null → 0', rows.find(r => r.label === 'P1').defect, 0);
  eq('target thiếu → 0', rows.find(r => r.label === 'P2').target, 0);
  eq('pct thiếu → 0', rows.find(r => r.label === 'P2').pct, 0);
}

// ---------- 12. poRowLabel ----------
console.log('12) poRowLabel');
eq('PO thường', poRowLabel({ isMulti: false, label: '2600189' }), '2600189');
eq('nhiều PO', poRowLabel({ isMulti: true, itemCount: 5 }), `${MULTI_PO_LABEL} (5 mã)`);
eq('undefined', poRowLabel(undefined), '');

console.log(`\nKết quả: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);