// src/utils/palletToggleConfirm.js
// Thông báo xác nhận khi tích chọn đóng xong kiện hoặc dòng hàng,
// nhằm tránh tình trạng tích nhầm / chạm nhầm khi thao tác.

/**
 * Định dạng số theo chuẩn tiếng Việt (phân cách hàng nghìn bằng dấu chấm).
 * @param {number|string} val
 * @returns {string}
 */
export function formatQty(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('vi-VN');
}

/**
 * Tạo tiêu đề và nội dung thông báo xác nhận khi bật/tắt hoàn thành kiện hoặc dòng hàng.
 *
 * @param {object} params
 * @param {boolean} params.isDone - Trạng thái hiện tại (true: đang xong -> muốn huỷ, false: chưa xong -> muốn đánh dấu)
 * @param {number|string} params.palletNo - Số thứ tự kiện
 * @param {number} [params.qty] - Tổng số lượng kiện
 * @param {number} [params.itemCount=1] - Số lượng mã hàng trong kiện
 * @param {boolean} [params.isMixed=false] - Kiện nhiều mã hay không
 * @param {boolean} [params.isMaster=false] - Đang thao tác trên Master Checkbox của kiện nhiều mã
 * @param {string} [params.ntk] - Mã hàng (nếu thao tác trên 1 dòng hàng cụ thể)
 * @param {number} [params.itemQty] - Số lượng của dòng hàng cụ thể
 * @returns {{ title: string, message: string, confirmText: string, confirmStyle: 'default'|'destructive' }}
 */
export function getPalletToggleConfirmInfo({
  isDone,
  palletNo,
  qty = 0,
  itemCount = 1,
  isMixed = false,
  isMaster = false,
  ntk = null,
  itemQty = 0,
}) {
  const pNo = palletNo ?? '';

  // 1. Trường hợp: Đang đánh dấu ĐÓNG XONG (từ chưa xong -> xong)
  if (!isDone) {
    if (isMaster || (isMixed && !ntk)) {
      return {
        title: 'Xác nhận đóng xong cả kiện',
        message: `Đánh dấu toàn bộ kiện ${pNo} (${formatQty(qty)} pcs · ${itemCount} mã hàng) đã đóng xong và dán nhãn đầy đủ?`,
        confirmText: 'Xác nhận',
        confirmStyle: 'default',
      };
    }

    if (isMixed && ntk) {
      return {
        title: 'Xác nhận đóng xong mã hàng',
        message: `Đánh dấu mã hàng ${ntk} (${formatQty(itemQty)} pcs) trong kiện ${pNo} đã đóng xong và dán nhãn đầy đủ?`,
        confirmText: 'Xác nhận',
        confirmStyle: 'default',
      };
    }

    // Kiện một mã hàng thông thường
    return {
      title: 'Xác nhận đóng xong kiện',
      message: `Đánh dấu kiện ${pNo} (${formatQty(qty)} pcs) đã đóng xong và dán nhãn đầy đủ?`,
      confirmText: 'Xác nhận',
      confirmStyle: 'default',
    };
  }

  // 2. Trường hợp: Đang BỎ ĐÁNH DẤU (từ xong -> chưa xong)
  if (isMaster || (isMixed && !ntk)) {
    return {
      title: 'Bỏ đánh dấu hoàn thành',
      message: `Bỏ đánh dấu đóng xong toàn bộ kiện ${pNo}? Toàn bộ ${itemCount} mã hàng trong kiện sẽ được thiết lập lại.`,
      confirmText: 'Bỏ đánh dấu',
      confirmStyle: 'destructive',
    };
  }

  if (isMixed && ntk) {
    return {
      title: 'Bỏ đánh dấu hoàn thành',
      message: `Bỏ đánh dấu đóng xong mã hàng ${ntk} trong kiện ${pNo}? Số lượng đã đóng và trạng thái dán nhãn sẽ được đưa về 0.`,
      confirmText: 'Bỏ đánh dấu',
      confirmStyle: 'destructive',
    };
  }

  // Kiện một mã hàng thông thường
  return {
    title: 'Bỏ đánh dấu hoàn thành',
    message: `Bỏ đánh dấu đóng xong kiện ${pNo}? Số lượng đã đóng và trạng thái dán nhãn sẽ được đưa về 0.`,
    confirmText: 'Bỏ đánh dấu',
    confirmStyle: 'destructive',
  };
}

/**
 * Hiển thị hộp thoại xác nhận trước khi thực hiện hành động toggle.
 *
 * @param {object} params Các tham số cho `getPalletToggleConfirmInfo`
 * @param {() => void} onConfirm Hàm callback thực hiện khi người dùng bấm xác nhận
 * @param {object|function} [alertFn] Cho phép inject `Alert` hoặc `Alert.alert` (hỗ trợ unit test)
 */
export function confirmPalletToggle(params, onConfirm, alertFn) {
  const { title, message, confirmText, confirmStyle } = getPalletToggleConfirmInfo(params);

  // Trong React Native, Alert là một class (`class Alert`). Gọi `alertFn(...)` trực tiếp
  // sẽ ném TypeError: Class constructor invoked without new.
  // Cần ưu tiên gọi `alertFn.alert(...)` nếu có, fallback sang gọi hàm nếu là hàm thuần.
  const doAlert = typeof alertFn?.alert === 'function'
    ? alertFn.alert.bind(alertFn)
    : (typeof alertFn === 'function' ? alertFn : null);

  if (!doAlert) {
    // Fallback nếu không có alert (ví dụ môi trường không có UI)
    onConfirm?.();
    return;
  }

  doAlert(
    title,
    message,
    [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: confirmText,
        style: confirmStyle,
        onPress: () => {
          if (typeof onConfirm === 'function') {
            onConfirm();
          }
        },
      },
    ]
  );
}
