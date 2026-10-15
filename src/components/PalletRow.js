// src/components/PalletRow.js
// FEAT-21 & FEAT-26 — Thiết kế giao diện kiện hàng tinh gọn (Clean Grid Row):
// - Kiện nhiều mã (2-7 mã): Ô Checkbox tổng 1-chạm hoàn tất cả kiện, hỗ trợ Thu gọn / Mở rộng.
// - Dòng sản phẩm tinh gọn: Bố cục 2 cột (Trái: Checkbox + Mã hàng + Ref/PO; Phải: Số lượng + Bút chì).
// - Nguyên tắc hiển thị: Ẩn bớt badge thừa khi bình thường; CHỈ làm nổi bật khi phát sinh ngoại lệ (đóng dở / chưa dán nhãn).
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getItemPackInfo } from '@/utils/packStatus';

export { getItemPackInfo };

export default function PalletRow({
  pallet,
  isMultiPo,
  onOpenPackModal,
  onToggleLabel,
  onToggleLine,
  onTogglePallet,
  onEditPallet,
  onDeletePallet,
  theme,
  highlightNtk = '',
}) {
  const qty = (pallet.items || []).reduce((s, it) => s + it.qty, 0);
  const palletPos = new Set((pallet.items || []).map(it => it.po).filter(Boolean));
  const hasMultiPo = Boolean(isMultiPo || palletPos.size > 1);
  const palletNo = pallet.pallet_no ?? pallet.no;

  // Tính trạng thái từng mã hàng
  const itemPackInfos = (pallet.items || []).map(it => ({ it, info: getItemPackInfo(it) }));
  const allDone = itemPackInfos.length > 0 && itemPackInfos.every(({ info }) => info.isComplete);
  const totalPacked = itemPackInfos.reduce((s, { info }) => s + info.packedQty, 0);
  const doneCount = itemPackInfos.filter(({ info }) => info.isComplete).length;

  // Mở rộng/thu gọn cho kiện nhiều mã (mặc định mở ra nếu chưa xong, thu gọn nếu đã xong)
  const [isExpanded, setIsExpanded] = useState(!allDone);

  // 1-chạm dòng sản phẩm
  function handleQuickToggle(it) {
    if (onToggleLine) {
      onToggleLine(it.id, Boolean(it.done));
    }
  }

  // 1-chạm toàn bộ kiện (Master Toggle)
  function handleMasterToggle() {
    if (onTogglePallet) {
      onTogglePallet(pallet.id, allDone);
    } else if (onToggleLine) {
      pallet.items.forEach(it => onToggleLine(it.id, allDone));
    }
  }

  const actions = (onEditPallet || onDeletePallet) ? (
    <View style={styles.actions}>
      {onEditPallet && (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onEditPallet(pallet)}>
          <Ionicons name="pencil" size={12} color={theme.accent} style={{ marginRight: 3 }} />
          <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 12 }}>Sửa kiện</Text>
        </TouchableOpacity>
      )}
      {onDeletePallet && (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onDeletePallet(pallet)}>
          <Ionicons name="trash-outline" size={12} color={theme.bad} style={{ marginRight: 3 }} />
          <Text style={{ color: theme.bad, fontWeight: '600', fontSize: 12 }}>Xoá kiện</Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  // Render 1 dòng sản phẩm tinh gọn (áp dụng cho cả kiện 1 mã và kiện nhiều mã)
  function renderCleanItemRow(it, packInfo, isMatch, isMatchRef) {
    const { plannedQty, packedQty, isComplete, isPartial, isWaitingLabel, remaining } = packInfo;

    let checkBorderColor = theme.line;
    let checkBgColor = theme.bg;
    let checkIcon = null;

    if (isComplete) {
      checkBorderColor = theme.good;
      checkBgColor = theme.good;
      checkIcon = <Ionicons name="checkmark" size={14} color="#fff" />;
    } else if (isWaitingLabel) {
      checkBorderColor = theme.bad;
      checkBgColor = theme.bad + '18';
      checkIcon = <Ionicons name="pricetag-outline" size={12} color={theme.bad} />;
    } else if (isPartial) {
      checkBorderColor = theme.warn;
      checkBgColor = theme.warn + '18';
      checkIcon = <Ionicons name="hourglass-outline" size={12} color={theme.warn} />;
    }

    return (
      <View key={it.id} style={[styles.itemContainer, { borderBottomColor: theme.line + '35' }]}>
        <View style={styles.itemMainRow}>
          {/* Cột trái: Checkbox + Tên mã hàng (bold) + Ref / PO phụ */}
          <View style={styles.itemLeftCol}>
            <TouchableOpacity
              style={[
                styles.checkSm,
                {
                  borderColor: checkBorderColor,
                  backgroundColor: checkBgColor,
                },
              ]}
              onPress={() => handleQuickToggle(it)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              {checkIcon}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => handleQuickToggle(it)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text
                  style={[
                    styles.itemCodeText,
                    {
                      color: isComplete ? theme.good : theme.ink,
                      textDecorationLine: isComplete ? 'line-through' : 'none',
                      opacity: isComplete ? 0.8 : 1,
                      backgroundColor: isMatch ? theme.accent + '35' : 'transparent',
                    },
                  ]}
                >
                  {it.ntk}
                </Text>
              </View>

              {/* Dòng phụ tinh gọn: Ref & PO */}
              {(Boolean(it.order_ref) || (hasMultiPo && Boolean(it.po))) && (
                <Text style={[styles.metaSubtext, { color: theme.sub }]} numberOfLines={1}>
                  {it.order_ref ? (
                    <Text style={{ color: isMatchRef ? theme.accent : theme.sub, fontWeight: isMatchRef ? '700' : '500' }}>
                      Ref {it.order_ref}
                    </Text>
                  ) : ''}
                  {it.order_ref && hasMultiPo && it.po ? ' · ' : ''}
                  {hasMultiPo && it.po ? `PO ${it.po}` : ''}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Cột phải: Số lượng pcs + Icon bút chì sửa */}
          <View style={styles.itemRightCol}>
            <TouchableOpacity
              onPress={() => handleQuickToggle(it)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.itemQtyNumber,
                  {
                    color: isComplete ? theme.good : theme.ink,
                    textDecorationLine: isComplete ? 'line-through' : 'none',
                    opacity: isComplete ? 0.8 : 1,
                  },
                ]}
              >
                {isPartial ? (
                  <>
                    <Text style={{ color: theme.warn, fontWeight: '800' }}>{packedQty.toLocaleString('vi-VN')}</Text>
                    <Text style={{ fontSize: 11.5, color: theme.sub }}>/{plannedQty.toLocaleString('vi-VN')}</Text>
                  </>
                ) : (
                  plannedQty.toLocaleString('vi-VN')
                )} <Text style={{ fontSize: 11, fontWeight: '400', color: theme.sub }}>pcs</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.iconEditBtn,
                {
                  borderColor: isPartial ? theme.warn : theme.line,
                  backgroundColor: isPartial ? theme.warn + '18' : theme.card,
                },
              ]}
              onPress={() => onOpenPackModal && onOpenPackModal(it, palletNo)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="create-outline"
                size={13}
                color={isPartial ? theme.warn : theme.accent}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Thanh cảnh báo nhỏ gọn: CHỈ HIỆN KHI ĐÓNG DỞ DANG */}
        {isPartial && (
          <TouchableOpacity
            style={[styles.slimAlertBanner, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}
            onPress={() => onOpenPackModal && onOpenPackModal(it, palletNo)}
            activeOpacity={0.8}
          >
            <Ionicons name="hourglass-outline" size={12} color="#b45309" style={{ marginRight: 4 }} />
            <Text style={[styles.slimAlertText, { color: '#92400e' }]}>
              Đã đóng: <Text style={{ fontWeight: '800', color: '#b45309' }}>{packedQty.toLocaleString('vi-VN')}</Text> pcs · Còn thiếu:{' '}
              <Text style={{ fontWeight: '800', color: '#b45309' }}>{remaining.toLocaleString('vi-VN')}</Text> pcs
            </Text>
            <Ionicons name="pencil" size={10} color="#b45309" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}

        {/* Thanh cảnh báo nhỏ gọn: CHỈ HIỆN KHI CHƯA DÁN NHÃN */}
        {isWaitingLabel && (
          <TouchableOpacity
            style={[styles.slimAlertBanner, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}
            onPress={() => onToggleLabel && onToggleLabel(it.id)}
            activeOpacity={0.8}
          >
            <Ionicons name="alert-circle" size={12} color="#b91c1c" style={{ marginRight: 4 }} />
            <Text style={[styles.slimAlertText, { color: '#991b1b' }]}>
              CHƯA DÁN NHÃN · <Text style={{ textDecorationLine: 'underline', fontWeight: '700' }}>Bấm để dán ✓</Text>
            </Text>
          </TouchableOpacity>
        )}

        {/* Ghi chú nếu có */}
        {Boolean(it.note) && (
          <TouchableOpacity
            style={styles.slimNoteRow}
            onPress={() => onOpenPackModal && onOpenPackModal(it, palletNo)}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={11} color={theme.sub} style={{ marginRight: 4, marginTop: 1 }} />
            <Text style={[styles.slimNoteText, { color: theme.sub }]} numberOfLines={1}>
              {it.note}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // --------------------------------------------------------------------------
  // TRƯỜNG HỢP 1: Kiện nhiều mã hàng (2-7 sản phẩm)
  // --------------------------------------------------------------------------
  if (pallet.items.length > 1) {
    return (
      <View style={[styles.palletCard, { borderTopColor: theme.line }]}>
        {/* Tiêu đề kiện tổng hợp: Master Checkbox + Tiến độ + Nút Thu gọn/Mở rộng */}
        <View style={styles.masterHeader}>
          <TouchableOpacity
            style={[
              styles.checkLg,
              {
                borderColor: allDone ? theme.good : (totalPacked > 0 ? theme.warn : theme.line),
                backgroundColor: allDone ? theme.good : (totalPacked > 0 ? theme.warn + '18' : theme.bg),
              },
            ]}
            onPress={handleMasterToggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            {allDone ? (
              <Ionicons name="checkmark" size={18} color="#fff" />
            ) : totalPacked > 0 ? (
              <Ionicons name="hourglass-outline" size={14} color={theme.warn} />
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => setIsExpanded(v => !v)}
            activeOpacity={0.7}
          >
            <View style={styles.masterTitleRow}>
              <Text
                style={[
                  styles.title,
                  {
                    color: allDone ? theme.good : theme.ink,
                    textDecorationLine: allDone ? 'line-through' : 'none',
                    opacity: allDone ? 0.8 : 1,
                  },
                ]}
              >
                Kiện {palletNo} — {qty.toLocaleString('vi-VN')} pcs
              </Text>
              <View style={styles.masterPill}>
                <Text style={{ fontSize: 12, color: allDone ? theme.good : theme.accent, fontWeight: '700' }}>
                  {allDone ? 'Xong 100%' : `${doneCount}/${pallet.items.length} mã`}
                </Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={theme.sub}
                />
              </View>
            </View>

            <Text style={{ fontSize: 11.5, color: theme.sub, marginTop: 1 }}>
              {pallet.items.length} loại hàng{hasMultiPo ? ` · ${palletPos.size} PO` : ''}
              {!allDone && totalPacked > 0 ? ` · Đã đóng ${totalPacked.toLocaleString('vi-VN')} pcs` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Danh sách các sản phẩm trong kiện khi mở rộng */}
        {isExpanded && (
          <View style={styles.itemsBox}>
            {itemPackInfos.map(({ it, info }) => {
              const q = highlightNtk.trim().toLowerCase();
              const isMatch = Boolean(q && String(it.ntk || '').toLowerCase().includes(q));
              const isMatchRef = Boolean(q && it.order_ref && String(it.order_ref).toLowerCase().includes(q));
              return renderCleanItemRow(it, info, isMatch, isMatchRef);
            })}
          </View>
        )}

        {actions}
      </View>
    );
  }

  // --------------------------------------------------------------------------
  // TRƯỜNG HỢP 2: Kiện một mã hàng
  // --------------------------------------------------------------------------
  const line = pallet.items[0];
  const packInfo = getItemPackInfo(line);
  const done = packInfo.isComplete;

  const q = highlightNtk.trim().toLowerCase();
  const isMatchSingle = Boolean(q && String(line?.ntk || '').toLowerCase().includes(q));
  const isMatchRefSingle = Boolean(q && line?.order_ref && String(line.order_ref).toLowerCase().includes(q));

  let checkBorderColor = theme.line;
  let checkBgColor = theme.bg;
  let checkIcon = null;

  if (done) {
    checkBorderColor = theme.good;
    checkBgColor = theme.good;
    checkIcon = <Ionicons name="checkmark" size={18} color="#fff" />;
  } else if (packInfo.isWaitingLabel) {
    checkBorderColor = theme.bad;
    checkBgColor = theme.bad + '18';
    checkIcon = <Ionicons name="pricetag-outline" size={14} color={theme.bad} />;
  } else if (packInfo.isPartial) {
    checkBorderColor = theme.warn;
    checkBgColor = theme.warn + '18';
    checkIcon = <Ionicons name="hourglass-outline" size={14} color={theme.warn} />;
  }

  return (
    <View style={[styles.palletCard, { borderTopColor: theme.line }]}>
      <View style={styles.masterHeader}>
        <TouchableOpacity
          style={[
            styles.checkLg,
            {
              borderColor: checkBorderColor,
              backgroundColor: checkBgColor,
            },
          ]}
          onPress={() => line && handleQuickToggle(line)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          {checkIcon}
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <TouchableOpacity
            disabled={!line}
            onPress={() => line && handleQuickToggle(line)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.title,
                {
                  color: done ? theme.good : theme.ink,
                  textDecorationLine: done ? 'line-through' : 'none',
                  opacity: done ? 0.8 : 1,
                },
              ]}
            >
              Kiện {palletNo} — {qty.toLocaleString('vi-VN')} pcs
            </Text>
          </TouchableOpacity>
          {line ? renderCleanItemRow(line, packInfo, isMatchSingle, isMatchRefSingle) : null}
        </View>
      </View>
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  palletCard: {
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  masterHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  masterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  masterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  checkLg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkSm: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  itemsBox: {
    marginTop: 6,
    paddingLeft: 38,
    gap: 2,
  },
  itemContainer: {
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemLeftCol: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 10,
    marginRight: 8,
  },
  itemCodeText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  metaSubtext: {
    fontSize: 11.5,
    marginTop: 1,
  },
  itemRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemQtyNumber: {
    fontSize: 13,
    fontWeight: '700',
  },
  iconEditBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slimAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 4,
    marginLeft: 32,
  },
  slimAlertText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  slimNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 32,
    marginTop: 2,
  },
  slimNoteText: {
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
    paddingLeft: 40,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
});