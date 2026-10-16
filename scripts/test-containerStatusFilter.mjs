// scripts/test-containerStatusFilter.mjs
// Kiểm thử chức năng lọc kiện theo trạng thái (Chưa dán nhãn, Chưa đủ SL, Bị cả 2)
// và kiểm thử Phương án A (ẩn kiện hoàn thành khi lọc) cùng 3 bộ đếm tổng quan.

import { getItemPackInfo, checkItemStatus, checkPalletStatus, isPalletMatchingStatus } from '../src/utils/packStatus.js';

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

console.log('--- 1. Kiểm thử getItemPackInfo & checkItemStatus ---');

// Ca 1.1: Sản phẩm đã hoàn tất 100% (đủ SL + đã dán nhãn)
{
  const item = { id: 1, qty: 100, packed_qty: 100, is_labeled: 1, done: 1 };
  const st = checkItemStatus(item);
  eq('1.1.1 isFullQty = true', st.isFullQty, true);
  eq('1.1.2 isLabeled = true', st.isLabeled, true);
  eq('1.1.3 isComplete = true', st.isComplete, true);
  eq('1.1.4 isUnlabeled = false', st.isUnlabeled, false);
  eq('1.1.5 isIncomplete = false', st.isIncomplete, false);
  eq('1.1.6 isBoth = false', st.isBoth, false);
}

// Ca 1.2: Sản phẩm đủ SL nhưng chưa dán nhãn
{
  const item = { id: 2, qty: 100, packed_qty: 100, is_labeled: 0, done: 0 };
  const st = checkItemStatus(item);
  eq('1.2.1 isFullQty = true', st.isFullQty, true);
  eq('1.2.2 isLabeled = false', st.isLabeled, false);
  eq('1.2.3 isComplete = false', st.isComplete, false);
  eq('1.2.4 isUnlabeled = true', st.isUnlabeled, true);
  eq('1.2.5 isIncomplete = false', st.isIncomplete, false);
  eq('1.2.6 isBoth = false', st.isBoth, false);
}

// Ca 1.3: Sản phẩm chưa đủ SL nhưng đã dán nhãn
{
  const item = { id: 3, qty: 100, packed_qty: 40, is_labeled: 1, done: 0 };
  const st = checkItemStatus(item);
  eq('1.3.1 isFullQty = false', st.isFullQty, false);
  eq('1.3.2 isLabeled = true', st.isLabeled, true);
  eq('1.3.3 isUnlabeled = false', st.isUnlabeled, false);
  eq('1.3.4 isIncomplete = true', st.isIncomplete, true);
  eq('1.3.5 isBoth = false', st.isBoth, false);
}

// Ca 1.4: Sản phẩm bị cả 2 (thiếu SL và chưa dán nhãn)
{
  const item = { id: 4, qty: 100, packed_qty: 30, is_labeled: 0, done: 0 };
  const st = checkItemStatus(item);
  eq('1.4.1 isFullQty = false', st.isFullQty, false);
  eq('1.4.2 isLabeled = false', st.isLabeled, false);
  eq('1.4.3 isUnlabeled = true', st.isUnlabeled, true);
  eq('1.4.4 isIncomplete = true', st.isIncomplete, true);
  eq('1.4.5 isBoth = true', st.isBoth, true);
}

console.log('--- 2. Kiểm thử checkPalletStatus & isPalletMatchingStatus (Kiện 1 mã & Kiện nhiều mã) ---');

// Ca 2.1: Kiện đơn mã hoàn thành
{
  const pDone = {
    id: 101,
    pallet_no: 1,
    items: [{ id: 1, qty: 200, packed_qty: 200, is_labeled: 1, done: 1 }],
  };
  const ps = checkPalletStatus(pDone);
  eq('2.1.1 hasUnlabeled = false', ps.hasUnlabeled, false);
  eq('2.1.2 hasIncomplete = false', ps.hasIncomplete, false);
  eq('2.1.3 hasBoth = false', ps.hasBoth, false);
  eq('2.1.4 match all = true', isPalletMatchingStatus(pDone, 'all'), true);
  eq('2.1.5 match unlabeled = false', isPalletMatchingStatus(pDone, 'unlabeled'), false);
  eq('2.1.6 match incomplete = false', isPalletMatchingStatus(pDone, 'incomplete'), false);
  eq('2.1.7 match both = false', isPalletMatchingStatus(pDone, 'both'), false);
}

