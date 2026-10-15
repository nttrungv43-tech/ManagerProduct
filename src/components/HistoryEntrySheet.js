// src/components/HistoryEntrySheet.js
// FEAT-27 — Form thêm / sửa lịch sử sản xuất trong tab Lịch sử.
import React, { useState, useRef, useEffect } from 'react';
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
import { Picker } from '@react-native-picker/picker';
import DateSelectorBar from '@/components/DateSelectorBar';
import { parseQty } from '@/utils/validateQty';
import { todayLocal } from '@/utils/date';

export default function HistoryEntrySheet({
  entry = null,
  initialDate = null,
  items = [],
  onClose,
  onSubmit,
  onDelete,
  theme,
}) {
  const isEdit = Boolean(entry);

  // Chọn dòng đơn hàng (PO × Mã hàng)
  const defaultLineId = entry?.orderLineId ?? (items.length > 0 ? items[0].order_line_id : '');
  const [selectedOrderLineId, setSelectedOrderLineId] = useState(defaultLineId);

  // Tìm thông tin order_line đang chọn để lấy danh sách refs
  const selectedItem = items.find(it => it.order_line_id === selectedOrderLineId);
  const availableRefs = selectedItem?.refs || [];

  // Form states
  const [date, setDate] = useState(entry?.date ?? (initialDate || todayLocal()));
  const [line, setLine] = useState(entry?.line ?? 'auto');
  const [qty, setQty] = useState(entry ? String(entry.qty) : '');
  const [defectQty, setDefectQty] = useState(entry?.defect_qty ? String(entry.defect_qty) : '');
  const [defectBoxQty, setDefectBoxQty] = useState(entry?.defect_box_qty ? String(entry.defect_box_qty) : '');
  const [selectedRef, setSelectedRef] = useState(entry?.refNo ?? '');
  const [defectTypes, setDefectTypes] = useState(() => {
    const types = entry?.defect_types || [];
    return {
      yellow: types.includes('yellow'),
      red: types.includes('red'),
      tear: types.includes('tear'),
    };
  });
  const isUnlabeledInitially = entry ? (entry.is_labeled === 0 || (entry.unlabeled_qty && entry.unlabeled_qty > 0)) : false;
  const [isUnlabeled, setIsUnlabeled] = useState(isUnlabeledInitially);
  const [unlabeledQty, setUnlabeledQty] = useState(entry?.unlabeled_qty ? String(entry.unlabeled_qty) : '');
  const [busy, setBusy] = useState(false);

  // Tránh bàn phím che mất input
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, e => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToInput = yOffset => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: yOffset, animated: true });
    }, 120);
  };

  function toggleDefectType(type) {
    setDefectTypes(prev => ({ ...prev, [type]: !prev[type] }));
  }

  async function handleSave() {
    if (busy) return;

    if (!isEdit && !selectedOrderLineId) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn mã hàng.');
      return;
    }

    const trimmedDate = String(date ?? '').trim();
    if (!trimmedDate) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn ngày sản xuất.');
      return;
    }

    const parsedQty = parseQty(qty);
    if (parsedQty === null || parsedQty <= 0) {
      Alert.alert('Số lượng không hợp lệ', 'Số lượng sản xuất phải là số nguyên lớn hơn 0.');
      return;
    }

    let parsedDefect = 0;
    if (defectQty && defectQty.trim()) {
      const dq = parseQty(defectQty);
      if (dq === null || dq < 0) {
        Alert.alert('Số lượng SP lỗi không hợp lệ', 'Số lượng sản phẩm lỗi phải là số nguyên không âm.');
        return;
      }
      parsedDefect = dq;
    }

    let parsedDefectBox = 0;
    if (defectBoxQty && defectBoxQty.trim()) {
      const dbq = parseQty(defectBoxQty);
      if (dbq === null || dbq < 0) {
        Alert.alert('Số lượng thùng lỗi không hợp lệ', 'Số lượng thùng lỗi phải là số nguyên không âm.');
        return;
      }
      parsedDefectBox = dbq;
    }

    const activeTypes = (parsedDefect > 0 || parsedDefectBox > 0)
      ? Object.keys(defectTypes).filter(k => defectTypes[k])
      : [];

    setBusy(true);
    try {
      const parsedUnlabeled = isUnlabeled
        ? (unlabeledQty && unlabeledQty.trim() ? parseQty(unlabeledQty) : parsedQty)
        : 0;
      const payload = {
        orderLineId: isEdit ? entry.orderLineId : selectedOrderLineId,
        date: trimmedDate,
        qty: parsedQty,
        line,
        defectQty: parsedDefect,
        defectBoxQty: parsedDefectBox,
        defectTypes: activeTypes,
        refNo: selectedRef || null,
        isLabeled: isUnlabeled ? 0 : 1,
        unlabeledQty: parsedUnlabeled,
      };

      const res = await onSubmit(payload);
      if (res && res.ok === false) {
        if (res.error?.code === 'OVER_TARGET') {
          Alert.alert(
            'Vượt kế hoạch',
            `Số lượng sản xuất vượt quá kế hoạch còn lại của mã hàng.`
          );
        } else if (res.error?.code === 'OVER_REF_TARGET') {
          Alert.alert(
            'Vượt hạn mức Ref',
            `Số lượng sản xuất vượt quá hạn mức của số hiệu Ref ${selectedRef}.`
          );
        } else {
          Alert.alert('Không lưu được', res.error?.message || 'Lỗi khi lưu lịch sử sản xuất.');
        }
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function handleDelete() {
    if (busy || !isEdit || !onDelete) return;
    Alert.alert(
      'Xác nhận xoá lịch sử',
      `Xoá lượt sản xuất ${entry.qty.toLocaleString('vi-VN')} pcs (Mã ${entry.ntk} · PO ${entry.po}) ngày ${entry.date}?\nSố lượng đã sản xuất sẽ giảm tương ứng. Thao tác không thể hoàn tác.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá lượt này',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await onDelete(entry.id);
              onClose();
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
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
                  ref={scrollViewRef}
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: keyboardHeight > 0 ? 80 : 30 }}
                >
                  <Text style={[styles.title, { color: theme.ink }]}>
                    {isEdit ? '✏️ Sửa lịch sử sản xuất' : '＋ Thêm lịch sử sản xuất'}
                  </Text>

                  {/* Chọn ngày sản xuất */}
                  <DateSelectorBar
                    selectedDate={date}
                    onSelectDate={setDate}
                    theme={theme}
                    label="Ngày sản xuất:"
                  />

                  {/* Mã hàng & PO */}
                  {isEdit ? (
                    <View style={[styles.infoBadge, { backgroundColor: theme.bg, borderColor: theme.line }]}>
                      <Text style={{ color: theme.sub, fontSize: 13 }}>
                        Đang sửa: <Text style={{ color: theme.ink, fontWeight: '700' }}>Mã {entry.ntk}</Text>
                        {' · '}
                        <Text style={{ color: theme.accent, fontWeight: '700' }}>PO {entry.po}</Text>
                        {entry.refNo ? ` · Ref ${entry.refNo}` : ''}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.label(theme)}>Mã hàng & PO *</Text>
                      {items.length > 0 ? (
                        <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                          <Picker
                            selectedValue={selectedOrderLineId}
                            onValueChange={v => {
                              setSelectedOrderLineId(v);
                              setSelectedRef('');
                            }}
                            style={{ color: theme.ink }}
                          >
                            {items.map(it => (
                              <Picker.Item
                                key={it.order_line_id}
                                label={`Mã ${it.ntk} · PO ${it.po} (KH: ${it.target.toLocaleString('vi-VN')} pcs)`}
                                value={it.order_line_id}
                              />
                            ))}
                          </Picker>
                        </View>
                      ) : (
                        <Text style={{ color: theme.bad, fontSize: 12, marginTop: 4 }}>
                          Đơn hàng hiện tại chưa có mã hàng nào.
                        </Text>
                      )}
                    </>
                  )}

                  {/* Chọn số hiệu Ref (nếu mã có Ref) */}
                  {availableRefs.length > 0 && (
                    <>
                      <Text style={styles.label(theme)}>Số hiệu Ref (tuỳ chọn)</Text>
                      <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                        <Picker
                          selectedValue={selectedRef}
                          onValueChange={v => setSelectedRef(v)}
                          style={{ color: theme.ink }}
                        >
                          <Picker.Item label="— Không gắn số hiệu Ref —" value="" />
                          {availableRefs.map(rf => (
                            <Picker.Item
                              key={rf.ref_no}
                              label={`Ref ${rf.ref_no} (KH: ${rf.target.toLocaleString('vi-VN')} pcs)`}
                              value={rf.ref_no}
                            />
                          ))}
                        </Picker>
                      </View>
                    </>
                  )}

                  {/* Chọn chuyền sản xuất */}
                  <Text style={styles.label(theme)}>Dây chuyền</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[
                        styles.lineBtn,
                        {
                          borderColor: line === 'auto' ? theme.accent : theme.line,
                          backgroundColor: line === 'auto' ? theme.accent : theme.bg,
                        },
                      ]}
                      onPress={() => setLine('auto')}
                    >
                      <Text style={{ color: line === 'auto' ? '#fff' : theme.ink, fontWeight: '700', fontSize: 13 }}>
                        Tự động
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.lineBtn,
                        {
                          borderColor: line === 'manual' ? theme.accent : theme.line,
                          backgroundColor: line === 'manual' ? theme.accent : theme.bg,
                        },
                      ]}
                      onPress={() => setLine('manual')}
                    >
                      <Text style={{ color: line === 'manual' ? '#fff' : theme.ink, fontWeight: '700', fontSize: 13 }}>
                        Thủ công
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Nhập số lượng sản xuất */}
                  <Text style={styles.label(theme)}>Số lượng sản xuất (pcs) *</Text>
                  <TextInput
                    style={styles.input(theme)}
                    keyboardType="numeric"
                    placeholder="VD: 500"
                    placeholderTextColor={theme.sub}
                    value={qty}
                    onChangeText={setQty}
                    onFocus={() => scrollToInput(180)}
                  />

                  {/* Nhập số lượng hàng lỗi */}
                  <Text style={styles.label(theme)}>Hàng lỗi (không bắt buộc)</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.sub, fontSize: 11.5, marginBottom: 4, fontWeight: '600' }}>SP lỗi (pcs):</Text>
                      <TextInput
                        style={styles.input(theme)}
                        keyboardType="numeric"
                        placeholder="VD: 10"
                        placeholderTextColor={theme.sub}
                        value={defectQty}
                        onChangeText={setDefectQty}
                        onFocus={() => scrollToInput(240)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.sub, fontSize: 11.5, marginBottom: 4, fontWeight: '600' }}>Thùng lỗi (thùng):</Text>
                      <TextInput
                        style={styles.input(theme)}
                        keyboardType="numeric"
                        placeholder="VD: 2"
                        placeholderTextColor={theme.sub}
                        value={defectBoxQty}
                        onChangeText={setDefectBoxQty}
                        onFocus={() => scrollToInput(240)}
                      />
                    </View>
                  </View>

                  {/* Chọn loại lỗi */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {[
                      ['yellow', 'Thẻ vàng', '#FFD600'],
                      ['red', 'Thẻ đỏ', '#E53935'],
                      ['tear', 'Rách bọc', '#888888'],
                    ].map(([key, title, color]) => {
                      const active = defectTypes[key];
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[
                            styles.chip,
                            {
                              borderColor: active ? color : theme.line,
                              backgroundColor: active ? `${color}22` : theme.bg,
                            },
                          ]}
                          onPress={() => toggleDefectType(key)}
                        >
                          <View style={[styles.dot, { backgroundColor: color }]} />
                          <Text style={{ color: active ? theme.ink : theme.sub, fontSize: 12, fontWeight: active ? '700' : '500' }}>
                            {title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Tuỳ chọn: Chưa dán nhãn */}
                  <View style={{ marginTop: 14 }}>
                    <TouchableOpacity
                      style={[
                        styles.unlabeledToggle,
                        {
                          borderColor: isUnlabeled ? theme.warn : theme.line,
                          backgroundColor: isUnlabeled ? theme.warn + '18' : theme.bg,
                        },
                      ]}
                      onPress={() => setIsUnlabeled(!isUnlabeled)}
                      disabled={busy}
                    >
                      <Text style={{ color: isUnlabeled ? theme.warn : theme.sub, fontSize: 13, fontWeight: isUnlabeled ? '700' : '600' }}>
                        {isUnlabeled ? '🏷 Chưa dán nhãn hoàn chỉnh' : 'Dán nhãn: Đã dán hoàn chỉnh (mặc định)'}
                      </Text>
                    </TouchableOpacity>

                    {isUnlabeled && (
                      <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: theme.sub, marginRight: 8, fontWeight: '600' }}>SL chưa dán:</Text>
                        <TextInput
                          style={[
                            styles.input(theme),
                            { flex: 1, height: 40 },
                          ]}
                          keyboardType="numeric"
                          placeholder={`Mặc định = tất cả ${qty || 'SL'}`}
                          placeholderTextColor={theme.sub}
                          value={unlabeledQty}
                          onChangeText={setUnlabeledQty}
                          editable={!busy}
                        />
                      </View>
                    )}
                  </View>

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
                      style={[styles.btn, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}
                      onPress={handleSave}
                      disabled={busy}
                    >
                      <Text style={styles.btnTxt}>{isEdit ? 'Lưu thay đổi' : 'Thêm'}</Text>
                    </TouchableOpacity>
                  </View>

                  {isEdit && (
                    <TouchableOpacity
                      style={[styles.btn, { backgroundColor: theme.bad, marginTop: 10, opacity: busy ? 0.6 : 1 }]}
                      onPress={handleDelete}
                      disabled={busy}
                    >
                      <Text style={styles.btnTxt}>🗑 Xoá lượt sản xuất này</Text>
                    </TouchableOpacity>
                  )}
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 34,
    maxHeight: '90%',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoBadge: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  label: theme => ({
    color: theme.sub,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 14,
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
  }),
  pickerWrap: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  lineBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  unlabeledToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
