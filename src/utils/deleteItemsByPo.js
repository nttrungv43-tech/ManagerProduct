// src/utils/deleteItemsByPo.js
// FEAT-13 — Xoá toàn bộ mã hàng của một PO (xoá hàng loạt).
//
// Nguồn thông báo **thứ hai** cho thao tác xoá: file này chỉ nói về **xoá theo PO**;
// thông báo cho **xoá 1 mã** vẫn nằm trong `src/utils/deleteItem.js` (FEAT-11).
// Cả hai cùng dùng `itemErrorMessage()` để không bao giờ lệch nhãn/lý do (AC-EDIT-33/34, AC-DEL-12).
//
// Module cố tình KHÔNG import `react-native` để chạy được bằng
// `node scripts/test-deleteItemsByPo.mjs` mà không cần Expo (SPEC-test.md §11.2).
// `confirmDeleteItemsByPo` nhận `alert` từ bên ngoài — xem `confirmDeleteItem` (deleteItem.js L54-67):
// trong RN, `Alert` là `class`, gọi `alert(...)` trực tiếp sẽ ném TypeError ⇒ phải truyền chính object `Alert`.
//
// Import kèm đuôi `.js` là bắt buộc ở đây: Node ESM không tự thêm đuôi cho đường dẫn tương đối,
// còn Metro (Expo) chấp nhận cả hai dạng — giống cách `scripts/test-*.mjs` đã import file kèm đuôi.

import {
  DELETE_CANCEL_TEXT,
  DELETE_CONFIRM_TEXT,
  DELETE_CONFIRM_TITLE,
  DELETE_ERROR_TITLE,
  GENERIC_ERROR,
  itemErrorMessage,
} from './deleteItem.js';

/** Mã lỗi riêng của xoá hàng loạt — không trùng mã lỗi xoá 1 mã (`ITEM_*`). */
export const INVALID_PO_CODE = 'INVALID_PO';
export const PO_NO_ITEMS_CODE = 'PO_NO_ITEMS';
export const PO_HAS_ENTRIES_CODE = 'PO_HAS_ENTRIES';
export const PO_ITEMS_IN_PALLETS_CODE = 'PO_ITEMS_IN_PALLETS';

/** Nhãn nút xác nhận riêng của thao tác xoá hàng loạt (nhãn "Huỷ"/"Xoá" dùng chung). */
export const BULK_DELETE_BUTTON_TEXT = 'Xoá cả PO';
export const BULK_EMPTY_TEXT = 'Không có mã hàng nào thuộc PO này.';

/** Số kiện tối đa liệt kê trong thông báo lỗi trước khi gom thành "và N mã khác". */
const MAX_LISTED = 3;

/**
 * Số phân tách nghìn kiểu Việt Nam, **không** phụ thuộc `toLocaleString` của hệ điều hành
 * ⇒ chuỗi kiểm thử ổn định trên mọi máy (giống cách FEAT-09 chuẩn hoá số).
 * Dùng chung cho cả thông báo lẫn UI (`PoDeleteSheet`) để số hiện ra giống hệt nhau.
 */
