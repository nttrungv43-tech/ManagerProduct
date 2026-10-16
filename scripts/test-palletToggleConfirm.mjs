// scripts/test-palletToggleConfirm.mjs
// Kiểm thử chức năng thông báo xác nhận khi tích chọn đóng xong kiện (tránh tích nhầm).

import {
  formatQty,
  getPalletToggleConfirmInfo,
  confirmPalletToggle,
} from '../src/utils/palletToggleConfirm.js';

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

console.log('--- 1. Kiểm thử formatQty ---');
eq('1.1 formatQty 0', formatQty(0), '0');
eq('1.2 formatQty 50', formatQty(50), '50');
eq('1.3 formatQty 1500', formatQty(1500), '1.500');
eq('1.4 formatQty 1250000', formatQty(1250000), '1.250.000');
eq('1.5 formatQty null', formatQty(null), '0');
eq('1.6 formatQty chuỗi "350"', formatQty('350'), '350');

console.log('--- 2. Kiểm thử getPalletToggleConfirmInfo: Kiện 1 mã hàng ---');

// 2.1 Kiện 1 mã: Đánh dấu đóng xong (isDone: false)
{
  const info = getPalletToggleConfirmInfo({
    isDone: false,
    palletNo: 12,
    qty: 300,
    itemCount: 1,
    isMixed: false,
  });
  eq('2.1.1 Tiêu đề đóng xong kiện', info.title, 'Xác nhận đóng xong kiện');
  check('2.1.2 Nội dung có số kiện 12', info.message.includes('kiện 12'));
  check('2.1.3 Nội dung có số lượng 300 pcs', info.message.includes('300 pcs'));
  check('2.1.4 Nội dung nhắc dán nhãn đầy đủ', info.message.includes('dán nhãn đầy đủ'));
  eq('2.1.5 confirmText = Xác nhận', info.confirmText, 'Xác nhận');
  eq('2.1.6 confirmStyle = default', info.confirmStyle, 'default');
}

// 2.2 Kiện 1 mã: Bỏ đánh dấu hoàn thành (isDone: true)
{
  const info = getPalletToggleConfirmInfo({
    isDone: true,
    palletNo: 12,
    qty: 300,
    itemCount: 1,
    isMixed: false,
  });
  eq('2.2.1 Tiêu đề bỏ đánh dấu', info.title, 'Bỏ đánh dấu hoàn thành');
  check('2.2.2 Nội dung có số kiện 12', info.message.includes('kiện 12'));
  check('2.2.3 Cảnh báo số lượng và dán nhãn về 0', info.message.includes('đưa về 0'));
  eq('2.2.4 confirmText = Bỏ đánh dấu', info.confirmText, 'Bỏ đánh dấu');
  eq('2.2.5 confirmStyle = destructive', info.confirmStyle, 'destructive');
}

console.log('--- 3. Kiểm thử getPalletToggleConfirmInfo: Kiện nhiều mã (Master Toggle) ---');

// 3.1 Kiện nhiều mã: Đánh dấu đóng xong cả kiện
{
  const info = getPalletToggleConfirmInfo({
    isDone: false,
    palletNo: 8,
    qty: 750,
    itemCount: 4,
    isMixed: true,
    isMaster: true,
  });
  eq('3.1.1 Tiêu đề đóng xong cả kiện', info.title, 'Xác nhận đóng xong cả kiện');
  check('3.1.2 Nội dung có số kiện 8', info.message.includes('kiện 8'));
  check('3.1.3 Nội dung có số lượng 750 pcs', info.message.includes('750 pcs'));
  check('3.1.4 Nội dung có số mã hàng: 4 mã hàng', info.message.includes('4 mã hàng'));
  eq('3.1.5 confirmText = Xác nhận', info.confirmText, 'Xác nhận');
}

// 3.2 Kiện nhiều mã: Bỏ đánh dấu cả kiện
{
  const info = getPalletToggleConfirmInfo({
    isDone: true,
    palletNo: 8,
    qty: 750,
    itemCount: 4,
    isMixed: true,
    isMaster: true,
  });
  eq('3.2.1 Tiêu đề bỏ đánh dấu', info.title, 'Bỏ đánh dấu hoàn thành');
  check('3.2.2 Cảnh báo toàn bộ 4 mã hàng sẽ bị thiết lập lại', info.message.includes('4 mã hàng'));
  eq('3.2.3 confirmStyle = destructive', info.confirmStyle, 'destructive');
}

console.log('--- 4. Kiểm thử getPalletToggleConfirmInfo: Dòng hàng cụ thể trong kiện mix ---');

// 4.1 Từng dòng mã: Đánh dấu đóng xong
{
  const info = getPalletToggleConfirmInfo({
    isDone: false,
    palletNo: 8,
    qty: 750,
    itemCount: 4,
    isMixed: true,
    isMaster: false,
    ntk: '1063022',
    itemQty: 250,
  });
  eq('4.1.1 Tiêu đề đóng xong mã hàng', info.title, 'Xác nhận đóng xong mã hàng');
  check('4.1.2 Nội dung có tên mã 1063022', info.message.includes('1063022'));
  check('4.1.3 Nội dung có số lượng dòng 250 pcs', info.message.includes('250 pcs'));
  check('4.1.4 Nội dung có số kiện 8', info.message.includes('kiện 8'));
  eq('4.1.5 confirmText = Xác nhận', info.confirmText, 'Xác nhận');
}

