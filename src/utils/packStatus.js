// src/utils/packStatus.js
// Các hàm tiện ích tính toán trạng thái đóng kiện và dán nhãn.

/**
 * Tính toán trạng thái chi tiết của một dòng hàng trong kiện.
 * Quy tắc gạch ngang hoàn thành (isComplete): CHỈ khi số lượng đã đóng >= số lượng kế hoạch
 * VÀ sản phẩm đã được dán nhãn đầy đủ.
 *
 * @param {object} it { qty, packed_qty, is_labeled, note, done }
 * @returns {object}
 */
export function getItemPackInfo(it) {
  const plannedQty = Number(it?.qty) || 0;
  const packedQty = it?.packed_qty !== undefined ? Number(it.packed_qty) : (it?.done ? plannedQty : 0);
  const isLabeled = it?.is_labeled !== undefined ? Boolean(it.is_labeled) : Boolean(it?.done);
  const remaining = Math.max(0, plannedQty - packedQty);
  const isFullQty = plannedQty > 0 && packedQty >= plannedQty;
  const isComplete = Boolean(it?.done) && isFullQty && isLabeled;
  const isPartial = packedQty > 0 && packedQty < plannedQty;
  const isWaitingLabel = isFullQty && !isLabeled;
  const isUnpacked = packedQty === 0;

  return {
    plannedQty,
    packedQty,
    isLabeled,
    remaining,
    isFullQty,
    isComplete,
    isPartial,
    isWaitingLabel,
    isUnpacked,
  };
}