// Ca 2.2: Kiện đơn mã chưa dán nhãn
{
  const pUnlabeled = {
    id: 102,
    pallet_no: 2,
    items: [{ id: 2, qty: 200, packed_qty: 200, is_labeled: 0, done: 0 }],
  };
  const ps = checkPalletStatus(pUnlabeled);
  eq('2.2.1 hasUnlabeled = true', ps.hasUnlabeled, true);
  eq('2.2.2 hasIncomplete = false', ps.hasIncomplete, false);
  eq('2.2.3 hasBoth = false', ps.hasBoth, false);
  eq('2.2.4 match unlabeled = true', isPalletMatchingStatus(pUnlabeled, 'unlabeled'), true);
  eq('2.2.5 match incomplete = false', isPalletMatchingStatus(pUnlabeled, 'incomplete'), false);
  eq('2.2.6 match both = false', isPalletMatchingStatus(pUnlabeled, 'both'), false);
}

// Ca 2.3: Kiện đơn mã chưa đủ SL (đã dán nhãn)
{
  const pIncomplete = {
    id: 103,
    pallet_no: 3,
    items: [{ id: 3, qty: 200, packed_qty: 150, is_labeled: 1, done: 0 }],
  };
  const ps = checkPalletStatus(pIncomplete);
  eq('2.3.1 hasUnlabeled = false', ps.hasUnlabeled, false);
  eq('2.3.2 hasIncomplete = true', ps.hasIncomplete, true);
  eq('2.3.3 hasBoth = false', ps.hasBoth, false);
  eq('2.3.4 match unlabeled = false', isPalletMatchingStatus(pIncomplete, 'unlabeled'), false);
  eq('2.3.5 match incomplete = true', isPalletMatchingStatus(pIncomplete, 'incomplete'), true);
  eq('2.3.6 match both = false', isPalletMatchingStatus(pIncomplete, 'both'), false);
}

// Ca 2.4: Kiện đơn mã bị cả 2
{
  const pBoth = {
    id: 104,
    pallet_no: 4,
    items: [{ id: 4, qty: 200, packed_qty: 150, is_labeled: 0, done: 0 }],
  };
  const ps = checkPalletStatus(pBoth);
  eq('2.4.1 hasUnlabeled = true', ps.hasUnlabeled, true);
  eq('2.4.2 hasIncomplete = true', ps.hasIncomplete, true);
  eq('2.4.3 hasBoth = true', ps.hasBoth, true);
  eq('2.4.4 match unlabeled = true', isPalletMatchingStatus(pBoth, 'unlabeled'), true);
  eq('2.4.5 match incomplete = true', isPalletMatchingStatus(pBoth, 'incomplete'), true);
  eq('2.4.6 match both = true', isPalletMatchingStatus(pBoth, 'both'), true);
}

// Ca 2.5: Kiện nhiều mã (Mã 1 chưa dán nhãn nhưng đủ SL, Mã 2 chưa đủ SL nhưng đã nhãn)
// => Kiện này đồng thời bị cả 2 lỗi ở cấp độ kiện!
{
  const pMix = {
    id: 105,
    pallet_no: 5,
    items: [
      { id: 5, qty: 100, packed_qty: 100, is_labeled: 0, done: 0 },
      { id: 6, qty: 100, packed_qty: 50, is_labeled: 1, done: 0 },
    ],
  };
  const ps = checkPalletStatus(pMix);
  eq('2.5.1 hasUnlabeled = true', ps.hasUnlabeled, true);
  eq('2.5.2 hasIncomplete = true', ps.hasIncomplete, true);
  eq('2.5.3 hasBoth = true (cross-item)', ps.hasBoth, true);
  eq('2.5.4 match unlabeled = true', isPalletMatchingStatus(pMix, 'unlabeled'), true);
  eq('2.5.5 match incomplete = true', isPalletMatchingStatus(pMix, 'incomplete'), true);
  eq('2.5.6 match both = true', isPalletMatchingStatus(pMix, 'both'), true);
}

console.log('--- 3. Kiểm thử lọc Container & Kiện theo Phương án A ---');