// 4.2 Từng dòng mã: Bỏ đánh dấu
{
  const info = getPalletToggleConfirmInfo({
    isDone: true,
    palletNo: 8,
    qty: 750,
    itemCount: 4,
    isMixed: true,
    isMaster: false,
    ntk: '1063022',
    itemQty: 250,
  });
  eq('4.2.1 Tiêu đề bỏ đánh dấu', info.title, 'Bỏ đánh dấu hoàn thành');
  check('4.2.2 Nội dung có tên mã 1063022', info.message.includes('1063022'));
  check('4.2.3 Cảnh báo số lượng dòng và dán nhãn về 0', info.message.includes('đưa về 0'));
  eq('4.2.4 confirmStyle = destructive', info.confirmStyle, 'destructive');
}

console.log('--- 5. Kiểm thử confirmPalletToggle với mock Alert (Xác nhận & Huỷ) ---');

// 5.1 Khi người dùng bấm "Huỷ": onConfirm KHÔNG được gọi
{
  let alertTitle = null;
  let alertMessage = null;
  let alertButtons = [];
  let confirmed = false;

  const mockAlert = (title, message, buttons) => {
    alertTitle = title;
    alertMessage = message;
    alertButtons = buttons;
  };

  confirmPalletToggle(
    { isDone: false, palletNo: 5, qty: 100 },
    () => { confirmed = true; },
    mockAlert
  );

  eq('5.1.1 alertTitle hợp lệ', alertTitle, 'Xác nhận đóng xong kiện');
  eq('5.1.2 Có 2 nút [Huỷ] và [Xác nhận]', alertButtons.length, 2);
  eq('5.1.3 Nút 0 là Huỷ (cancel)', alertButtons[0].text, 'Huỷ');
  eq('5.1.4 Nút 0 có style cancel', alertButtons[0].style, 'cancel');

  // Mô phỏng bấm nút Huỷ
  if (alertButtons[0].onPress) alertButtons[0].onPress();
  eq('5.1.5 Bấm Huỷ => confirmed vẫn là false (chặn tích nhầm thành công)', confirmed, false);
}

// 5.2 Khi người dùng bấm "Xác nhận": onConfirm ĐƯỢC gọi
{
  let alertButtons = [];
  let confirmed = false;

  const mockAlert = (title, message, buttons) => {
    alertButtons = buttons;
  };

  confirmPalletToggle(
    { isDone: false, palletNo: 5, qty: 100 },
    () => { confirmed = true; },
    mockAlert
  );

  eq('5.2.1 Nút 1 là Xác nhận', alertButtons[1].text, 'Xác nhận');
  // Mô phỏng bấm Xác nhận
  alertButtons[1].onPress();
  eq('5.2.2 Bấm Xác nhận => confirmed chuyển sang true', confirmed, true);
}

// 5.3 Khi bỏ đánh dấu: Bấm "Bỏ đánh dấu" => onConfirm ĐƯỢC gọi
{
  let alertButtons = [];
  let confirmed = false;

  const mockAlert = (title, message, buttons) => {
    alertButtons = buttons;
  };

  confirmPalletToggle(
    { isDone: true, palletNo: 5, qty: 100 },
    () => { confirmed = true; },
    mockAlert
  );

  eq('5.3.1 Nút 1 là Bỏ đánh dấu', alertButtons[1].text, 'Bỏ đánh dấu');
  eq('5.3.2 Style là destructive', alertButtons[1].style, 'destructive');
  alertButtons[1].onPress();
  eq('5.3.3 Bấm Bỏ đánh dấu => confirmed = true', confirmed, true);
}

// 5.4 Mô phỏng chính xác React Native class Alert: typeof RNAlert === 'function', static alert(...)
{
  let calledWithTitle = null;
  let confirmed = false;

  class ReactNativeAlertClass {
    constructor() {
      throw new TypeError('Class constructor Alert cannot be invoked without new');
    }
    static alert(title, message, buttons) {
      calledWithTitle = title;
      // Bấm xác nhận
      buttons[1].onPress();
    }
  }

  let threwError = null;
  try {
    confirmPalletToggle(
      { isDone: false, palletNo: 9, qty: 200 },
      () => { confirmed = true; },
      ReactNativeAlertClass
    );
  } catch (err) {
    threwError = err;
  }

  eq('5.4.1 Không ném lỗi Class constructor invoked without new', threwError, null);
  eq('5.4.2 Gọi thành công static alert của class Alert', calledWithTitle, 'Xác nhận đóng xong kiện');
  eq('5.4.3 onConfirm được gọi thành công', confirmed, true);
}

console.log(`\nKết quả: ${pass} passed, ${fail} failed.`);
if (fail > 0) {
  process.exit(1);
}
