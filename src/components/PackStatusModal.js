// src/components/PackStatusModal.js
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseQty } from '@/utils/validateQty';

export default function PackStatusModal({
  visible,
  item,
  palletNo,
  onClose,
  onSave,
  theme,
}) {
  const [packedQty, setPackedQty] = useState(() => {
    const pQty = item?.packed_qty !== undefined ? item.packed_qty : (item?.done ? item.qty : 0);
    return pQty > 0 ? String(pQty) : (item?.done ? String(item?.qty) : '');
  });
  const [isLabeled, setIsLabeled] = useState(() => {
    return item?.is_labeled !== undefined ? Boolean(item.is_labeled) : Boolean(item?.done);
  });
  const [note, setNote] = useState(() => item?.note || '');
  const [busy, setBusy] = useState(false);

  if (!visible || !item) return null;

  const plannedQty = Number(item.qty) || 0;
  const parsedPacked = packedQty === '' ? 0 : (parseQty(packedQty) ?? 0);
  const remaining = Math.max(0, plannedQty - parsedPacked);
  const isFullQty = plannedQty > 0 && parsedPacked >= plannedQty;
  const isOverQty = plannedQty > 0 && parsedPacked > plannedQty;
  const isCompleteAll = isFullQty && isLabeled;

  function handleQuickComplete() {
    setPackedQty(String(plannedQty));
    setIsLabeled(true);
  }

  function handleQuickReset() {
    setPackedQty('0');
    setIsLabeled(false);
  }

  async function handleSave() {
    if (busy) return;
    const parsed = packedQty.trim() === '' ? 0 : parseQty(packedQty);
    if (parsed === null || parsed < 0) {
      Alert.alert('Số lượng không hợp lệ', 'Số lượng đã đóng phải là số nguyên không âm.');
      return;
    }

    setBusy(true);
    try {
      await onSave({
        palletLineId: item.id,
        packedQty: parsed,
        isLabeled,
        note: note.trim(),
      });
      onClose();
    } catch (e) {
      Alert.alert('Lỗi', e?.message || 'Không thể lưu trạng thái đóng kiện.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.backdrop, { backgroundColor: '#0006' }]}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View
                style={[
                  styles.sheet,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.line,
                  },
                ]}
              >
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 24 }}
                >
                  {/* Header */}
                  <View style={styles.sheetHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.title, { color: theme.ink }]}>
                        📦 Tiến độ đóng kiện {palletNo}
                      </Text>
                      <View style={styles.itemMetaRow}>
                        <Text style={[styles.itemMetaText, { color: theme.sub }]}>
                          Mã <Text style={{ color: theme.ink, fontWeight: '700' }}>{item.ntk}</Text>
                          {item.po ? ` · PO ${item.po}` : ''}
                          {item.order_ref ? ` · Ref ${item.order_ref}` : ''}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={24} color={theme.sub} />
                    </TouchableOpacity>
                  </View>

                  {/* Thẻ trạng thái động */}
                  <View
                    style={[
                      styles.statusBanner,
                      {
                        backgroundColor: isCompleteAll
                          ? theme.good + '18'
                          : isFullQty && !isLabeled
                          ? theme.warn + '18'
                          : parsedPacked > 0
                          ? theme.accent + '15'
                          : theme.bg,
                        borderColor: isCompleteAll
                          ? theme.good
                          : isFullQty && !isLabeled
                          ? theme.warn
                          : parsedPacked > 0
                          ? theme.accent
                          : theme.line,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        isCompleteAll
                          ? 'checkmark-done-circle'
                          : isFullQty && !isLabeled
                          ? 'alert-circle'
                          : parsedPacked > 0
                          ? 'time'
                          : 'cube-outline'
                      }
                      size={20}
                      color={
                        isCompleteAll
                          ? theme.good
                          : isFullQty && !isLabeled
                          ? theme.warn
                          : parsedPacked > 0
                          ? theme.accent
                          : theme.sub
                      }
                      style={{ marginRight: 8 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.statusTitle,
                          {
                            color: isCompleteAll
                              ? theme.good
                              : isFullQty && !isLabeled
                              ? theme.warn
                              : parsedPacked > 0
                              ? theme.accent
                              : theme.ink,
                          },
                        ]}
                      >
                        {isCompleteAll
                          ? '✓ ĐÃ HOÀN THIỆN 100% (Đủ SL & Đã dán nhãn)'
                          : isFullQty && !isLabeled
                          ? '⚠️ ĐÃ ĐÓNG ĐỦ NHƯNG CHƯA DÁN NHÃN'
                          : parsedPacked > 0
                          ? `ĐANG ĐÓNG DỞ · THIẾU ${remaining.toLocaleString('vi-VN')} PCS`
                          : 'CHƯA ĐÓNG KIỆN'}
                      </Text>
                      <Text style={[styles.statusSub, { color: theme.sub }]}>
                        {isCompleteAll
                          ? 'Mã sản phẩm này sẽ được gạch ngang xác nhận hoàn thành.'
                          : isFullQty && !isLabeled
                          ? 'Cần dán nhãn đầy đủ để được tính là hoàn tất và gạch ngang.'
                          : parsedPacked > 0
                          ? `Đã đóng ${parsedPacked.toLocaleString('vi-VN')}/${plannedQty.toLocaleString('vi-VN')} pcs. Chưa được gạch ngang.`
                          : `Kế hoạch kiện: ${plannedQty.toLocaleString('vi-VN')} pcs.`}
                      </Text>
                    </View>
                  </View>

                  {/* Nút thao tác nhanh 1 chạm */}
                  <View style={styles.quickActionsRow}>
                    <TouchableOpacity
                      style={[styles.quickBtn, { backgroundColor: theme.good + '22', borderColor: theme.good }]}
                      onPress={handleQuickComplete}
                      disabled={busy}
                    >
                      <Ionicons name="flash" size={13} color={theme.good} style={{ marginRight: 4 }} />
                      <Text style={[styles.quickBtnText, { color: theme.good }]}>
                        Đóng đủ & Dán nhãn 100%
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.quickBtn, { backgroundColor: theme.bg, borderColor: theme.line }]}
                      onPress={handleQuickReset}
                      disabled={busy}
                    >
                      <Ionicons name="refresh" size={13} color={theme.sub} style={{ marginRight: 4 }} />
                      <Text style={[styles.quickBtnText, { color: theme.sub }]}>
                        Đặt về 0
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Mục 1: Nhập số lượng đã đóng */}
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.label(theme)}>1. Số lượng đã đóng (pcs)</Text>
                    <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>
                      Kế hoạch: {plannedQty.toLocaleString('vi-VN')} pcs
                    </Text>
                  </View>

                  <TextInput
                    style={[
                      styles.input(theme),
                      {
                        borderColor: isOverQty ? theme.warn : theme.line,
                      },
                    ]}
                    keyboardType="numeric"
                    placeholder={`Nhập số lượng (VD: ${plannedQty})`}
                    placeholderTextColor={theme.sub}
                    value={packedQty}
                    onChangeText={setPackedQty}
                    editable={!busy}
                  />

                  {/* Thống kê tiến độ số lượng */}
                  <View style={styles.calcRow}>
                    <Text style={{ color: theme.sub, fontSize: 12 }}>
                      Đã đóng: <Text style={{ color: isFullQty ? theme.good : theme.accent, fontWeight: '700' }}>{parsedPacked.toLocaleString('vi-VN')}</Text> pcs
                    </Text>
                    <Text style={{ color: remaining > 0 ? theme.warn : theme.good, fontSize: 12, fontWeight: '700' }}>
                      {remaining > 0 ? `Còn thiếu: ${remaining.toLocaleString('vi-VN')} pcs` : '✓ Đã đủ số lượng'}
                    </Text>
                  </View>

                  {/* Mục 2: Trạng thái dán nhãn */}
                  <Text style={styles.label(theme)}>2. Trạng thái dán nhãn tem</Text>
                  <View style={styles.labelToggleRow}>
                    <TouchableOpacity
                      style={[
                        styles.labelToggleBtn,
                        {
                          borderColor: isLabeled ? theme.good : theme.line,
                          backgroundColor: isLabeled ? theme.good : theme.bg,
                        },
                      ]}
                      onPress={() => setIsLabeled(true)}
                      disabled={busy}
                    >
                      <Ionicons
                        name={isLabeled ? 'checkmark-circle' : 'checkmark-circle-outline'}
                        size={16}
                        color={isLabeled ? '#fff' : theme.sub}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.labelToggleText,
                          { color: isLabeled ? '#fff' : theme.ink, fontWeight: isLabeled ? '700' : '500' },
                        ]}
                      >
                        🏷️ Đã dán nhãn đầy đủ
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.labelToggleBtn,
                        {
                          borderColor: !isLabeled ? theme.warn : theme.line,
                          backgroundColor: !isLabeled ? theme.warn : theme.bg,
                        },
                      ]}
                      onPress={() => setIsLabeled(false)}
                      disabled={busy}
                    >
                      <Ionicons
                        name={!isLabeled ? 'alert-circle' : 'alert-circle-outline'}
                        size={16}
                        color={!isLabeled ? '#fff' : theme.sub}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.labelToggleText,
                          { color: !isLabeled ? '#fff' : theme.ink, fontWeight: !isLabeled ? '700' : '500' },
                        ]}
                      >
                        ⚠️ Chưa dán nhãn
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Mục 3: Ghi chú tình trạng dở dang */}
                  <Text style={styles.label(theme)}>3. Ghi chú (tuỳ chọn)</Text>
                  <TextInput
                    style={[styles.input(theme), { minHeight: 46 }]}
                    placeholder="VD: Chờ thêm tem từ văn phòng, thiếu 20 cái..."
                    placeholderTextColor={theme.sub}
                    value={note}
                    onChangeText={setNote}
                    editable={!busy}
                  />

                  {/* Nút hành động */}
                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={[styles.btn, { backgroundColor: theme.sub }]}
                      onPress={onClose}
                      disabled={busy}
                    >
                      <Text style={styles.btnTxt}>Huỷ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, { backgroundColor: isCompleteAll ? theme.good : theme.accent, opacity: busy ? 0.6 : 1 }]}
                      onPress={handleSave}
                      disabled={busy}
                    >
                      <Ionicons name="save-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.btnTxt}>{busy ? 'Đang lưu…' : 'Lưu cập nhật'}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#0006',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16.5,
    fontWeight: '800',
  },
  itemMetaRow: {
    marginTop: 4,
  },
  itemMetaText: {
    fontSize: 13,
  },
  closeBtn: {
    padding: 2,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  statusTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  statusSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  label: theme => ({
    color: theme.sub,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 6,
  }),
  input: theme => ({
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.bg,
    color: theme.ink,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontWeight: '600',
  }),
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  labelToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  labelToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  labelToggleText: {
    fontSize: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 8,
  },
  btnTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
