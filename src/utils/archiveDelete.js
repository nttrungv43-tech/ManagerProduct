// src/utils/archiveDelete.js
// FEAT-15 — Nguồn sự thật DUY NHẤT cho thông báo **xoá đơn hàng lưu trữ**
// (nội dung `Alert` + bảng dịch mã lỗi). `ContainersScreen.js` không tự chế thông điệp.
//
// Module cố tình KHÔNG import từ 'react-native' để chạy được bằng
// `node scripts/test-archiveDelete.mjs` mà không cần Expo (SPEC-test.md §11.2).
// `confirmDeleteArchive` nhận `alert` từ bên ngoài (chính là `Alert` của react-native).
//
// Vì sao thông báo phải nêu rõ "Lịch sử sẽ giảm" (INV-B4): `deleteArchive` xoá cả
// `entries` (bắt buộc theo INV-D5) ⇒ tổng ở tab Lịch sử của ngày đó giảm theo.

import { formatNumber } from './deleteItemsByPo.js';

/** Nhãn dùng chung cho hộp thoại xoá đơn lưu trữ (AC-ARCH-04). */
export const ARCHIVE_DELETE_CONFIRM_TITLE = 'Xoá đơn hàng đã lưu trữ?';
export const ARCHIVE_DELETE_CANCEL_TEXT = 'Huỷ';
export const ARCHIVE_DELETE_CONFIRM_TEXT = 'Xoá hẳn';
export const ARCHIVE_DELETE_ERROR_TITLE = 'Không xoá được';

/** Thông báo lỗi dùng chung cho mã lỗi lạ/thiếu (INV-U2). */
export const GENERIC_ERROR = 'Có lỗi xảy ra. Vui lòng thử lại.';

/**
 * Nội dung hộp thoại xác nhận: đủ số liệu để người dùng **nhận ra** đơn mình đang xoá
 * (ngày hoàn tất, sản lượng, số mã/nhật ký/kiện) + cảnh báo hậu quả (AC-ARCH-04, INV-B4).
 *
 * @param {{finishedDate?: string|null, produced?: number, target?: number, defect?: number,
 *          itemCount?: number, entryCount?: number, palletCount?: number}} preview
 *        Kết quả `queries.previewArchiveDelete(batchId)` (thiếu dữ liệu ⇒ hiện 0).
 * @returns {string}
 */
export function archiveDeleteConfirmMessage(preview) {
  const p = preview || {};
  const lines = [
    p.finishedDate ? `Đơn hoàn tất ngày ${p.finishedDate}.` : null,
    `Đã sản xuất ${formatNumber(p.produced)}/${formatNumber(p.target)} pcs.`,
    `Số mã hàng: ${p.itemCount ?? 0} · Số nhật ký: ${p.entryCount ?? 0} · Số kiện: ${p.palletCount ?? 0}.`,
    p.defect ? `Lỗi: ${formatNumber(p.defect)} pcs.` : null,
    '',
    'Xoá hẳn sẽ xoá vĩnh viễn dữ liệu đơn này và KHÔNG thể hoàn tác.',
    'Số liệu ở tab Lịch sử cũng sẽ giảm theo.',
  ];
  return lines.filter(line => line !== null).join('\n');
}

/**
 * Mã lỗi từ `queries.js` → thông điệp tiếng Việt.
 * `INVALID_BATCH_ID` · `BATCH_ACTIVE` · `ARCHIVE_NOT_FOUND` · `BUSY` · `DB_ERROR`
 */
export const ARCHIVE_ERROR_MESSAGES = {
  INVALID_BATCH_ID: () => 'Đơn hàng cần xoá không hợp lệ.',
  BATCH_ACTIVE: () => 'Không thể xoá đơn hàng đang làm. Chỉ xoá được đơn đã lưu trữ.',
  ARCHIVE_NOT_FOUND: () => 'Không tìm thấy đơn hàng đã lưu trữ này. Danh sách sẽ được tải lại.',
  BUSY: () => 'Đang xử lý thao tác trước, vui lòng thử lại.',
  DB_ERROR: () => 'Không xoá được dữ liệu. Vui lòng thử lại.',
  CANCELLED: () => 'Đã huỷ xoá đơn hàng.',
};

/**
 * Dịch lỗi sang thông điệp tiếng Việt.
 * @param {{code?: string}|string|null|undefined} error Object lỗi hoặc mã lỗi thuần.
 * @returns {string} Mã lạ/thiếu ⇒ thông báo chung (không lộ chi tiết kỹ thuật).
 */
export function archiveDeleteErrorMessage(error) {
  const code = typeof error === 'string' ? error : error?.code;
  const format = code && ARCHIVE_ERROR_MESSAGES[code];
  return format ? format(error) : GENERIC_ERROR;
}

/**
 * Chuẩn hoá lỗi bất kỳ về mã lỗi đã biết.
 * Transaction có thể ném `Error` thuần (mã nằm ở `err.code` hoặc `err.message`).
 * @param {any} err
 * @returns {string}
 */
export function archiveDeleteErrorCode(err) {
  const code = err?.code || err?.message;
  return typeof code === 'string' && ARCHIVE_ERROR_MESSAGES[code] ? code : 'DB_ERROR';
}

/**
 * Hỏi xác nhận rồi xoá đơn lưu trữ. Đây là **đường duy nhất** được phép gọi tới
 * `deleteArchive` từ UI (INV-U1: hành động phá huỷ luôn phải xác nhận).
 *
 * @param {object} opts
 * @param {object} opts.preview       Kết quả `queries.previewArchiveDelete(batchId)`.
 * @param {(batchId: number) => Promise<{ok: boolean, error?: object}>} opts.onDelete
 *        Store action `deleteArchive(batchId)`.
 * @param {typeof import('react-native').Alert} opts.alert
 *        Chính là `Alert` của react-native. ⚠️ Truyền **object/class** `Alert`, KHÔNG
 *        phải `Alert.alert` — trong RN `Alert` là `class`, gọi `alert(...)` trực tiếp sẽ ném
 *        `TypeError`. Hàm này tự gọi `alert.alert(...)`.
 * @param {() => void} [opts.onBusy]   Bật/tắt khoá nút trong lúc ghi.
 * @returns {Promise<{ok: boolean, error?: object}>}
 */
export function confirmDeleteArchive({ preview, onDelete, alert, onBusy }) {
  return new Promise(resolve => {
    alert.alert(ARCHIVE_DELETE_CONFIRM_TITLE, archiveDeleteConfirmMessage(preview), [
      {
        text: ARCHIVE_DELETE_CANCEL_TEXT,
        style: 'cancel',
        onPress: () => resolve({ ok: false, error: { code: 'CANCELLED' } }),
      },
      {
        text: ARCHIVE_DELETE_CONFIRM_TEXT,
        style: 'destructive',
        onPress: async () => {
          if (onBusy) onBusy(true);
          try {
            const res = await onDelete(preview.id);
            if (res && res.ok === false) {
              alert.alert(ARCHIVE_DELETE_ERROR_TITLE, archiveDeleteErrorMessage(res.error));
              resolve({ ok: false, error: res.error });
              return;
            }
            resolve({ ok: true });
          } catch (e) {
            const code = archiveDeleteErrorCode(e);
            alert.alert(ARCHIVE_DELETE_ERROR_TITLE, archiveDeleteErrorMessage(code));
            resolve({ ok: false, error: { code } });
          } finally {
            if (onBusy) onBusy(false);
          }
        },
      },
    ]);
  });
}