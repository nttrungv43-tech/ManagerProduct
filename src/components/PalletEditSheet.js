// src/components/PalletEditSheet.js
// FEAT-10 — Form thêm / sửa / xoá kiện trong một container.
// Component chỉ được mount khi đang mở (cha kiểm soát) ⇒ state khởi tạo từ props,
// không cần effect để đồng bộ.
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { parseQty } from '@/utils/validateQty';

function initialRows(pallet, itemOptions) {
  if (pallet) return pallet.items.map(it => ({ ntk: it.ntk, qty: String(it.qty) }));
  return [{ ntk: itemOptions[0] || '', qty: '' }];
}

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

export default function PalletEditSheet({
  containerLabel, pallet, itemOptions, defaultNo, onClose, onSubmit, onDelete, theme,
}) {
  const isEdit = !!pallet;
  // FEAT-21: cột `pallets.pallet_no`; `pallet.no` là tên của blob JSON đã bị bỏ.
  const palletNo = pallet?.pallet_no ?? pallet?.no;
  // AC-EDIT-14: khi thêm mới, số hiệu mặc định = max(no) hiện có + 1.
  const [no, setNo] = useState(pallet ? String(palletNo) : String(defaultNo || ''));
  const [rows, setRows] = useState(() => initialRows(pallet, itemOptions));
  const [busy, setBusy] = useState(false);

  function setRow(index, patch) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows(prev => [...prev, { ntk: itemOptions[0] || '', qty: '' }]);
  }

  function removeRow(index) {
    setRows(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSave() {
    if (busy) return;
    const palletNo = parseQty(no);
    if (palletNo === null || palletNo <= 0) {
      Alert.alert('Số hiệu kiện không hợp lệ', 'Số hiệu kiện phải là số nguyên lớn hơn 0.');
      return;
    }
    const items = [];
    for (const r of rows) {
      if (!r.ntk) {
        Alert.alert('Thiếu mã hàng', 'Vui lòng chọn mã hàng cho mỗi dòng.');
        return;
      }
      const q = parseQty(r.qty);
      if (q === null || q <= 0) {
        Alert.alert('Số lượng không hợp lệ', `Số lượng của mã ${r.ntk} phải là số nguyên lớn hơn 0.`);
        return;
      }
      items.push({ ntk: r.ntk, qty: r.qty });
    }

    setBusy(true);
    try {
      const res = await onSubmit({ no, items });
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
    if (busy) return;
    const qty = pallet.items.reduce((s, it) => s + it.qty, 0);
    Alert.alert(
      'Xác nhận',
      `Xoá kiện ${palletNo}?\nSẽ mất ${qty} pcs khỏi thống kê container. Không thể hoàn tác.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
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
      <View style={[styles.backdrop, { backgroundColor: '#0006' }]}>
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.title, { color: theme.ink }]}>
            {isEdit ? `Sửa kiện ${palletNo}` : 'Thêm kiện'}
          </Text>
          <Text style={{ color: theme.sub, fontSize: 12, marginBottom: 4 }}>{containerLabel}</Text>

          <Text style={styles.label(theme)}>Số hiệu kiện</Text>
          <TextInput
            style={[styles.input(theme), isEdit && styles.readonly(theme)]}
            editable={!isEdit}
            keyboardType="numeric"
            placeholder="VD: 11"
            placeholderTextColor={theme.sub}
            value={no}
            onChangeText={setNo}
          />
          {isEdit && (
            <Text style={[styles.hint, { color: theme.sub }]}>
              Không thể đổi số hiệu kiện đã tồn tại.
            </Text>
          )}

          <Text style={styles.label(theme)}>Hàng trong kiện</Text>
          {rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                <Picker
                  selectedValue={r.ntk}
                  onValueChange={v => setRow(i, { ntk: v })}
                  style={{ color: theme.ink }}
                >
                  <Picker.Item label="— Chọn mã —" value="" />
                  {itemOptions.map(n => <Picker.Item key={n} label={n} value={n} />)}
                </Picker>
              </View>
              <TextInput
                style={[styles.qtyInput(theme)]}
                keyboardType="numeric"
                placeholder="pcs"
                placeholderTextColor={theme.sub}
                value={r.qty}
                onChangeText={v => setRow(i, { qty: v })}
              />
              {rows.length > 1 && (
                <TouchableOpacity onPress={() => removeRow(i)} style={styles.rowBtn}>
                  <Text style={{ color: theme.bad, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={[styles.addRow, { borderColor: theme.line }]} onPress={addRow}>
            <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12.5 }}>＋ Thêm loại hàng</Text>
          </TouchableOpacity>

          {itemOptions.length === 0 && (
            <Text style={[styles.hint, { color: theme.bad, marginTop: 10 }]}>
              Đơn hàng hiện tại chưa có mã hàng nào để thêm vào kiện.
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
              <Text style={styles.btnTxt}>{isEdit ? 'Lưu' : 'Thêm'}</Text>
            </TouchableOpacity>
          </View>

          {isEdit && (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.bad, marginTop: 8, opacity: busy ? 0.6 : 1 }]}
              onPress={handleDelete}
              disabled={busy}
            >
              <Text style={styles.btnTxt}>Xoá kiện</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, padding: 18, paddingBottom: 34, maxHeight: '88%' },
  title: { fontSize: 17, fontWeight: '700' },
  label: theme => ({ color: theme.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }),
  input: theme => ({ borderWidth: 1, borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink, borderRadius: 10, padding: 12, fontSize: 15 }),
  readonly: theme => ({ opacity: 0.6 }),
  hint: { fontSize: 11.5, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pickerWrap: { flex: 1, borderWidth: 1, borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
  qtyInput: theme => ({ width: 86, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 }),
  rowBtn: { paddingHorizontal: 8 },
  addRow: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700' },
});