const mockContainers = [
  {
    id: 1,
    container_no: 'CONT-01',
    po: 'PO-A',
    pallets: [
      // P1: Hoàn thành 100%
      { id: 1, pallet_no: 1, items: [{ id: 1, qty: 100, packed_qty: 100, is_labeled: 1, done: 1, po: 'PO-A' }] },
      // P2: Chưa dán nhãn
      { id: 2, pallet_no: 2, items: [{ id: 2, qty: 100, packed_qty: 100, is_labeled: 0, done: 0, po: 'PO-A' }] },
      // P3: Chưa đủ SL
      { id: 3, pallet_no: 3, items: [{ id: 3, qty: 100, packed_qty: 50, is_labeled: 1, done: 0, po: 'PO-A' }] },
      // P4: Bị cả hai
      { id: 4, pallet_no: 4, items: [{ id: 4, qty: 100, packed_qty: 50, is_labeled: 0, done: 0, po: 'PO-A' }] },
    ],
  },
  {
    id: 2,
    container_no: 'CONT-02',
    po: 'PO-A',
    pallets: [
      // Toàn bộ kiện đều hoàn thành 100%
      { id: 5, pallet_no: 1, items: [{ id: 5, qty: 100, packed_qty: 100, is_labeled: 1, done: 1, po: 'PO-A' }] },
      { id: 6, pallet_no: 2, items: [{ id: 6, qty: 100, packed_qty: 100, is_labeled: 1, done: 1, po: 'PO-A' }] },
    ],
  },
  {
    id: 3,
    container_no: 'CONT-03',
    po: 'PO-B',
    pallets: [
      // Kiện PO-B chưa dán nhãn
      { id: 7, pallet_no: 1, items: [{ id: 7, qty: 80, packed_qty: 80, is_labeled: 0, done: 0, po: 'PO-B' }] },
    ],
  },
];

// Hàm lọc tương tự useMemo trong ContainersScreen
function applyContainerFilter(containers, activeContainerFilter, activeStatusFilter, searchQuery = '') {
  const isFilteringStatus = activeStatusFilter !== 'all';
  const q = searchQuery.trim().toLowerCase();

  return (containers || []).map(c => {
    const matchPo = activeContainerFilter === 'all'
      ? true
      : (c.po === activeContainerFilter || (c.pallets || []).some(p => (p.items || []).some(it => it.po === activeContainerFilter)));
    if (!matchPo) return null;

    const sortedPallets = (c.pallets ?? []).sort((a, b) => a.pallet_no - b.pallet_no);

    const matchingPallets = sortedPallets.filter(p => {
      if (activeContainerFilter !== 'all') {
        const matchPalletPo = (p.items || []).some(it => it.po === activeContainerFilter);
        if (!matchPalletPo) return false;
      }
      if (!isPalletMatchingStatus(p, activeStatusFilter)) return false;
      if (q) {
        const matchSearch = (p.items || []).some(it => String(it.ntk || '').toLowerCase().includes(q));
        if (!matchSearch) return false;
      }
      return true;
    });

    if ((isFilteringStatus || q) && matchingPallets.length === 0) {
      return null;
    }

    return {
      ...c,
      sortedPallets,
      visiblePallets: isFilteringStatus ? matchingPallets : sortedPallets,
    };
  }).filter(Boolean);
}

// Thống kê 3 bộ đếm tổng quan
function calculateStatusSummary(containers, activeContainerFilter) {
  let unlabeledCount = 0;
  let incompleteCount = 0;
  let bothCount = 0;
  let totalPallets = 0;

  (containers || []).forEach(c => {
    const matchPo = activeContainerFilter === 'all'
      ? true
      : (c.po === activeContainerFilter || (c.pallets || []).some(p => (p.items || []).some(it => it.po === activeContainerFilter)));
    if (!matchPo) return;

    (c.pallets || []).forEach(p => {
      const matchPalletPo = activeContainerFilter === 'all'
        ? true
        : (p.items || []).some(it => it.po === activeContainerFilter);
      if (!matchPalletPo) return;

      totalPallets++;
      const { hasUnlabeled, hasIncomplete, hasBoth } = checkPalletStatus(p);
      if (hasUnlabeled) unlabeledCount++;
      if (hasIncomplete) incompleteCount++;
      if (hasBoth) bothCount++;
    });
  });

  return { unlabeledCount, incompleteCount, bothCount, totalPallets };
}