export function formatNumber(n) {
  return String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Tách `po` thành danh sách PO. Một mã hàng có thể thuộc nhiều PO, nối bằng `+`
 * (ví dụ `'2600168+2600189'` — xem `SPEC-reference.md` §1.2).
 * Dùng **cùng** cách với `allPOs()`/`filteredItems()` để lọc luôn khớp chip lọc PO.
 * @param {string} po
 * @returns {string[]}
 */
export function splitPo(po) {
  return String(po ?? '')
    .split('+')
    .map(p => p.trim())
    .filter(Boolean);
}

/** Mã hàng thuộc nhiều PO (`po` có `+`). Q1 của FEAT-13: **không** xoá các mã này. */
export function isMultiPoItem(po) {
  return splitPo(po).length > 1;
}

/**
 * Chọn các mã hàng thuộc PO, phục vụ cả **preview** và **xoá thật** (cùng một hàm
 * ⇒ người dùng không bao giờ thấy preview khác với kết quả xoá).
 *
 * @param {Array<{ntk: string, po: string, target?: number}>} items
 * @param {string} po  Một PO đơn lẻ (không chứa `+`).
 * @param {{excludeMulti?: boolean}} [opts] `excludeMulti` mặc định `true` (Q1).
 * @returns {{matched: object[], multi: object[], totalTarget: number, itemCount: number}}
 *          `multi` = mã thuộc nhiều PO bị bỏ qua; `totalTarget` = tổng `target` của `matched`.
 */
export function selectItemsByPo(items, po, opts = {}) {
  const { excludeMulti = true } = opts;
  const targetPo = String(po ?? '').trim();
  const list = Array.isArray(items) ? items : [];
  if (!targetPo) return { matched: [], multi: [], totalTarget: 0, itemCount: 0 };

  const matched = [];
  const multi = [];
  for (const it of list) {
    const parts = splitPo(it?.po);
    if (!parts.includes(targetPo)) continue;
    if (excludeMulti && parts.length > 1) multi.push(it);
    else matched.push(it);
  }
  return {
    matched,
    multi,
    totalTarget: matched.reduce((s, it) => s + (Number(it?.target) || 0), 0),
    itemCount: matched.length,
  };
}

/**
 * Sau khi xoá, chip lọc PO có còn hợp lệ không? (Q5)
 * Nếu PO đang lọc không còn mã nào thì trả `true` ⇒ UI chuyển về `Tất cả PO`
 * để không kẹt ở màn hình trống.
 */
export function poFilterNeedsReset(activeFilter, items) {
  const po = String(activeFilter ?? '').trim();
  if (!po || po === 'all') return false;
  const list = Array.isArray(items) ? items : [];
  return !list.some(it => splitPo(it?.po).includes(po));
}

/**
 * Thân Alert xác nhận — nêu **đúng tên PO**, số mã và tổng pcs sắp mất, và nói rõ
 * không hoàn tác được (INV-U1). Cùng kiểu với `deleteConfirmMessage` của FEAT-11.
 *
 * @param {string} po
 * @param {{itemCount?: number, totalTarget?: number, multi?: Array<{ntk: string}>}} [preview]
 * @returns {string}
 */
export function bulkDeleteConfirmMessage(po, preview = {}) {
  const { itemCount = 0, totalTarget = 0, multi = [] } = preview;
  const lines = [
    `Xoá toàn bộ ${itemCount} mã hàng thuộc PO ${po}?`,
    `Tổng kế hoạch giảm ${formatNumber(totalTarget)} pcs.`,
  ];
  if (multi.length > 0) {
    lines.push(`Bỏ qua ${multi.length} mã thuộc nhiều PO (không thuộc riêng PO này).`);
  }
  lines.push('Thao tác này không thể hoàn tác.');
  return lines.join('\n');
}

/**
 * Dịch lỗi xoá hàng loạt sang thông điệp tiếng Việt (INV-U2).
 * Mã lạ / rỗng ⇒ thông báo chung, không crash (giống `itemErrorMessage`).
 *
 * @param {{code?: string, po?: string, items?: Array<{code: string, ntk: string, produced?: number, pallets?: number}>}} error
 * @returns {string}
 */
export function formatBulkDeleteError(error) {
  const po = error?.po;
  switch (error?.code) {
    case INVALID_PO_CODE:
      return 'PO không hợp lệ. Vui lòng chọn một PO.';
    case PO_NO_ITEMS_CODE:
      return `Không còn mã hàng nào thuộc PO ${po}.`;
    case PO_HAS_ENTRIES_CODE:
    case PO_ITEMS_IN_PALLETS_CODE: {
      const blocked = Array.isArray(error.items) ? error.items : [];
      const lines = [`Không thể xoá toàn bộ mã của PO ${po}.`, 'Các mã sau bị chặn:'];
      blocked.slice(0, MAX_LISTED).forEach(it => lines.push(`• ${itemErrorMessage(it)}`));
      if (blocked.length > MAX_LISTED) {
        lines.push(`• ... và ${blocked.length - MAX_LISTED} mã khác.`);
      }
      return lines.join('\n');
    }
    default:
      return GENERIC_ERROR;
  }
}

/**
 * Hỏi xác nhận rồi xoá toàn bộ mã của một PO. Là **đường duy nhất** được phép gọi
 * tới `removeItemsByPo` từ UI (INV-U1).
 *
 * @param {object} opts
 * @param {string} opts.po                          PO cần xoá (một PO đơn lẻ).
 * @param {{itemCount?: number, totalTarget?: number, multi?: Array<{ntk: string}>}} opts.preview
 *        Kết quả `previewItemsByPo` — dùng để nêu số liệu trước khi xoá.
 * @param {(po: string) => Promise<{ok: boolean, error?: object}>} opts.onDelete
 *        Store action `removeItemsByPo(po)`.
 * @param {typeof import('react-native').Alert} opts.alert
 *        Chính là `Alert` của react-native (object/class, KHÔNG phải `Alert.alert`).
 * @param {(busy: boolean) => void} [opts.onBusy]   Bật/tắt trạng thái khoá nút.
 * @param {() => void} [opts.onSuccess]             Gọi sau khi xoá thành công.
 * @returns {Promise<{ok: boolean, error?: object}>}
 */
export function confirmDeleteItemsByPo({ po, preview, onDelete, alert, onBusy, onSuccess }) {
  return new Promise(resolve => {
    alert.alert(DELETE_CONFIRM_TITLE, bulkDeleteConfirmMessage(po, preview), [
      {
        text: DELETE_CANCEL_TEXT,
        style: 'cancel',
        onPress: () => resolve({ ok: false, error: { code: 'CANCELLED' } }),
      },
      {
        text: DELETE_CONFIRM_TEXT,
        style: 'destructive',
        onPress: async () => {
          if (onBusy) onBusy(true);
          try {
            const res = await onDelete(po);
            if (res && res.ok === false) {
              alert.alert(DELETE_ERROR_TITLE, formatBulkDeleteError(res.error));
              resolve({ ok: false, error: res.error });
              return;
            }
            if (onSuccess) onSuccess();
            resolve({ ok: true, result: res });
          } finally {
            if (onBusy) onBusy(false);
          }
        },
      },
    ]);
  });
}