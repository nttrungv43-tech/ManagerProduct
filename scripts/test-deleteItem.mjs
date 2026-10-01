// scripts/test-deleteItem.mjs
// FEAT-11 — Unit test hàm thuần trong `src/utils/deleteItem.js`.
// Chạy bằng node, KHÔNG cần Expo/SQLite (SPEC-test.md §11.2).
import {
  ITEM_ERROR_MESSAGES,
  itemErrorMessage,
  deleteConfirmMessage,
  confirmDeleteItem,
  DELETE_CONFIRM_TITLE,
  DELETE_CANCEL_TEXT,
  DELETE_CONFIRM_TEXT,
  DELETE_ERROR_TITLE,
} from '../src/utils/deleteItem.js';

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

// ---------- 1. Bảng dịch lỗi: đủ 4 mã mà AC-EDIT-34 yêu cầu ----------
console.log('1) ITEM_ERROR_MESSAGES');
for (const code of ['ITEM_EXISTS', 'ITEM_NOT_FOUND', 'ITEM_HAS_ENTRIES', 'ITEM_IN_PALLETS']) {
  check(`có mã lỗi ${code}`, typeof ITEM_ERROR_MESSAGES[code] === 'function');
}

// ---------- 2. Nội dung thông điệp ----------
console.log('2) itemErrorMessage — nội dung');
eq('ITEM_HAS_ENTRIES nêu số pcs',
  itemErrorMessage({ code: 'ITEM_HAS_ENTRIES', ntk: '106160', produced: 320 }),
  'Mã 106160 đã có 320 pcs nhật ký, không thể xoá.\nHãy sửa số lượng thay vì xoá.');
eq('ITEM_IN_PALLETS nêu số kiện',
  itemErrorMessage({ code: 'ITEM_IN_PALLETS', ntk: '106160', pallets: 3 }),
  'Mã 106160 còn nằm trong 3 kiện.\nHãy xoá hoặc sửa kiện trước.');
eq('ITEM_EXISTS nêu mã',
  itemErrorMessage({ code: 'ITEM_EXISTS', ntk: '106160' }),
  'Mã hàng 106160 đã tồn tại trong đơn hàng hiện tại.');
eq('ITEM_NOT_FOUND nêu mã',
  itemErrorMessage({ code: 'ITEM_NOT_FOUND', ntk: '999' }),
  'Không tìm thấy mã hàng 999.');
eq('TARGET_BELOW_PRODUCED nêu số đã làm',
  itemErrorMessage({ code: 'TARGET_BELOW_PRODUCED', produced: 500 }),
  'Số lượng không được thấp hơn số đã sản xuất (500 pcs).');
eq('INVALID_NTK',
  itemErrorMessage({ code: 'INVALID_NTK' }),
  'Mã hàng chỉ gồm chữ và số, không có khoảng trắng.');
eq('INVALID_TARGET',
  itemErrorMessage({ code: 'INVALID_TARGET' }),
  'Số lượng phải là số nguyên không âm.');

// ---------- 3. Mã lạ / rỗng => thông báo chung, KHÔNG crash ----------
console.log('3) itemErrorMessage — mã lạ & rỗng');
const GENERIC = 'Có lỗi xảy ra. Vui lòng thử lại.';
eq('mã lạ', itemErrorMessage({ code: 'KHONG_CO_CODE' }), GENERIC);
eq('undefined', itemErrorMessage(undefined), GENERIC);
eq('null', itemErrorMessage(null), GENERIC);
eq('object rỗng', itemErrorMessage({}), GENERIC);

// ---------- 4. Thông điệp xác nhận nêu đúng tên mã (AC-EDIT-27) ----------
console.log('4) Thông báo xác nhận');
eq('nêu tên mã', deleteConfirmMessage('106160'),
  'Xoá mã 106160?\nMã này sẽ bị xoá khỏi đơn hàng hiện tại.');

// ---------- 5. confirmDeleteItem: đủ 3 nút, đúng nhãn ----------
console.log('5) confirmDeleteItem — cấu trúc Alert');
{
  let captured = null;
  // ⚠️ Truyền đúng hình dạng production: object `Alert` có method `.alert`,
  // KHÔNG phải hàm thuần (RN 57 định nghĩa `Alert` là `class`).
  const fakeAlert = { alert: (title, message, buttons) => { captured = { title, message, buttons }; } };
  confirmDeleteItem({ item: { ntk: '106160' }, onDelete: async () => ({ ok: true }), alert: fakeAlert });

  eq('tiêu đề', captured.title, DELETE_CONFIRM_TITLE);
  eq('thân có tên mã', captured.message, deleteConfirmMessage('106160'));
  eq('số nút', captured.buttons.length, 2);
  eq('nút 1 = Huỷ', captured.buttons[0].text, DELETE_CANCEL_TEXT);
  eq('nút 1 là cancel', captured.buttons[0].style, 'cancel');
  eq('nút 2 = Xoá', captured.buttons[1].text, DELETE_CONFIRM_TEXT);
  eq('nút 2 là destructive', captured.buttons[1].style, 'destructive');
}

