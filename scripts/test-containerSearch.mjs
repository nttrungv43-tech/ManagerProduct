// scripts/test-containerSearch.mjs
// Kiểm thử chức năng lọc/tìm kiếm container theo mã hàng trong Tab Container.

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

// Logic hàm lọc trích xuất từ useMemo trong ContainersScreen.js
function filterContainers(containers, activeContainerFilter, searchQuery) {
  const q = String(searchQuery || '').trim().toLowerCase();
  return containers.filter(c => {
    // 1. Lọc theo PO
    const matchPo = activeContainerFilter === 'all'
      ? true
      : (c.po === activeContainerFilter || (c.pallets || []).some(p => (p.items || []).some(it => it.po === activeContainerFilter)));
    if (!matchPo) return false;

    // 2. Lọc theo mã hàng hoặc số hiệu nhà máy (order_ref)
    if (!q) return true;
    return (c.pallets || []).some(p =>
      (p.items || []).some(it =>
        String(it.ntk || '').toLowerCase().includes(q) ||
        String(it.order_ref || '').toLowerCase().includes(q)
      )
    );
  });
}

// Dữ liệu container mẫu kiểm thử
const mockContainers = [
  {
    id: 1,
    container_no: 'Container 1',
    po: '2600168',
    pallets: [
      { id: 101, pallet_no: 1, items: [{ id: 1, ntk: '1063022', qty: 660, po: '2600168' }] },
      { id: 102, pallet_no: 2, items: [{ id: 2, ntk: '106160', qty: 300, po: '2600168', order_ref: 'D980470' }] },
    ],
  },
  {
    id: 2,
    container_no: 'Container 2',
    po: '2600189',
    pallets: [
      { id: 201, pallet_no: 1, items: [{ id: 3, ntk: '1063038', qty: 330, po: '2600189' }] },
      { id: 202, pallet_no: 2, items: [{ id: 4, ntk: '1061119', qty: 290, po: '2600189' }] },
    ],
  },
  {
    id: 3,
    container_no: 'Container 3',
    po: '2600168',
    pallets: [
      { id: 301, pallet_no: 1, items: [{ id: 5, ntk: '1063022', qty: 200, po: '2600168' }] },
      {
        id: 302,
        pallet_no: 2,
        is_mixed: true,
        items: [
          { id: 6, ntk: '1061119', qty: 210, po: '2600189' },
          { id: 7, ntk: '1063048', qty: 20, po: '2600189', order_ref: 'D980294' },
        ],
      },
    ],
  },
];

console.log('--- TEST 1: Khi chưa nhập tìm kiếm (searchQuery rỗng) ---');
const r1 = filterContainers(mockContainers, 'all', '');
eq('Trả về đầy đủ 3 container', r1.length, 3);

console.log('\n--- TEST 2: Tìm kiếm chính xác mã hàng "106160" ---');
const r2 = filterContainers(mockContainers, 'all', '106160');
eq('Chỉ tìm thấy 1 container', r2.length, 1);
eq('Đúng là Container 1', r2[0].container_no, 'Container 1');

console.log('\n--- TEST 3: Tìm kiếm mã hàng "1063022" có ở nhiều container ---');
const r3 = filterContainers(mockContainers, 'all', '1063022');
eq('Tìm thấy 2 container', r3.length, 2);
eq('Gồm Container 1', r3[0].container_no, 'Container 1');
eq('Và Container 3', r3[1].container_no, 'Container 3');

console.log('\n--- TEST 4: Tìm mã hàng nằm trong kiện Mix ("1063048") ---');
const r4 = filterContainers(mockContainers, 'all', '1063048');
eq('Chỉ tìm thấy Container 3', r4.length, 1);
eq('Đúng là Container 3', r4[0].container_no, 'Container 3');

console.log('\n--- TEST 5: Tìm kiếm một phần chuỗi ("1061") ---');
const r5 = filterContainers(mockContainers, 'all', '1061');
eq('Tìm thấy cả 3 container vì đều chứa 106160 hoặc 1061119', r5.length, 3);

console.log('\n--- TEST 6: Tìm kiếm không phân biệt hoa thường và khoảng trắng thừa ---');
const r6 = filterContainers(mockContainers, 'all', '   1063048   ');
eq('Bỏ qua khoảng trắng đầu cuối', r6.length, 1);

console.log('\n--- TEST 7: Tìm kiếm mã không tồn tại ("999999") ---');
const r7 = filterContainers(mockContainers, 'all', '999999');
eq('Không tìm thấy container nào', r7.length, 0);

