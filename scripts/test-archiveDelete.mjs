// scripts/test-archiveDelete.mjs
// FEAT-15 — Unit test hàm thuần trong `src/utils/archiveDelete.js`.
// Chạy bằng node, KHÔNG cần Expo (SPEC-test.md §11.2).
//
// Vì sao cần test: hộp thoại xoá đơn lưu trữ là hành động **không hoàn tác được**, nên
// thông báo phải luôn đủ số liệu và luôn cảnh báo hậu quả "Lịch sử sẽ giảm" (INV-B4).
import {
  archiveDeleteConfirmMessage,
  archiveDeleteErrorMessage,
  archiveDeleteErrorCode,
  confirmDeleteArchive,
  ARCHIVE_DELETE_CONFIRM_TITLE,
  ARCHIVE_DELETE_CONFIRM_TEXT,
  ARCHIVE_DELETE_CANCEL_TEXT,
  ARCHIVE_DELETE_ERROR_TITLE,
  GENERIC_ERROR,
} from '../src/utils/archiveDelete.js';

let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) { pass += 1; return; }
  fail += 1;
  console.error(`  ✗ ${name}`);
}

function has(name, haystack, needle) {
  check(name, String(haystack).includes(needle));
}

function eq(name, actual, expected) {
  check(name, actual === expected);
  if (actual !== expected) {
    console.error(`    thực tế: ${JSON.stringify(actual)}\n    mong đợi: ${JSON.stringify(expected)}`);
  }
}

const preview = {
  id: 7,
  finishedDate: '2026-10-02',
  produced: 8030,
  target: 8030,
  defect: 120,
  itemCount: 8,
  entryCount: 26,
  palletCount: 26,
};

// ---------- 1. Nội dung hộp thoại xác nhận ----------
console.log('1) archiveDeleteConfirmMessage — nêu đủ số liệu');
const msg = archiveDeleteConfirmMessage(preview);
has('ngày hoàn tất', msg, '2026-10-02');
has('sản lượng phân tách nghìn', msg, '8.030/8.030');
has('số mã hàng', msg, 'Số mã hàng: 8');
has('số nhật ký', msg, 'Số nhật ký: 26');
has('số kiện', msg, 'Số kiện: 26');
has('lỗi', msg, 'Lỗi: 120 pcs');

// ---------- 2. Cảnh báo hậu quả (INV-B4) ----------
console.log('2) Cảnh báo bắt buộc');
has('không thể hoàn tác', msg, 'KHÔNG thể hoàn tác');
has('Lịch sử sẽ giảm', msg, 'Lịch sử cũng sẽ giảm');

// ---------- 3. Dữ liệu thiếu / lỗi ----------
console.log('3) Dữ liệu thiếu không làm vỡ thông báo');
const bare = archiveDeleteConfirmMessage({});
has('vẫn có câu sản lượng', bare, 'Đã sản xuất 0/0 pcs');
has('vẫn có số mã/nhật ký/kiện', bare, 'Số mã hàng: 0 · Số nhật ký: 0 · Số kiện: 0');
check('không có dòng lỗi khi không ngày', !bare.includes('Đơn hoàn tất ngày'));
check('bỏ dòng lỗi khi lỗi = 0', !archiveDeleteConfirmMessage({ defect: 0 }).includes('Lỗi:'));
check('undefined/null không ném lỗi', typeof archiveDeleteConfirmMessage(null) === 'string');

// ---------- 4. Dịch mã lỗi ----------
console.log('4) archiveDeleteErrorMessage');
eq('BATCH_ACTIVE', archiveDeleteErrorMessage({ code: 'BATCH_ACTIVE' }),
  'Không thể xoá đơn hàng đang làm. Chỉ xoá được đơn đã lưu trữ.');
has('ARCHIVE_NOT_FOUND', archiveDeleteErrorMessage({ code: 'ARCHIVE_NOT_FOUND' }), 'Không tìm thấy');
has('BUSY', archiveDeleteErrorMessage({ code: 'BUSY' }), 'thử lại');
has('mã lạ', archiveDeleteErrorMessage({ code: 'WHATEVER' }), GENERIC_ERROR);
has('thiếu mã', archiveDeleteErrorMessage(undefined), GENERIC_ERROR);
eq('nhận mã thuần', archiveDeleteErrorMessage('INVALID_BATCH_ID'), 'Đơn hàng cần xoá không hợp lệ.');

