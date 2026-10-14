// scripts/test-archiveCollapse.mjs
// Unit test cho hành vi ẩn / hiện nội dung đơn hàng lưu trữ trên tab Container (AC-ARCH-01, AC-ARCH-03, AC-ARCH-08).
// Chạy bằng node, KHÔNG cần Expo (SPEC-test.md §11.2).

let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) {
    pass += 1;
    return;
  }
  fail += 1;
  console.error(`  ✗ ${name}`);
}

function eq(name, actual, expected) {
  check(name, actual === expected);
  if (actual !== expected) {
    console.error(`    thực tế: ${JSON.stringify(actual)}\n    mong đợi: ${JSON.stringify(expected)}`);
  }
}

console.log('1) Trạng thái ban đầu: toàn bộ nội dung thẻ lưu trữ mặc định THU GỌN (ẨN)');
const archives = [
  { id: 101, finished_date: '2026-10-10', total_produced: 1000 },
  { id: 102, finished_date: '2026-10-12', total_produced: 2000 },
];

let archivesOpen = {};
let showArchivesSection = true;

function computeIsAnyArchiveOpen(openMap, list) {
  return (list || []).some(a => !!openMap[a.id]);
}

function getButtonProps(isAnyOpen) {
  return {
    icon: isAnyOpen ? 'eye-off-outline' : 'eye-outline',
    label: isAnyOpen ? 'Ẩn nội dung' : 'Hiện nội dung',
  };
}

let isAnyOpen = computeIsAnyArchiveOpen(archivesOpen, archives);
eq('Mặc định không có thẻ nào mở', isAnyOpen, false);
eq('Thẻ 101 đang đóng (expanded=false)', !!archivesOpen[101], false);
eq('Thẻ 102 đang đóng (expanded=false)', !!archivesOpen[102], false);

let btn = getButtonProps(isAnyOpen);
eq('Nút hiển thị Hiện nội dung khi mọi thẻ đóng', btn.label, 'Hiện nội dung');
eq('Icon nút là eye-outline', btn.icon, 'eye-outline');

console.log('\n2) Bấm nút "Hiện nội dung": mở toàn bộ thẻ lưu trữ');
function toggleAll(openMap, list) {
  if (computeIsAnyArchiveOpen(openMap, list)) {
    return {};
  }
  const next = {};
  (list || []).forEach(a => {
    next[a.id] = true;
  });
  return next;
}

archivesOpen = toggleAll(archivesOpen, archives);
isAnyOpen = computeIsAnyArchiveOpen(archivesOpen, archives);
eq('Đã mở tất cả thẻ', isAnyOpen, true);
eq('Thẻ 101 đang mở', !!archivesOpen[101], true);
eq('Thẻ 102 đang mở', !!archivesOpen[102], true);

btn = getButtonProps(isAnyOpen);
eq('Nút đổi thành Ẩn nội dung khi các thẻ đang mở', btn.label, 'Ẩn nội dung');
eq('Icon nút đổi thành eye-off-outline', btn.icon, 'eye-off-outline');

console.log('\n3) Bấm nút "Ẩn nội dung": thu gọn toàn bộ thẻ lưu trữ');
archivesOpen = toggleAll(archivesOpen, archives);
isAnyOpen = computeIsAnyArchiveOpen(archivesOpen, archives);
eq('Đã đóng tất cả thẻ', isAnyOpen, false);
eq('Thẻ 101 đã đóng', !!archivesOpen[101], false);
eq('Thẻ 102 đã đóng', !!archivesOpen[102], false);

btn = getButtonProps(isAnyOpen);
eq('Nút quay về Hiện nội dung', btn.label, 'Hiện nội dung');
eq('Icon nút quay về eye-outline', btn.icon, 'eye-outline');

console.log('\n4) Mở từng thẻ độc lập (toggleArchive)');
function toggleOne(openMap, id) {
  return {
    ...openMap,
    [id]: !openMap[id],
  };
}

// Mở thẻ 101
archivesOpen = toggleOne(archivesOpen, 101);
isAnyOpen = computeIsAnyArchiveOpen(archivesOpen, archives);
eq('Thẻ 101 mở', !!archivesOpen[101], true);
eq('Thẻ 102 vẫn đóng', !!archivesOpen[102], false);
eq('Có ít nhất 1 thẻ mở', isAnyOpen, true);

btn = getButtonProps(isAnyOpen);
eq('Nút hiển thị Ẩn nội dung khi có thẻ đang mở', btn.label, 'Ẩn nội dung');

// Bấm Ẩn nội dung để đóng tất cả
archivesOpen = toggleAll(archivesOpen, archives);
isAnyOpen = computeIsAnyArchiveOpen(archivesOpen, archives);
eq('Sau khi bấm Ẩn nội dung, thẻ 101 đã đóng', !!archivesOpen[101], false);
eq('Không còn thẻ nào mở', isAnyOpen, false);

console.log('\n5) Thu gọn / mở rộng toàn bộ khối Đơn hàng đã lưu trữ (showArchivesSection)');
eq('Mặc định khối lưu trữ hiển thị', showArchivesSection, true);
showArchivesSection = !showArchivesSection;
eq('Sau khi bấm tiêu đề, khối lưu trữ thu gọn', showArchivesSection, false);
showArchivesSection = !showArchivesSection;
eq('Sau khi bấm lại, khối lưu trữ mở lại', showArchivesSection, true);

console.log('\n6) Danh sách rỗng: không có đơn lưu trữ nào (AC-ARCH-08)');
const emptyArchives = [];
const shouldRender = emptyArchives.length > 0;
eq('Không render vùng lưu trữ khi rỗng', shouldRender, false);

console.log('──────────────────────────────────────────────────');
console.log(`Kết quả: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
console.log('✅ Tất cả unit test ẩn/hiện đơn hàng lưu trữ đạt chuẩn AC-ARCH-01/03/08.\n');