console.log('\n--- TEST 8: Kết hợp bộ lọc PO và tìm kiếm mã hàng ---');
// Lọc PO 2600189 và tìm mã 1061119: Container 2 và Container 3 (chứa kiện mix của PO 2600189)
const r8a = filterContainers(mockContainers, '2600189', '1061119');
eq('PO 2600189 + mã 1061119 ra đúng 2 container', r8a.length, 2);

// Lọc PO 2600189 và tìm mã 106160 (chỉ có ở PO 2600168)
const r8b = filterContainers(mockContainers, '2600189', '106160');
eq('PO 2600189 + mã 106160 không có container nào', r8b.length, 0);

// Lọc PO 2600168 và tìm mã 1063022
const r8c = filterContainers(mockContainers, '2600168', '1063022');
eq('PO 2600168 + mã 1063022 ra đúng 2 container', r8c.length, 2);

console.log('\n--- TEST 9: Xoá từ khoá tìm kiếm khôi phục danh sách theo PO ---');
const r9 = filterContainers(mockContainers, '2600189', '');
eq('Sau khi xoá tìm kiếm khôi phục 2 container của PO 2600189', r9.length, 2);

console.log('\n--- TEST 10: Tìm kiếm theo số hiệu nhà máy order_ref ("D980470") ---');
const r10 = filterContainers(mockContainers, 'all', 'D980470');
eq('Tìm thấy đúng 1 container chứa D980470', r10.length, 1);
eq('Đúng là Container 1', r10[0].container_no, 'Container 1');

console.log('\n--- TEST 11: Tìm kiếm theo số hiệu nằm trong kiện mix ("D980294") ---');
const r11 = filterContainers(mockContainers, 'all', 'D980294');
eq('Tìm thấy đúng Container 3', r11.length, 1);
eq('Đúng là Container 3', r11[0].container_no, 'Container 3');

console.log('\n--- TEST 12: Tìm kiếm một phần số hiệu ("d980") không phân biệt hoa thường ---');
const r12 = filterContainers(mockContainers, 'all', 'd980');
eq('Tìm thấy 2 container chứa D980470 và D980294', r12.length, 2);
eq('Gồm Container 1', r12[0].container_no, 'Container 1');
eq('Và Container 3', r12[1].container_no, 'Container 3');

console.log('\n--- TEST 13: Xác định cờ nổi bật container (isContainerMatched) và đếm số kiện khớp ---');
function getContainerMatchInfo(container, searchQuery) {
  const q = String(searchQuery || '').trim().toLowerCase();
  if (!q) return { isContainerMatched: false, matchingPalletCount: 0, matchingPallets: [] };
  const matchingPallets = (container.pallets || []).filter(p =>
    (p.items || []).some(it =>
      String(it.ntk || '').toLowerCase().includes(q) ||
      String(it.order_ref || '').toLowerCase().includes(q)
    )
  );
  return {
    isContainerMatched: matchingPallets.length > 0,
    matchingPalletCount: matchingPallets.length,
    matchingPallets,
  };
}

const matchInfoC1 = getContainerMatchInfo(mockContainers[0], '106160');
eq('Container 1 khớp mã 106160', matchInfoC1.isContainerMatched, true);
eq('Container 1 có đúng 1 kiện khớp', matchInfoC1.matchingPalletCount, 1);
eq('Kiện khớp đúng là kiện 2 (pallet_no 2)', matchInfoC1.matchingPallets[0].pallet_no, 2);

const matchInfoC2 = getContainerMatchInfo(mockContainers[1], '106160');
eq('Container 2 không khớp mã 106160', matchInfoC2.isContainerMatched, false);
eq('Container 2 có 0 kiện khớp', matchInfoC2.matchingPalletCount, 0);

console.log('\n--- TEST 14: Nổi bật kiện mix (hasMatchedItem) khi tìm mã hoặc số hiệu ref ---');
const matchInfoC3 = getContainerMatchInfo(mockContainers[2], 'D980294');
eq('Container 3 khớp ref D980294', matchInfoC3.isContainerMatched, true);
eq('Container 3 có đúng 1 kiện khớp', matchInfoC3.matchingPalletCount, 1);
eq('Kiện khớp là kiện mix 2', matchInfoC3.matchingPallets[0].pallet_no, 2);

console.log('\n--- TEST 15: Khi không tìm kiếm (searchQuery rỗng), cờ nổi bật luôn là false ---');
const matchInfoEmpty = getContainerMatchInfo(mockContainers[0], '');
eq('searchQuery rỗng => isContainerMatched = false', matchInfoEmpty.isContainerMatched, false);
eq('searchQuery rỗng => 0 kiện khớp', matchInfoEmpty.matchingPalletCount, 0);

console.log(`\nKết quả test-containerSearch: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