// ---------- 5. Chuẩn hoá lỗi ----------
console.log('5) archiveDeleteErrorCode');
eq('giữ mã biết', archiveDeleteErrorCode({ code: 'BATCH_ACTIVE' }), 'BATCH_ACTIVE');
eq('đọc message của Error ném ra', archiveDeleteErrorCode(new Error('ARCHIVE_NOT_FOUND')), 'ARCHIVE_NOT_FOUND');
eq('lỗi lạ -> DB_ERROR', archiveDeleteErrorCode(new Error('SQLITE_CONSTRAINT')), 'DB_ERROR');
eq('null -> DB_ERROR', archiveDeleteErrorCode(null), 'DB_ERROR');

// ---------- 6. Cấu trúc hộp thoại (INV-U1) ----------
console.log('6) confirmDeleteArchive — cấu trúc Alert');
class FakeAlert {
  constructor() { this.calls = []; }
  alert(title, message, buttons) { this.calls.push({ title, message, buttons }); }
}

const alert1 = new FakeAlert();
const p1 = confirmDeleteArchive({ preview, onDelete: async () => ({ ok: true }), alert: alert1 });
const call1 = alert1.calls[0];
eq('tiêu đề', call1.title, ARCHIVE_DELETE_CONFIRM_TITLE);
eq('đúng 2 nút (Huỷ · Xoá hẳn)', call1.buttons.length, 2);
eq('nút 1 = Huỷ, style cancel', call1.buttons[0].text, ARCHIVE_DELETE_CANCEL_TEXT);
eq('nút 2 = Xoá hẳn, destructive', call1.buttons[1].text, ARCHIVE_DELETE_CONFIRM_TEXT);
eq('nút xác nhận là destructive', call1.buttons[1].style, 'destructive');
let deleteCalled = false;
call1.buttons[0].onPress();
const r1 = await p1;
check('Huỷ không gọi onDelete, trả CANCELLED', r1.ok === false && r1.error.code === 'CANCELLED');
check('onDelete chưa hề được gọi', deleteCalled === false);

const alert2 = new FakeAlert();
let calledWith = null;
const p2 = confirmDeleteArchive({
  preview,
  onDelete: async id => { calledWith = id; return { ok: true }; },
  alert: alert2,
});
alert2.calls[0].buttons[1].onPress();
const r2 = await p2;
eq('gọi onDelete với đúng batch id', calledWith, preview.id);
check('Xác nhận ⇒ ok', r2.ok === true);

// ---------- 7. Lỗi khi xoá + khoá nút ----------
console.log('7) confirmDeleteArchive — lỗi và onBusy');
const alert3 = new FakeAlert();
const busyStates = [];
const p3 = confirmDeleteArchive({
  preview,
  onDelete: async () => ({ ok: false, error: { code: 'ARCHIVE_NOT_FOUND' } }),
  alert: alert3,
  onBusy: b => busyStates.push(b),
});
await alert3.calls[0].buttons[1].onPress();
const r3 = await p3;
eq('báo lỗi ra UI', alert3.calls[1].title, ARCHIVE_DELETE_ERROR_TITLE);
has('nội dung lỗi đúng mã', alert3.calls[1].message, 'Không tìm thấy');
eq('trả lỗi cho caller', r3.error.code, 'ARCHIVE_NOT_FOUND');
eq('bật rồi tắt khoá nút', busyStates.join(','), 'true,false');

const alert4 = new FakeAlert();
const p4 = confirmDeleteArchive({
  preview,
  onDelete: async () => { throw new Error('SQLITE_BUSY'); },
  alert: alert4,
});
await alert4.calls[0].buttons[1].onPress();
const r4 = await p4;
eq('lỗi ném ra -> DB_ERROR', r4.error.code, 'DB_ERROR');
eq('và báo lỗi ra UI', alert4.calls[1].title, ARCHIVE_DELETE_ERROR_TITLE);

const alert5 = new FakeAlert();
const p5 = confirmDeleteArchive({
  preview,
  onDelete: async () => ({ ok: false, error: { code: 'BUSY' } }),
  alert: alert5,
});
await alert5.calls[0].buttons[1].onPress();
const r5 = await p5;
eq('lần gọi song song -> BUSY', r5.error.code, 'BUSY');

// ---------- 8. Hồi quy: Alert là class, không được gọi như hàm ----------
console.log('8) Hồi quy: không gọi `alert(...)` như hàm');
const src = String(confirmDeleteArchive);
check('dùng alert.alert(', src.includes('alert.alert('));
// Gọi `alert(...)` như hàm sẽ ném TypeError (Alert của RN là class).
check('không gọi alert(...) như hàm', !/(^|[^.\w])alert\(/.test(src));

console.log(`\nKết quả: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);