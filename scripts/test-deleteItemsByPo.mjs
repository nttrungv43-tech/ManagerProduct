// scripts/test-deleteItemsByPo.mjs
// FEAT-13 — Unit test hàm thuần trong `src/utils/deleteItemsByPo.js`.
// Chạy bằng node, KHÔNG cần Expo/SQLite (SPEC-test.md §11.2).
import {
  INVALID_PO_CODE,
  PO_NO_ITEMS_CODE,
  PO_HAS_ENTRIES_CODE,
  PO_ITEMS_IN_PALLETS_CODE,
  BULK_EMPTY_TEXT,
  splitPo,
  isMultiPoItem,
  selectItemsByPo,
  poFilterNeedsReset,
  bulkDeleteConfirmMessage,
  formatBulkDeleteError,
  confirmDeleteItemsByPo,
} from '../src/utils/deleteItemsByPo.js';
import { DELETE_CONFIRM_TITLE, DELETE_ERROR_TITLE, GENERIC_ERROR } from '../src/utils/deleteItem.js';

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

// ---------- 1. splitPo: cùng cách tách PO với allPOs()/filteredItems() ----------
console.log('1) splitPo');
eq('PO đơn lẻ', JSON.stringify(splitPo('2600168')), JSON.stringify(['2600168']));
eq('nhiều PO', JSON.stringify(splitPo('2600168+2600189')), JSON.stringify(['2600168', '2600189']));
eq('bỏ khoảng trắng', JSON.stringify(splitPo(' 2600168 + 2600189 ')), JSON.stringify(['2600168', '2600189']));
eq('rỗng', JSON.stringify(splitPo('')), JSON.stringify([]));
eq('undefined', JSON.stringify(splitPo(undefined)), JSON.stringify([]));
eq('null', JSON.stringify(splitPo(null)), JSON.stringify([]));
check('isMultiPoItem true', isMultiPoItem('A+B') === true);
check('isMultiPoItem false', isMultiPoItem('A') === false);

// ---------- 2. selectItemsByPo: lọc đúng PO, bỏ mã nhiều PO (Q1) ----------
console.log('2) selectItemsByPo');
const ITEMS = [
  { ntk: '1001', po: '2600168', target: 100 },
  { ntk: '1002', po: '2600168', target: 200 },
  { ntk: '1003', po: '2600168+2600189', target: 300 },
  { ntk: '2001', po: '2600189', target: 400 },
  { ntk: '3001', po: '2600170', target: 500 },
];
{
  const r = selectItemsByPo(ITEMS, '2600168');
  eq('số mã khớp (loại mã nhiều PO)', r.itemCount, 2);
  eq('danh sách mã', JSON.stringify(r.matched.map(i => i.ntk)), JSON.stringify(['1001', '1002']));
  eq('mã nhiều PO bị bỏ qua', JSON.stringify(r.multi.map(i => i.ntk)), JSON.stringify(['1003']));
  eq('tổng target', r.totalTarget, 300);

  // PO thứ 2 của mã nhiều PO cũng bị bỏ qua — PO đó vẫn giữ mã.
  const r2 = selectItemsByPo(ITEMS, '2600189');
  eq('không xoá mã nhiều PO khỏi PO thứ hai', JSON.stringify(r2.matched.map(i => i.ntk)), JSON.stringify(['2001']));
  eq('mã nhiều PO vẫn được báo', JSON.stringify(r2.multi.map(i => i.ntk)), JSON.stringify(['1003']));

  // Bật lại `excludeMulti` (nếu sau này cần chế độ khác) vẫn lọc đúng.
  const r3 = selectItemsByPo(ITEMS, '2600168', { excludeMulti: false });
  eq('excludeMulti=false gộp mã nhiều PO', r3.itemCount, 3);
  eq('tổng target gồm mã nhiều PO', r3.totalTarget, 600);

  eq('PO không có mã nào', selectItemsByPo(ITEMS, '9999').itemCount, 0);
  eq('PO rỗng', selectItemsByPo(ITEMS, '').itemCount, 0);
  eq('items không phải mảng', selectItemsByPo(null, '2600168').itemCount, 0);
  eq('matched luôn là mảng', Array.isArray(selectItemsByPo(undefined, 'x').matched), true);
}

