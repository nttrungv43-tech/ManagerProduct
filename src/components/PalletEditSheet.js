// src/components/PalletEditSheet.js
// Form thêm / sửa / xoá kiện trong một container.
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
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { parseQty } from '@/utils/validateQty';
import { palletErrorMessage } from '@/utils/palletError';

export { palletErrorMessage };

function initialRows(pallet, itemOptions) {
  if (pallet && Array.isArray(pallet.items) && pallet.items.length > 0) {
    return pallet.items.map(it => ({
      ntk: it.ntk,
      qty: String(it.qty),
      order_line_id: it.order_line_id ?? null,
      done: it.done ?? false,
    }));
  }
  const defaultOption = itemOptions?.[0];
  const defaultNtk = typeof defaultOption === 'object' ? defaultOption?.ntk : defaultOption;
  const defaultLineId = typeof defaultOption === 'object' ? defaultOption?.order_line_id : null;
  return [{ ntk: defaultNtk || '', qty: '', order_line_id: defaultLineId, done: false }];
}

export default function PalletEditSheet({
  containerLabel,
  pallet,
  itemOptions = [],
  defaultNo,
  onClose,
  onSubmit,
  onDelete,
  theme,
}) {
  const isEdit = !!pallet;
  const palletNo = pallet?.pallet_no ?? pallet?.no;
  const [no, setNo] = useState(pallet ? String(palletNo) : String(defaultNo || ''));
  const [rows, setRows] = useState(() => initialRows(pallet, itemOptions));
  const [busy, setBusy] = useState(false);

  // Tổng số lượng pcs hiện tại của cả kiện (cộng dồn theo thời gian thực)
  const totalPalletQty = rows.reduce((sum, r) => sum + (parseQty(r.qty) || 0), 0);

  function setRow(index, patch) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function handleSelectNtk(index, selectedValue) {
    const matched = itemOptions.find(opt => {
      const val = typeof opt === 'object' ? opt.ntk : opt;
      return val === selectedValue;
    });
    setRow(index, {
      ntk: selectedValue,
      order_line_id: typeof matched === 'object' ? matched.order_line_id : null,
    });
  }

  function addRow() {
    const defaultOption = itemOptions?.[0];
    const defaultNtk = typeof defaultOption === 'object' ? defaultOption?.ntk : defaultOption;
    const defaultLineId = typeof defaultOption === 'object' ? defaultOption?.order_line_id : null;
    setRows(prev => [...prev, { ntk: defaultNtk || '', qty: '', order_line_id: defaultLineId, done: false }]);
  }

  function removeRow(index) {
    setRows(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSave() {
    if (busy) return;
    const targetPalletNo = parseQty(no);
    if (targetPalletNo === null || targetPalletNo <= 0) {
      Alert.alert('Số hiệu kiện không hợp lệ', 'Số hiệu kiện phải là số nguyên lớn hơn 0.');
      return;
    }

    if (rows.length === 0) {
      Alert.alert('Kiện trống', 'Kiện phải có ít nhất một loại hàng.');
      return;
    }

    const seenNtks = new Set();
    const items = [];
    for (const r of rows) {
      const trimmedNtk = String(r.ntk ?? '').trim();
      if (!trimmedNtk) {
        Alert.alert('Thiếu mã hàng', 'Vui lòng chọn mã hàng cho mỗi dòng trong kiện.');
        return;
      }
      if (seenNtks.has(trimmedNtk)) {
        Alert.alert('Trùng mã hàng', `Kiện không được có 2 dòng cùng mã ${trimmedNtk}.`);
        return;
      }
      seenNtks.add(trimmedNtk);

      const q = parseQty(r.qty);
      if (q === null || q <= 0) {
        Alert.alert('Số lượng không hợp lệ', `Số lượng của mã ${trimmedNtk} phải là số nguyên lớn hơn 0.`);
        return;
      }
      items.push({
        ntk: trimmedNtk,
        qty: q,
        order_line_id: r.order_line_id ?? null,
        done: r.done ?? false,
      });
    }

    setBusy(true);
    try {
      const res = await onSubmit({ no: String(targetPalletNo), items });
      if (res && res.ok === false) {
        Alert.alert('Không lưu được', palletErrorMessage(res.error));
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function handleDelete() {
    if (busy || !onDelete) return;
    const qty = (pallet?.items || []).reduce((s, it) => s + it.qty, 0);
    Alert.alert(
      'Xác nhận xoá kiện',
      `Xoá kiện ${palletNo}?\nSẽ mất ${qty.toLocaleString('vi-VN')} pcs khỏi thống kê container. Không thể hoàn tác.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá kiện',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await onDelete(palletNo);
              if (res && res.ok === false) {
                Alert.alert('Không xoá được', palletErrorMessage(res.error));
                return;
              }
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
        style={styles.backdrop}
      >
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, { color: theme.ink }]}>
              {isEdit ? `📦 Sửa kiện ${palletNo}` : '📦 Thêm kiện mới'}
            </Text>

            <View style={[styles.infoBadge, { backgroundColor: theme.bg, borderColor: theme.line }]}>
              <Text style={{ color: theme.sub, fontSize: 12.5 }}>
                {containerLabel}
              </Text>
            </View>

            <Text style={styles.label(theme)}>Số hiệu kiện *</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink },
              ]}
              keyboardType="numeric"
              placeholder="VD: 11"
              placeholderTextColor={theme.sub}
              value={no}
              onChangeText={setNo}
            />
            <Text style={[styles.hint, { color: theme.sub }]}>
              {isEdit
                ? 'Có thể đổi sang số hiệu kiện khác chưa dùng trong container này.'
                : 'Số hiệu kiện được tạo tự động tiếp nối hoặc nhập tay tuỳ ý.'}
            </Text>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.label(theme)}>Hàng trong kiện *</Text>
              <View style={[styles.badgeQty, { backgroundColor: theme.bg, borderColor: theme.line }]}>
                <Text style={{ color: theme.sub, fontSize: 11.5 }}>
                  Tổng:{' '}
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>
                    {totalPalletQty.toLocaleString('vi-VN')} pcs
                  </Text>
                  {rows.length > 1 ? ` (${rows.length} loại hàng)` : ''}
                </Text>
              </View>
            </View>

            {rows.map((r, i) => (
              <View key={i} style={styles.row}>
                <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                  <Picker
                    selectedValue={r.ntk}
                    onValueChange={v => handleSelectNtk(i, v)}
                    style={{ color: theme.ink }}
                  >
                    <Picker.Item label="— Chọn mã hàng —" value="" />
                    {itemOptions.map(opt => {
                      const val = typeof opt === 'object' ? opt.ntk : opt;
                      const label = typeof opt === 'object'
                        ? `${opt.ntk}${opt.target ? ` · KH: ${opt.target.toLocaleString('vi-VN')} pcs` : ''}`
                        : opt;
                      return <Picker.Item key={val} label={label} value={val} />;
                    })}
                  </Picker>
                </View>

                <TextInput
                  style={[
                    styles.qtyInput,
                    { borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink },
                  ]}
                  keyboardType="numeric"
                  placeholder="pcs"
                  placeholderTextColor={theme.sub}
                  value={r.qty}
                  onChangeText={v => setRow(i, { qty: v })}
                />

                {rows.length > 1 && (
                  <TouchableOpacity onPress={() => removeRow(i)} style={styles.rowBtn}>
                    <Text style={{ color: theme.bad, fontWeight: '700', fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity style={[styles.addRow, { borderColor: theme.line }]} onPress={addRow}>
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>＋ Thêm loại hàng (Kiện mix)</Text>
            </TouchableOpacity>

            {itemOptions.length === 0 && (
              <Text style={[styles.hint, { color: theme.bad, marginTop: 10 }]}>
                Đơn hàng hiện tại chưa có mã hàng nào phù hợp với container này.
              </Text>
            )}

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
                <Text style={styles.btnTxt}>{isEdit ? 'Lưu thay đổi' : 'Thêm kiện'}</Text>
              </TouchableOpacity>
            </View>

            {isEdit && (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.bad, marginTop: 10, opacity: busy ? 0.6 : 1 }]}
                onPress={handleDelete}
                disabled={busy}
              >
                <Text style={styles.btnTxt}>🗑 Xoá kiện</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 34,
    maxHeight: '90%',
  },
  title: { fontSize: 17, fontWeight: '700' },
  infoBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  badgeQty: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: theme => ({
    color: theme.sub,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  }),
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  hint: { fontSize: 11.5, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pickerWrap: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    height: 48,
  },
  qtyInput: {
    width: 90,
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  rowBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  addRow: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
