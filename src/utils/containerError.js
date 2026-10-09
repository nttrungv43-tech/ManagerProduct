// src/utils/containerError.js
// FEAT-25 — Thông điệp tiếng Việt cho các mã lỗi liên quan đến container (INV-U2).

/**
 * Trả về thông điệp lỗi tiếng Việt thân thiện với người dùng.
 * @param {object} error - Object lỗi { code, ... }
 * @returns {string} Thông báo lỗi
 */
export function containerErrorMessage(error) {
  switch (error?.code) {
    case 'INVALID_CONTAINER_NO':
      return 'Tên / mã container không được để trống.';
    case 'CONTAINER_EXISTS':
      return `Mã container "${error?.container_no}" đã tồn tại trong đơn hàng.`;
    case 'CONTAINER_NOT_FOUND':
      return 'Không tìm thấy container.';
    case 'INVALID_PO':
    case 'PO_NOT_FOUND':
      return 'Vui lòng chọn mã PO hợp lệ cho container.';
    default:
      return error?.message || 'Có lỗi xảy ra. Vui lòng thử lại.';
  }
}