// ---------- 6. Bấm Huỷ => KHÔNG gọi onDelete, KHÔNG báo lỗi (AC-EDIT-28) ----------
console.log('6) Huỷ => không xoá');
{
  let deleteCalled = 0;
  let alerts = 0;
  const fakeAlert = { alert: (title, msg, buttons) => {
    alerts += 1;
    buttons.find(b => b.style === 'cancel').onPress();
  } };
  const p = confirmDeleteItem({
    item: { ntk: '106160' },
    onDelete: async () => { deleteCalled += 1; return { ok: true }; },
    alert: fakeAlert,
  });
  const res = await p;
  eq('không gọi onDelete', deleteCalled, 0);
  eq('chỉ 1 Alert (hỏi xác nhận)', alerts, 1);
  eq('kết quả ok=false', res.ok, false);
  eq('mã hủy', res.error.code, 'CANCELLED');
}

// ---------- 7. Bấm Xoá, thành công (AC-EDIT-31) ----------
console.log('7) Xoá thành công');
{
  let receivedNtk = null;
  let busy = [];
  let done = 0;
  const fakeAlert = { alert: (title, msg, buttons) => {
    buttons.find(b => b.text === DELETE_CONFIRM_TEXT).onPress();
  } };
  const res = await confirmDeleteItem({
    item: { ntk: '106160' },
    onDelete: async ntk => { receivedNtk = ntk; return { ok: true }; },
    alert: fakeAlert,
    onBusy: b => busy.push(b),
    onSuccess: () => { done += 1; },
  });
  eq('onDelete nhận đúng ntk', receivedNtk, '106160');
  eq('khoá nút khi xoá', JSON.stringify(busy), JSON.stringify([true, false]));
  eq('gọi onSuccess', done, 1);
  eq('kết quả ok=true', res.ok, true);
}

// ---------- 8. Bấm Xoá nhưng bị chặn => báo lỗi, KHÔNG coi là thành công ----------
console.log('8) Bị chặn (còn nhật ký / còn trong kiện)');
for (const [err, expected] of [
  [{ code: 'ITEM_HAS_ENTRIES', ntk: '106160', produced: 50 }, 'Mã 106160 đã có 50 pcs nhật ký, không thể xoá.\nHãy sửa số lượng thay vì xoá.'],
  [{ code: 'ITEM_IN_PALLETS', ntk: '106160', pallets: 2 }, 'Mã 106160 còn nằm trong 2 kiện.\nHãy xoá hoặc sửa kiện trước.'],
]) {
  let shown = null;
  const fakeAlert = { alert: (title, msg, buttons) => {
    if (buttons) { buttons.find(b => b.text === DELETE_CONFIRM_TEXT).onPress(); return; }
    shown = { title, msg };
  } };
  let done = 0;
  const res = await confirmDeleteItem({
    item: { ntk: '106160' },
    onDelete: async () => ({ ok: false, error: err }),
    alert: fakeAlert,
    onSuccess: () => { done += 1; },
  });
  eq(`${err.code}: tiêu đề lỗi`, shown.title, DELETE_ERROR_TITLE);
  eq(`${err.code}: nội dung lỗi`, shown.msg, expected);
  eq(`${err.code}: không coi là xoá được`, res.ok, false);
  eq(`${err.code}: không gọi onSuccess`, done, 0);
}

// ---------- 9. Hồi quy BUG: `Alert` của react-native là `class` ----------
// Gọi `Alert(...)` trực tiếp sẽ ném
// "TypeError: Class constructor Alert cannot be invoked without 'new'".
// Test này dùng đúng một `class` có static method `alert` như RN thật.
console.log('9) Hồi quy: Alert là class, không được gọi như hàm');
{
  let seen = 0;
  class FakeAlert {
    static alert(title, msg, buttons) {
      seen += 1;
      buttons.find(b => b.style === 'cancel').onPress();
    }
  }
  let deleted = 0;
  const res = await confirmDeleteItem({
    item: { ntk: '106160' },
    onDelete: async () => { deleted += 1; return { ok: true }; },
    alert: FakeAlert,
  });
  eq('gọi được static Alert.alert', seen, 1);
  eq('không gọi nhầm onDelete', deleted, 0);
  eq('kết quả ok=false', res.ok, false);
}

console.log('\nKết quả: ' + `${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