// ---------- 3. poFilterNeedsReset: sau khi xoá hết mã của PO đang lọc (Q5) ----------
console.log('3) poFilterNeedsReset');
check('lọc Tất cả PO ⇒ không reset', poFilterNeedsReset('all', ITEMS) === false);
check('PO còn mã ⇒ không reset', poFilterNeedsReset('2600168', ITEMS) === false);
check('PO không còn mã ⇒ reset', poFilterNeedsReset('9999', ITEMS) === true);
check('PO còn mã ở mã nhiều PO ⇒ không reset', poFilterNeedsReset('2600189', ITEMS) === false);
check('filter rỗng ⇒ không reset', poFilterNeedsReset('', []) === false);
check('items rỗng + lọc PO ⇒ reset', poFilterNeedsReset('2600168', []) === true);

// ---------- 4. Thông báo xác nhận: nêu tên PO, số mã, tổng pcs, không hoàn tác ----------
console.log('4) bulkDeleteConfirmMessage');
eq('nội dung đầy đủ', bulkDeleteConfirmMessage('2600168', { itemCount: 2, totalTarget: 300, multi: [] }),
  'Xoá toàn bộ 2 mã hàng thuộc PO 2600168?\nTổng kế hoạch giảm 300 pcs.\nThao tác này không thể hoàn tác.');
eq('phân tách nghìn kiểu VN', bulkDeleteConfirmMessage('A', { itemCount: 1, totalTarget: 8030 }),
  'Xoá toàn bộ 1 mã hàng thuộc PO A?\nTổng kế hoạch giảm 8.030 pcs.\nThao tác này không thể hoàn tác.');
eq('có nêu mã nhiều PO bị bỏ qua', bulkDeleteConfirmMessage('A', { itemCount: 2, totalTarget: 10, multi: [{ ntk: 'X' }] }),
  'Xoá toàn bộ 2 mã hàng thuộc PO A?\nTổng kế hoạch giảm 10 pcs.\nBỏ qua 1 mã thuộc nhiều PO (không thuộc riêng PO này).\nThao tác này không thể hoàn tác.');
check('bỏ trống preview không crash', typeof bulkDeleteConfirmMessage('A') === 'string');
check('hằn BULK_EMPTY_TEXT có dấu', BULK_EMPTY_TEXT === 'Không có mã hàng nào thuộc PO này.');

// ---------- 5. formatBulkDeleteError ----------
console.log('5) formatBulkDeleteError');
eq('PO không còn mã', formatBulkDeleteError({ code: PO_NO_ITEMS_CODE, po: 'A' }), 'Không còn mã hàng nào thuộc PO A.');
eq('PO không hợp lệ', formatBulkDeleteError({ code: INVALID_PO_CODE }), 'PO không hợp lệ. Vui lòng chọn một PO.');
eq('bị chặn vì có nhật ký — nêu đúng lý do',
  formatBulkDeleteError({
    code: PO_HAS_ENTRIES_CODE,
    po: 'A',
    items: [{ code: 'ITEM_HAS_ENTRIES', ntk: '106160', produced: 320 }],
  }),
  'Không thể xoá toàn bộ mã của PO A.\nCác mã sau bị chặn:\n• Mã 106160 đã có 320 pcs nhật ký, không thể xoá.\nHãy sửa số lượng thay vì xoá.');
eq('bị chặn vì còn trong kiện — dùng chung itemErrorMessage (AC-DEL-12)',
  formatBulkDeleteError({
    code: PO_ITEMS_IN_PALLETS_CODE,
    po: 'A',
    items: [{ code: 'ITEM_IN_PALLETS', ntk: '106160', pallets: 2 }],
  }),
  'Không thể xoá toàn bộ mã của PO A.\nCác mã sau bị chặn:\n• Mã 106160 còn nằm trong 2 kiện.\nHãy xoá hoặc sửa kiện trước.');
eq('> 3 mã bị chặn thì gom phần còn lại',
  formatBulkDeleteError({
    code: PO_HAS_ENTRIES_CODE,
    po: 'A',
    items: [1, 2, 3, 4, 5].map(n => ({ code: 'ITEM_HAS_ENTRIES', ntk: `M${n}`, produced: 1 })),
  }).split('\n').pop(), '• ... và 2 mã khác.');
eq('mã lạ ⇒ thông báo chung', formatBulkDeleteError({ code: 'KHONG_CO_CODE' }), GENERIC_ERROR);
eq('undefined ⇒ thông báo chung', formatBulkDeleteError(undefined), GENERIC_ERROR);

