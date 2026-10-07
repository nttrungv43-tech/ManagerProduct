// src/components/FinishOrderModal.js
import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';

/**
 * Modal lựa chọn mã PO để hoàn tất đơn hàng (FEAT-24).
 *
 * Cho phép người dùng:
 * 1. Chọn tất cả PO (hoàn tất toàn bộ như cũ).
 * 2. Hoặc tick chọn từng mã PO cụ thể để lưu trữ trước các PO đã xong,
 *    các PO chưa xong vẫn tiếp tục ở lại đơn active để sản xuất.
 */
export default function FinishOrderModal({
  visible,
  onClose,
  onConfirm,
  poList = [],
  finishing = false,
  theme,
}) {
  // Lọc an toàn các phần tử có code hợp lệ
  const safeList = useMemo(() => {
    return (Array.isArray(poList) ? poList : []).filter(item => Boolean(item && item.code));
  }, [poList]);

  const [selectedPos, setSelectedPos] = useState(() => new Set(safeList.map(p => String(p.code))));

  const allSelected = safeList.length > 0 && selectedPos.size === safeList.length;
  const noneSelected = selectedPos.size === 0;

  function togglePo(code) {
    const codeStr = String(code);
    setSelectedPos(prev => {
      const next = new Set(prev);
      if (next.has(codeStr)) {
        next.delete(codeStr);
      } else {
        next.add(codeStr);
      }
      return next;
    });
  }

  function handleSelectAll() {
    if (allSelected) {
      setSelectedPos(new Set());
    } else {
      setSelectedPos(new Set(safeList.map(p => String(p.code))));
    }
  }

  // Lọc danh sách các PO được chọn nhưng chưa đóng xong kiện
  const incompletePos = useMemo(() => {
    return safeList.filter(p => {
      const codeStr = String(p.code);
      const total = Number(p.palletsTotal) || 0;
      const done = Number(p.palletsDone) || 0;
      return selectedPos.has(codeStr) && total > 0 && done < total;
    });
  }, [safeList, selectedPos]);

  function handleConfirmPress() {
    if (noneSelected || finishing) return;

    const selectedCodes = [...selectedPos];
    const isAll = selectedCodes.length === safeList.length;

    let warningMsg = '';
    if (incompletePos.length > 0) {
      const names = incompletePos.map(p => `${p.code} (${p.palletsDone || 0}/${p.palletsTotal || 0} kiện)`).join(', ');
      warningMsg = `⚠️ Các PO sau chưa đóng xong kiện: ${names}.\n\n`;
    }

    const actionMsg = isAll
      ? `${warningMsg}Xác nhận hoàn tất TOÀN BỘ đơn hàng hiện tại?\nDữ liệu sẽ được lưu trữ và màn hình làm việc sẽ được dọn sạch để bắt đầu đơn mới.`
      : `${warningMsg}Xác nhận hoàn tất và lưu trữ ${selectedCodes.length} mã PO đã chọn?\nCác PO còn lại sẽ tiếp tục được giữ trên màn hình để sản xuất tiếp.`;

    Alert.alert('Xác nhận hoàn tất đơn hàng', actionMsg, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xác nhận',
        style: 'destructive',
        onPress: () => {
          onConfirm(selectedCodes);
        },
      },
    ]);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.dialog, { backgroundColor: theme.card, borderColor: theme.line }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.ink }]}>📦 Hoàn tất đơn hàng</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.closeIcon, { color: theme.sub }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: theme.sub }]}>
            Chọn các mã PO muốn hoàn tất và lưu trữ vào lịch sử:
          </Text>

          {/* Công cụ chọn nhanh */}
          <View style={styles.quickBar}>
            <TouchableOpacity
              style={[styles.quickBtn, { borderColor: theme.line, backgroundColor: theme.bg }]}
              onPress={handleSelectAll}
            >
              <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>
                {allSelected ? '☐ Bỏ chọn tất cả' : '☑ Chọn tất cả'}
              </Text>
            </TouchableOpacity>

            <Text style={{ color: theme.sub, fontSize: 12 }}>
              Đã chọn: <Text style={{ fontWeight: '700', color: theme.ink }}>{selectedPos.size}/{safeList.length}</Text> PO
            </Text>
          </View>

          {/* Danh sách PO */}
          <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: 4 }}>
            {safeList.length === 0 ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <Text style={{ color: theme.sub, fontSize: 13 }}>Chưa có mã PO nào trong đơn hàng hiện tại.</Text>
              </View>
            ) : (
              safeList.map(item => {
                const code = String(item.code);
                const checked = selectedPos.has(code);
                const palletsTotal = Number(item.palletsTotal) || 0;
                const palletsDone = Number(item.palletsDone) || 0;
                const hasPallets = palletsTotal > 0;
                const palletsComplete = hasPallets && palletsDone === palletsTotal;
                const produced = Number(item.produced) || 0;
                const target = Number(item.target) || 0;
                const defect = Number(item.defect) || 0;

                return (
                  <TouchableOpacity
                    key={code}
                    style={[
                      styles.poRow,
                      {
                        borderColor: checked ? theme.accent : theme.line,
                        backgroundColor: checked ? theme.bg : 'transparent',
                      },
                    ]}
                    onPress={() => togglePo(code)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.checkIconBox}>
                      <Text style={{ fontSize: 16, color: checked ? theme.accent : theme.sub }}>
                        {checked ? '☑' : '☐'}
                      </Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.poCode, { color: theme.ink }]}>
                          PO {code}
                        </Text>
                        {hasPallets && (
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor: palletsComplete ? theme.good : theme.warn,
                              },
                            ]}
                          >
                            <Text style={styles.badgeText}>
                              {palletsDone}/{palletsTotal} kiện
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={[styles.poSub, { color: theme.sub }]}>
                        Sản lượng: {produced.toLocaleString()}/{target.toLocaleString()} pcs
                        {defect > 0 ? ` · Lỗi: ${defect.toLocaleString()}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Ghi chú tóm tắt */}
          <View style={[styles.summaryBox, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <Text style={{ color: theme.sub, fontSize: 11.5, lineHeight: 16 }}>
              {noneSelected
                ? '⚠️ Vui lòng tick chọn ít nhất một mã PO để hoàn tất.'
                : allSelected
                ? 'ℹ️ Hoàn tất toàn bộ đơn: Dữ liệu sẽ lưu trữ và tạo đơn mới trắng.'
                : `ℹ️ Lưu trữ ${selectedPos.size} PO được chọn. ${safeList.length - selectedPos.size} PO còn lại vẫn tiếp tục sản xuất trên màn hình.`}
            </Text>
          </View>

          {/* Nút hành động */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn, { borderColor: theme.line }]}
              onPress={onClose}
              disabled={finishing}
            >
              <Text style={{ color: theme.ink, fontWeight: '600' }}>Huỷ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                styles.confirmBtn,
                {
                  backgroundColor: theme.bad,
                  opacity: noneSelected || finishing ? 0.5 : 1,
                },
              ]}
              onPress={handleConfirmPress}
              disabled={noneSelected || finishing}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {finishing ? '⏳ Đang lưu trữ…' : `✅ Hoàn tất (${selectedPos.size} PO)`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  subtitle: {
    fontSize: 12.5,
    marginBottom: 10,
  },
  quickBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickBtn: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  list: {
    maxHeight: 260,
  },
  poRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  checkIconBox: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 22,
  },
  poCode: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  poSub: {
    fontSize: 11.5,
    marginTop: 3,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '700',
  },
  summaryBox: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  confirmBtn: {
    minWidth: 140,
  },
});
