// src/utils/palletError.js
// Thông điệp tiếng Việt cho các mã lỗi liên quan đến kiện hàng (pallet).

/** Thông điệp tiếng Việt cho mã lỗi trả về từ queries.js (INV-U2). */
export function palletErrorMessage(error) {
  switch (error?.code) {
    case 'PALLET_EMPTY':
      return 'Kiện phải có ít nhất một loại hàng.';
    case 'INVALID_NTK':
      return 'Mã hàng không hợp lệ.';
    case 'DUPLICATE_NTK':
      return `Kiện không được có hai dòng cùng mã ${error.ntk}.`;
    case 'INVALID_PALLET_QTY':
      return 'Số lượng trong kiện phải là số nguyên lớn hơn 0.';
    case 'ITEM_NOT_IN_ORDER':
      return `Mã ${error.ntk} không có trong đơn hàng hiện tại.`;
    case 'INVALID_PALLET_NO':
      return 'Số hiệu kiện phải là số nguyên lớn hơn 0.';
    case 'PALLET_NO_IMMUTABLE':
      return 'Không thể đổi số hiệu kiện đã tồn tại.';
    case 'PALLET_EXISTS':
      return `Kiện ${error.no} đã tồn tại trong container này.`;
    case 'PALLET_NOT_FOUND':
      return `Không tìm thấy kiện ${error.no}.`;
    case 'CONTAINER_NOT_FOUND':
      return 'Không tìm thấy container.';
    default:
      return 'Có lỗi xảy ra. Vui lòng thử lại.';
  }
}
