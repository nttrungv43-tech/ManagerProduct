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

/**
 * Kiểm tra trạng thái chi tiết của từng dòng sản phẩm theo các tiêu chí lọc:
 * - isUnlabeled: Chưa dán nhãn (!isLabeled)
 * - isIncomplete: Chưa đóng đủ số lượng (!isFullQty)
 * - isBoth: Vừa chưa dán nhãn vừa chưa đủ số lượng
 *
 * @param {object} it
 * @returns {object}
 */
export function checkItemStatus(it) {
  const info = getItemPackInfo(it);
  const isUnlabeled = !info.isLabeled;
  const isIncomplete = !info.isFullQty;
  const isBoth = isUnlabeled && isIncomplete;
  return {
    ...info,
    isUnlabeled,
    isIncomplete,
    isBoth,
  };
}

/**
 * Kiểm tra tổng thể trạng thái của một kiện hàng (Pallet):
 * - hasUnlabeled: Kiện có ít nhất một mã hàng chưa dán nhãn
 * - hasIncomplete: Kiện có ít nhất một mã hàng chưa đóng đủ số lượng
 * - hasBoth: Kiện phát sinh cả hai vấn đề (có mã vừa thiếu SL vừa chưa nhãn,
 *   HOẶC kiện có mã thiếu SL và có mã chưa nhãn)
 *
 * @param {object} pallet
 * @returns {object} { hasUnlabeled: boolean, hasIncomplete: boolean, hasBoth: boolean }
 */
export function checkPalletStatus(pallet) {
  const items = pallet?.items || [];
  let hasUnlabeled = false;
  let hasIncomplete = false;
  let hasBoth = false;

  for (const it of items) {
    const info = getItemPackInfo(it);
    const unlab = !info.isLabeled;
    const incomp = !info.isFullQty;
    if (unlab) hasUnlabeled = true;
    if (incomp) hasIncomplete = true;
    if (unlab && incomp) hasBoth = true;
  }

  // Trường hợp kiện nhiều mã (Mix): Mã A chưa nhãn, Mã B chưa đủ SL
  if (!hasBoth && hasUnlabeled && hasIncomplete) {
    hasBoth = true;
  }

  return {
    hasUnlabeled,
    hasIncomplete,
    hasBoth,
  };
}

/**
 * Xác định kiện hàng có khớp với bộ lọc trạng thái hay không.
 *
 * @param {object} pallet
 * @param {'all' | 'unlabeled' | 'incomplete' | 'both'} statusFilter
 * @returns {boolean}
 */
export function isPalletMatchingStatus(pallet, statusFilter) {
  if (!statusFilter || statusFilter === 'all') return true;
  const { hasUnlabeled, hasIncomplete, hasBoth } = checkPalletStatus(pallet);
  if (statusFilter === 'unlabeled') return hasUnlabeled;
  if (statusFilter === 'incomplete') return hasIncomplete;
  if (statusFilter === 'both') return hasBoth;
  return true;
}