// Kiểm tra bộ đếm tổng quan toàn bộ đơn (Tất cả PO)
{
  const sum = calculateStatusSummary(mockContainers, 'all');
  eq('3.1 totalPallets = 7', sum.totalPallets, 7);
  // Unlabeled: P2 (CONT-1), P4 (CONT-1), P7 (CONT-3) => 3 kiện
  eq('3.2 unlabeledCount = 3', sum.unlabeledCount, 3);
  // Incomplete: P3 (CONT-1), P4 (CONT-1) => 2 kiện
  eq('3.3 incompleteCount = 2', sum.incompleteCount, 2);
  // Both: P4 (CONT-1) => 1 kiện
  eq('3.4 bothCount = 1', sum.bothCount, 1);
}

// Kiểm tra bộ đếm theo PO-A
{
  const sum = calculateStatusSummary(mockContainers, 'PO-A');
  eq('3.5 PO-A totalPallets = 6', sum.totalPallets, 6);
  eq('3.6 PO-A unlabeledCount = 2 (P2, P4)', sum.unlabeledCount, 2);
  eq('3.7 PO-A incompleteCount = 2 (P3, P4)', sum.incompleteCount, 2);
  eq('3.8 PO-A bothCount = 1 (P4)', sum.bothCount, 1);
}

// Kiểm tra Phương án A: Khi chọn lọc 'unlabeled'
{
  const res = applyContainerFilter(mockContainers, 'all', 'unlabeled');
  // CONT-02 chỉ có kiện hoàn thành => Bị ẩn khỏi màn hình!
  eq('3.9 CONT-02 bị ẩn', res.length, 2);
  eq('3.10 CONT-01 có mặt', res[0].container_no, 'CONT-01');
  eq('3.11 CONT-03 có mặt', res[1].container_no, 'CONT-03');

  // Trong CONT-01: P1 (hoàn thành) và P3 (chỉ thiếu SL nhưng đã nhãn) bị ẩn!
  // Chỉ hiện P2 (unlabeled) và P4 (both - có unlabeled)
  eq('3.12 CONT-01 visiblePallets.length = 2', res[0].visiblePallets.length, 2);
  const cont1PalletNos = res[0].visiblePallets.map(p => p.pallet_no);
  eq('3.13 CONT-01 chỉ hiện kiện 2 và 4', JSON.stringify(cont1PalletNos), JSON.stringify([2, 4]));
}

// Kiểm tra Phương án A: Khi chọn lọc 'incomplete'
{
  const res = applyContainerFilter(mockContainers, 'all', 'incomplete');
  // CONT-02 và CONT-03 không có kiện thiếu SL => Bị ẩn!
  eq('3.14 Chỉ CONT-01 có mặt', res.length, 1);
  eq('3.15 CONT-01 có mặt', res[0].container_no, 'CONT-01');

  // Trong CONT-01: Chỉ hiện P3 và P4
  eq('3.16 CONT-01 visiblePallets.length = 2', res[0].visiblePallets.length, 2);
  const cont1PalletNos = res[0].visiblePallets.map(p => p.pallet_no);
  eq('3.17 CONT-01 chỉ hiện kiện 3 và 4', JSON.stringify(cont1PalletNos), JSON.stringify([3, 4]));
}

// Kiểm tra Phương án A: Khi chọn lọc 'both'
{
  const res = applyContainerFilter(mockContainers, 'all', 'both');
  eq('3.18 Chỉ CONT-01 có mặt', res.length, 1);
  eq('3.19 CONT-01 visiblePallets.length = 1', res[0].visiblePallets.length, 1);
  eq('3.20 Chỉ kiện 4 (P4) xuất hiện', res[0].visiblePallets[0].pallet_no, 4);
}

// Khi ở chế độ 'all': Tất cả container và tất cả kiện đều hiển thị đầy đủ
{
  const res = applyContainerFilter(mockContainers, 'all', 'all');
  eq('3.21 Hiện đủ 3 container', res.length, 3);
  eq('3.22 CONT-01 hiện đủ 4 kiện', res[0].visiblePallets.length, 4);
  eq('3.23 CONT-02 hiện đủ 2 kiện', res[1].visiblePallets.length, 2);
}

console.log(`\nKết quả: ${pass} passed, ${fail} failed.`);
if (fail > 0) {
  process.exit(1);
}