// ---------- 6. confirmDeleteItemsByPo: cấu trúc Alert ----------
console.log('6) confirmDeleteItemsByPo — cấu trúc Alert');
const PREVIEW = { itemCount: 2, totalTarget: 300, multi: [] };
{
  let captured = null;
  const fakeAlert = { alert: (title, message, buttons) => { captured = { title, message, buttons }; } };
  confirmDeleteItemsByPo({ po: 'A', preview: PREVIEW, onDelete: async () => ({ ok: true }), alert: fakeAlert });

  eq('tiêu đề', captured.title, DELETE_CONFIRM_TITLE);
  eq('thân có tên PO', captured.message, bulkDeleteConfirmMessage('A', PREVIEW));
  eq('số nút', captured.buttons.length, 2);
  eq('nút 1 = Huỷ', captured.buttons[0].text, 'Huỷ');
  eq('nút 1 là cancel', captured.buttons[0].style, 'cancel');
  eq('nút 2 = Xoá', captured.buttons[1].text, 'Xoá');
  eq('nút 2 là destructive', captured.buttons[1].style, 'destructive');
}

// ---------- 7. Huỷ ⇒ KHÔNG gọi onDelete, KHÔNG báo lỗi (AC-DEL-05) ----------
console.log('7) Huỷ => không xoá');
{
  let called = 0;
  let alerts = 0;
  const fakeAlert = { alert: (title, msg, buttons) => {
    alerts += 1;
    buttons.find(b => b.style === 'cancel').onPress();
  } };
  const res = await confirmDeleteItemsByPo({
    po: 'A', preview: PREVIEW,
    onDelete: async () => { called += 1; return { ok: true }; },
    alert: fakeAlert,
  });
  eq('không gọi onDelete', called, 0);
  eq('chỉ 1 Alert', alerts, 1);
  eq('ok=false', res.ok, false);
  eq('mã hủy', res.error.code, 'CANCELLED');
}

// ---------- 8. Xác nhận, thành công ----------
console.log('8) Xoá thành công');
{
  let receivedPo = null;
  const busy = [];
  let done = 0;
  const fakeAlert = { alert: (title, msg, buttons) => {
    buttons.find(b => b.style === 'destructive').onPress();
  } };
  const res = await confirmDeleteItemsByPo({
    po: 'A', preview: PREVIEW,
    onDelete: async po => { receivedPo = po; return { ok: true, removed: 2, removedTarget: 300 }; },
    alert: fakeAlert,
    onBusy: b => busy.push(b),
    onSuccess: () => { done += 1; },
  });
  eq('onDelete nhận đúng PO', receivedPo, 'A');
  eq('khoá nút khi xoá', JSON.stringify(busy), JSON.stringify([true, false]));
  eq('gọi onSuccess', done, 1);
  eq('ok=true', res.ok, true);
  eq('trả về số mã đã xoá', res.result.removed, 2);
}

// ---------- 9. Bị chặn ở tầng DB ⇒ báo lỗi, KHÔNG coi là xoá được (AC-DEL-06/07) ----------
console.log('9) Bị chặn');
for (const err of [
  { code: PO_HAS_ENTRIES_CODE, po: 'A', items: [{ code: 'ITEM_HAS_ENTRIES', ntk: '106160', produced: 320 }] },
  { code: PO_ITEMS_IN_PALLETS_CODE, po: 'A', items: [{ code: 'ITEM_IN_PALLETS', ntk: '106160', pallets: 2 }] },
]) {
  let shown = null;
  const fakeAlert = { alert: (title, msg, buttons) => {
    if (buttons) { buttons.find(b => b.style === 'destructive').onPress(); return; }
    shown = { title, msg };
  } };
  let done = 0;
  const res = await confirmDeleteItemsByPo({
    po: 'A', preview: PREVIEW,
    onDelete: async () => ({ ok: false, error: err }),
    alert: fakeAlert,
    onSuccess: () => { done += 1; },
  });
  eq(`${err.code}: tiêu đề lỗi`, shown.title, DELETE_ERROR_TITLE);
  eq(`${err.code}: nội dung lỗi`, shown.msg, formatBulkDeleteError(err));
  eq(`${err.code}: ok=false`, res.ok, false);
  eq(`${err.code}: không gọi onSuccess`, done, 0);
}

// ---------- 10. Hồi quy BUG: `Alert` của react-native là `class` ----------
console.log('10) Hồi quy: Alert là class, không được gọi như hàm');
{
  let seen = 0;
  class FakeAlert {
    static alert(title, msg, buttons) {
      seen += 1;
      buttons.find(b => b.style === 'cancel').onPress();
    }
  }
  let called = 0;
  const res = await confirmDeleteItemsByPo({
    po: 'A', preview: PREVIEW,
    onDelete: async () => { called += 1; return { ok: true }; },
    alert: FakeAlert,
  });
  eq('gọi được static Alert.alert', seen, 1);
  eq('không gọi nhầm onDelete', called, 0);
  eq('ok=false', res.ok, false);
}

console.log('\nKết quả: ' + `${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);