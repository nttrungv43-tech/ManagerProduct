// src/utils/deleteItem.js
// FEAT-11 — Nguồn sự thật DUY NHẤT cho thông báo xoá mã hàng.
// Cả `ItemEditSheet.js` (nút trong sheet) và `ItemCard.js` (nút trên thẻ) đều phải
// dùng file này — cấm copy `Alert` / bảng dịch lỗi vào component (AC-EDIT-33/34).
//
// Module này cố tình KHÔNG import từ 'react-native' để chạy được bằng
// `node scripts/test-deleteItem.mjs` mà không cần Expo (SPEC-test.md §11.2).
// `confirmDeleteItem` nhận `alert` từ bên ngoài (chính là `Alert` của react-native).

/** Nhãn dùng chung cho mọi nơi hỏi xác nhận xoá mã (AC-EDIT-33). */
export const DELETE_CONFIRM_TITLE = 'Xác nhận';
export const DELETE_CANCEL_TEXT = 'Huỷ';
export const DELETE_CONFIRM_TEXT = 'Xoá';
export const DELETE_ERROR_TITLE = 'Không xoá được';

/** Thân thông báo xác nhận — nêu rõ tên mã (AC-EDIT-27). */
export function deleteConfirmMessage(ntk) {
  return `Xoá mã ${ntk}?\nMã này sẽ bị xoá khỏi đơn hàng hiện tại.`;
}

/**
 * Mã lỗi từ `queries.js` -> thông điệp tiếng Việt (INV-U2).
 * Giá trị là hàm nhận `error` vì nhiều thông điệp cần số liệu động
 * (`ntk`, `produced`, `pallets`).
 */
export const ITEM_ERROR_MESSAGES = {
  INVALID_NTK: () => 'Mã hàng chỉ gồm chữ và số, không có khoảng trắng.',
  INVALID_TARGET: () => 'Số lượng phải là số nguyên không âm.',
  ITEM_EXISTS: e => `Mã hàng ${e.ntk} đã tồn tại trong đơn hàng hiện tại.`,
  ITEM_NOT_FOUND: e => `Không tìm thấy mã hàng ${e.ntk}.`,
  TARGET_BELOW_PRODUCED: e => `Số lượng không được thấp hơn số đã sản xuất (${e.produced} pcs).`,
  ITEM_HAS_ENTRIES: e =>
    `Mã ${e.ntk} đã có ${e.produced} pcs nhật ký, không thể xoá.\nHãy sửa số lượng thay vì xoá.`,
  ITEM_IN_PALLETS: e =>
    `Mã ${e.ntk} còn nằm trong ${e.pallets} kiện.\nHãy xoá hoặc sửa kiện trước.`,
};

/** Thông báo chung khi mã lỗi lạ hoặc thiếu — dùng chung cho mọi thao tác xoá. */
export const GENERIC_ERROR = 'Có lỗi xảy ra. Vui lòng thử lại.';

/**
 * Dịch mã lỗi của `queries.js` sang thông điệp tiếng Việt.
 * Nhận nguyên object lỗi (`{ code, ntk, ... }`); mã lạ hoặc thiếu -> thông báo chung.
 * @param {{code?: string, ntk?: string, produced?: number, pallets?: number}|undefined|null} error
 * @returns {string}
 */
export function itemErrorMessage(error) {
  const format = error && ITEM_ERROR_MESSAGES[error.code];
  return format ? format(error) : GENERIC_ERROR;
}

/**
 * Hỏi xác nhận rồi xoá mã hàng. Đây là **đường duy nhất** được phép gọi tới
 * `removeItem` từ UI (INV-U1: hành động phá huỷ luôn phải xác nhận).
 *
 * @param {object} opts
 * @param {{ntk: string}} opts.item      Dòng `items` cần xoá.
 * @param {(ntk: string) => Promise<{ok: boolean, error?: object}>} opts.onDelete
 *        Store action `removeItem(ntk)`.
 * @param {typeof import('react-native').Alert} opts.alert
 *        Chính là `Alert` của react-native. ⚠️ Truyền **object/class** `Alert`, KHÔNG
 *        phải `Alert.alert` — trong RN, `Alert` là `class` nên gọi `alert(...)` trực tiếp
 *        sẽ ném `TypeError: Class constructor Alert cannot be invoked without 'new'`.
 *        Hàm này tự gọi `alert.alert(...)`.
 * @param {(busy: boolean) => void} [opts.onBusy]      Bật/tắt trạng thái khoá nút.
 * @param {() => void} [opts.onSuccess]                Gọi sau khi xoá thành công.
 * @returns {Promise<{ok: boolean, error?: object}>}
 */
export function confirmDeleteItem({ item, onDelete, alert, onBusy, onSuccess }) {
  return new Promise(resolve => {
    alert.alert(DELETE_CONFIRM_TITLE, deleteConfirmMessage(item.ntk), [
      { text: DELETE_CANCEL_TEXT, style: 'cancel', onPress: () => resolve({ ok: false, error: { code: 'CANCELLED' } }) },
      {
        text: DELETE_CONFIRM_TEXT,
        style: 'destructive',
        onPress: async () => {
          if (onBusy) onBusy(true);
          try {
            const res = await onDelete(item.ntk);
            if (res && res.ok === false) {
              alert.alert(DELETE_ERROR_TITLE, itemErrorMessage(res.error));
              resolve({ ok: false, error: res.error });
              return;
            }
            if (onSuccess) onSuccess();
            resolve({ ok: true });
          } finally {
            if (onBusy) onBusy(false);
          }
        },
      },
    ]);
  });
}
