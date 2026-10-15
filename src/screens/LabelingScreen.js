// src/screens/LabelingScreen.js
// FEAT-28 — Màn hình quản lý dán nhãn sản phẩm (Checker Workspace).
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useColorScheme,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAppStore } from '@/store/useAppStore';
import { getTheme } from '@/theme';
import FilterChips from '@/components/FilterChips';
import ProgressBar from '@/components/ProgressBar';
import { parseQty } from '@/utils/validateQty';

export default function LabelingScreen() {
  const theme = getTheme(useColorScheme());
  const {
    unlabeledEntries,
    unlabeledSummary,
    markEntryFullyLabeled,
    updateEntryLabeledQty,
    refreshUnlabeledData,
  } = useAppStore();

  const [activePoFilter, setActivePoFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [partialTarget, setPartialTarget] = useState(null); // entry being partially labeled
  const [partialInputQty, setPartialInputQty] = useState('');
  const [busy, setBusy] = useState(false);

  // Tự động làm mới dữ liệu khi người dùng chuyển sang tab này
  useFocusEffect(
    useCallback(() => {
      refreshUnlabeledData();
    }, [refreshUnlabeledData])
  );

  // Danh sách các PO có hàng chờ dán nhãn để hiển thị bộ lọc FilterChips
  const poOptions = useMemo(() => {
    const pos = Array.from(new Set((unlabeledEntries || []).map(e => e.po).filter(Boolean)))
      .sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)));
    return [['all', 'Tất cả PO'], ...pos.map(po => [po, `PO ${po}`])];
  }, [unlabeledEntries]);

  // Lọc theo PO và từ khoá tìm kiếm (Mã hàng, PO, Ref)
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (unlabeledEntries || []).filter(item => {
      const matchPo = activePoFilter === 'all' || item.po === activePoFilter;
      const matchQuery =
        !q ||
        (item.ntk && item.ntk.toLowerCase().includes(q)) ||
        (item.po && item.po.toLowerCase().includes(q)) ||
        (item.refNo && item.refNo.toLowerCase().includes(q));
      return matchPo && matchQuery;
    });
  }, [unlabeledEntries, activePoFilter, searchQuery]);

  // 1-chạm xác nhận đã hoàn tất dán nhãn
  async function handleFastTrackComplete(item) {
    Alert.alert(
      'Xác nhận dán xong',
      `Đánh dấu đã hoàn thành dán nhãn toàn bộ ${item.unlabeled_qty} pcs cho mã ${item.ntk}${item.refNo ? ` (Ref: ${item.refNo})` : ''}?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: '✓ Đã dán xong',
          style: 'default',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await markEntryFullyLabeled(item.id);
              if (res && res.ok === false) {
                Alert.alert('Lỗi', res.error?.message || 'Không thể cập nhật dán nhãn');
              }
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  // Mở modal dán nhãn một phần
  function openPartialModal(item) {
    setPartialTarget(item);
    setPartialInputQty('');
  }

  // Đóng modal dán nhãn một phần
  function closePartialModal() {
    setPartialTarget(null);
    setPartialInputQty('');
  }

  // Xác nhận dán một phần
  async function handleConfirmPartial() {
    if (!partialTarget) return;
    const qtyNum = parseQty(partialInputQty);
    if (qtyNum === null || qtyNum <= 0) {
      Alert.alert('Số lượng không hợp lệ', 'Vui lòng nhập số nguyên lớn hơn 0.');
      return;
    }

    setBusy(true);
    try {
      const res = await updateEntryLabeledQty(partialTarget.id, qtyNum);
      if (res && res.ok === false) {
        Alert.alert('Lỗi', res.error?.message || 'Không thể cập nhật số lượng dán nhãn');
        return;
      }
      closePartialModal();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* HEADER KPI CARD */}
      <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="pricetag" size={24} color={theme.accent} />
          </View>
          <View style={styles.headerTitles}>
            <Text style={[styles.screenTitle, { color: theme.ink }]}>Quản lý Dán Nhãn</Text>
            <Text style={[styles.screenSubtitle, { color: theme.sub }]}>
              Khu vực Checker kiểm tra & xác nhận tem nhãn
            </Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={[styles.kpiItem, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <Text style={[styles.kpiLabel, { color: theme.sub }]}>Lô chờ dán</Text>
            <Text style={[styles.kpiValue, { color: unlabeledSummary.count > 0 ? theme.warn : theme.good }]}>
              {unlabeledSummary.count} <Text style={{ fontSize: 13, fontWeight: 'normal' }}>lô</Text>
            </Text>
          </View>

          <View style={[styles.kpiItem, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <Text style={[styles.kpiLabel, { color: theme.sub }]}>Tổng pcs chờ dán</Text>
            <Text style={[styles.kpiValue, { color: unlabeledSummary.totalPcs > 0 ? theme.warn : theme.good }]}>
              {unlabeledSummary.totalPcs.toLocaleString()} <Text style={{ fontSize: 13, fontWeight: 'normal' }}>pcs</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* SEARCH BAR & FILTER */}
      <View style={styles.searchSection}>
        <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Ionicons name="search" size={18} color={theme.sub} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.ink }]}
            placeholder="Tìm theo Mã hàng, Ref, PO..."
            placeholderTextColor={theme.sub}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.sub} />
            </TouchableOpacity>
          ) : null}
        </View>

        {poOptions.length > 2 && (
          <FilterChips
            options={poOptions}
            activeValue={activePoFilter}
            onSelect={setActivePoFilter}
            theme={theme}
          />
        )}
      </View>

      {/* DANH SÁCH LÔ HÀNG CHỜ DÁN NHÃN */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredList.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <Ionicons
              name={unlabeledSummary.count === 0 ? "checkmark-circle" : "search-outline"}
              size={56}
              color={unlabeledSummary.count === 0 ? theme.good : theme.sub}
              style={{ marginBottom: 12 }}
            />
            <Text style={[styles.emptyTitle, { color: theme.ink }]}>
              {unlabeledSummary.count === 0
                ? 'Tuyệt vời! Không có hàng chờ dán nhãn'
                : 'Không tìm thấy lô hàng nào'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.sub }]}>
              {unlabeledSummary.count === 0
                ? 'Toàn bộ sản lượng sản xuất hiện tại đã được dán tem nhãn hoàn chỉnh.'
                : 'Thử kiểm tra lại từ khoá tìm kiếm hoặc đổi bộ lọc PO.'}
            </Text>
          </View>
        ) : (
          filteredList.map(item => {
            const labeledQty = Math.max(item.qty - item.unlabeled_qty, 0);
            const pct = item.qty > 0 ? Math.round((labeledQty / item.qty) * 100) : 0;

            return (
              <View
                key={item.id}
                style={[styles.taskCard, { backgroundColor: theme.card, borderColor: theme.line }]}
              >
                {/* CARD HEADER */}
                <View style={styles.cardHeader}>
                  <View style={styles.headerBadges}>
                    <View style={[styles.poBadge, { backgroundColor: theme.accent + '20', borderColor: theme.accent }]}>
                      <Text style={[styles.poBadgeText, { color: theme.accent }]}>PO {item.po}</Text>
                    </View>
                    {item.refNo ? (
                      <View style={[styles.refBadge, { backgroundColor: '#3b82f618', borderColor: '#3b82f6' }]}>
                        <Text style={styles.refBadgeText}>Ref: {item.refNo}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.headerMeta}>
                    <Text style={[styles.metaText, { color: theme.sub }]}>{item.date}</Text>
                    <Text style={[styles.metaDot, { color: theme.line }]}>•</Text>
                    <Text style={[styles.metaText, { color: theme.sub }]}>
                      {item.line === 'manual' ? 'Thủ công' : 'Tự động'}
                    </Text>
                  </View>
                </View>

                {/* ITEM NTK */}
                <View style={styles.cardBody}>
                  <Text style={[styles.itemCode, { color: theme.ink }]}>{item.ntk}</Text>
                  <View style={[styles.statusTag, { backgroundColor: theme.warn + '18' }]}>
                    <Ionicons name="alert-circle" size={13} color={theme.warn} style={{ marginRight: 4 }} />
                    <Text style={[styles.statusTagText, { color: theme.warn }]}>Chờ dán nhãn</Text>
                  </View>
                </View>

                {/* PROGRESS & QUANTITIES */}
                <View style={styles.qtySection}>
                  <View style={styles.qtyRow}>
                    <Text style={[styles.qtyLabel, { color: theme.sub }]}>Tổng sản xuất: <Text style={{ fontWeight: '700', color: theme.ink }}>{item.qty}</Text></Text>
                    <Text style={[styles.qtyLabel, { color: theme.sub }]}>Đã dán: <Text style={{ fontWeight: '700', color: theme.good }}>{labeledQty}</Text></Text>
                    <Text style={[styles.qtyLabel, { color: theme.warn }]}>Chưa dán: <Text style={{ fontWeight: '800', color: theme.warn, fontSize: 15 }}>{item.unlabeled_qty}</Text></Text>
                  </View>

                  <View style={{ marginVertical: 6 }}>
                    <ProgressBar pct={pct} theme={theme} />
                  </View>
                </View>

                {/* ACTIONS */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.partialBtn, { borderColor: theme.line, backgroundColor: theme.bg }]}
                    onPress={() => openPartialModal(item)}
                    disabled={busy}
                  >
                    <Ionicons name="create-outline" size={15} color={theme.ink} style={{ marginRight: 4 }} />
                    <Text style={[styles.partialBtnText, { color: theme.ink }]}>Dán một phần...</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.completeBtn, { backgroundColor: theme.good }]}
                    onPress={() => handleFastTrackComplete(item)}
                    disabled={busy}
                  >
                    <Ionicons name="checkmark-done" size={16} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.completeBtnText}>✓ Đã dán xong</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* MODAL DÁN NHÃN MỘT PHẦN */}
      <Modal
        visible={Boolean(partialTarget)}
        transparent
        animationType="fade"
        onRequestClose={closePartialModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleBox}>
                <Ionicons name="pricetag-outline" size={20} color={theme.accent} style={{ marginRight: 6 }} />
                <Text style={[styles.modalTitle, { color: theme.ink }]}>Dán nhãn một phần</Text>
              </View>
              <TouchableOpacity onPress={closePartialModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={theme.sub} />
              </TouchableOpacity>
            </View>

            {partialTarget && (
              <View style={styles.modalBody}>
                <View style={styles.targetInfoBox}>
                  <Text style={[styles.targetNtk, { color: theme.ink }]}>{partialTarget.ntk}</Text>
                  <Text style={[styles.targetMeta, { color: theme.sub }]}>
                    PO {partialTarget.po} {partialTarget.refNo ? `• Ref: ${partialTarget.refNo}` : ''}
                  </Text>
                  <View style={[styles.unlabeledInfoBadge, { backgroundColor: theme.warn + '18' }]}>
                    <Text style={[styles.unlabeledInfoText, { color: theme.warn }]}>
                      Hiện còn chưa dán: <Text style={{ fontWeight: '800' }}>{partialTarget.unlabeled_qty} pcs</Text>
                    </Text>
                  </View>
                </View>

                <Text style={[styles.inputLabel, { color: theme.ink }]}>Số lượng vừa dán xong:</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.bg, borderColor: theme.line, color: theme.ink }]}
                  placeholder={`Ví dụ: 10, 50, ${partialTarget.unlabeled_qty}...`}
                  placeholderTextColor={theme.sub}
                  keyboardType="numeric"
                  value={partialInputQty}
                  onChangeText={setPartialInputQty}
                  autoFocus
                />

                {/* NÚT CHỌN NHANH */}
                <View style={styles.quickChipsRow}>
                  {[10, 20, 50, 100].map(n => {
                    if (n > partialTarget.unlabeled_qty) return null;
                    return (
                      <TouchableOpacity
                        key={n}
                        style={[styles.quickChip, { backgroundColor: theme.bg, borderColor: theme.line }]}
                        onPress={() => setPartialInputQty(String(n))}
                      >
                        <Text style={[styles.quickChipText, { color: theme.ink }]}>+{n}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[styles.quickChip, { backgroundColor: theme.accent + '20', borderColor: theme.accent }]}
                    onPress={() => setPartialInputQty(String(partialTarget.unlabeled_qty))}
                  >
                    <Text style={[styles.quickChipText, { color: theme.accent, fontWeight: '700' }]}>Tất cả</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: theme.line }]}
                    onPress={closePartialModal}
                    disabled={busy}
                  >
                    <Text style={[styles.modalCancelText, { color: theme.sub }]}>Huỷ</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalSubmitBtn, { backgroundColor: theme.accent }]}
                    onPress={handleConfirmPartial}
                    disabled={busy}
                  >
                    <Text style={styles.modalSubmitText}>Xác nhận</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerCard: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#d98f1e20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitles: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiItem: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  searchSection: {
    paddingHorizontal: 12,
    marginTop: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    height: '100%',
    padding: 0,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 24,
  },
  emptyContainer: {
    marginTop: 20,
    padding: 30,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  taskCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  poBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  poBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  refBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  refBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
  },
  metaDot: {
    marginHorizontal: 4,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemCode: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  qtySection: {
    marginVertical: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyLabel: {
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  partialBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partialBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  completeBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalHeaderTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalBody: {
    marginTop: 4,
  },
  targetInfoBox: {
    marginBottom: 12,
  },
  targetNtk: {
    fontSize: 16,
    fontWeight: '800',
  },
  targetMeta: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 6,
  },
  unlabeledInfoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  unlabeledInfoText: {
    fontSize: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  modalInput: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
