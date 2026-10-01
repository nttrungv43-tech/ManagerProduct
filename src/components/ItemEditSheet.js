// src/components/ItemEditSheet.js
// FEAT-10 — Form thêm / sửa / xoá mã hàng và số lượng kế hoạch.
// Component chỉ được mount khi đang mở (cha kiểm soát) ⇒ state khởi tạo từ props,
// không cần effect để đồng bộ.
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { parseQty } from '@/utils/validateQty';
// FEAT-11: thông báo xoá dùng chung với nút xoá trên thẻ (AC-EDIT-33/34).
import { itemErrorMessage, confirmDeleteItem } from '@/utils/deleteItem';

const PO_PLACEHOLDER = '';

export default function ItemEditSheet({ item, pos, defaultPo, onClose, onSubmit, onDelete, theme }) {
  const isEdit = !!item;
  // Mã hàng có thể thuộc nhiều PO ("2600168+2600189") — phải có trong danh sách chọn,
  // nếu không giá trị đó sẽ không hiện trong Picker và có thể bị mất khi lưu.
  const poOptions = item?.po && !pos.includes(item.po) ? [...pos, item.po] : pos;
  const [ntk, setNtk] = useState(item?.ntk || '');
  const [po, setPo] = useState(item ? (item.po || PO_PLACEHOLDER) : (defaultPo || PO_PLACEHOLDER));
  const [target, setTarget] = useState(item ? String(item.target ?? 0) : '');
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (busy) return;
    const poValue = po.trim();
    if (!isEdit && !ntk.trim()) {
      Alert.alert('Thiếu mã hàng', 'Vui lòng nhập mã hàng.');
      return;
    }
    if (!poValue) {
      Alert.alert('Thiếu PO', 'Vui lòng chọn PO.');
      return;
    }
    if (parseQty(target) === null) {
      Alert.alert('Số lượng không hợp lệ', 'Chỉ nhập số nguyên không âm (ví dụ: 500 hoặc 1.200).');
      return;
    }
    // AC-EDIT-11: cảnh báo khi mã không thuộc PO đang lọc.
    if (!isEdit && defaultPo && poValue !== defaultPo) {
      Alert.alert(
        'Kiểm tra lại PO',
        `Mã hàng này sẽ thuộc PO ${poValue}, khác PO đang lọc (${defaultPo}).\nTiếp tục?`,
        [
          { text: 'Huỷ', style: 'cancel' },
          { text: 'Tiếp tục', onPress: () => submit() },
        ]
      );
      return;
    }
    submit();
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await onSubmit({ ntk: ntk.trim(), po, target });
      if (res && res.ok === false) {
        Alert.alert('Không lưu được', itemErrorMessage(res.error));
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function handleDelete() {
    if (busy) return;
    confirmDeleteItem({ item, onDelete, alert: Alert, onBusy: setBusy, onSuccess: onClose });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: '#0006' }]}>
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.title, { color: theme.ink }]}>
            {isEdit ? `Sửa mã ${item.ntk}` : 'Thêm mã hàng'}
          </Text>

          <Text style={styles.label(theme)}>Mã hàng</Text>
          <TextInput
            style={[styles.input(theme), isEdit && styles.readonly]}
            editable={!isEdit}
            placeholder="VD: 106160"
            placeholderTextColor={theme.sub}
            autoCapitalize="none"
            autoCorrect={false}
            value={ntk}
            onChangeText={setNtk}
          />
          {isEdit && <Text style={[styles.hint, { color: theme.sub }]}>Không thể đổi mã hàng đã có.</Text>}

          <Text style={styles.label(theme)}>PO</Text>
          <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
            <Picker selectedValue={po} onValueChange={setPo} style={{ color: theme.ink }}>
              <Picker.Item label="— Chọn PO —" value={PO_PLACEHOLDER} />
              {poOptions.map(p => <Picker.Item key={p} label={p} value={p} />)}
            </Picker>
          </View>

          <Text style={styles.label(theme)}>Số lượng kế hoạch</Text>
          <TextInput
            style={styles.input(theme)}
            keyboardType="numeric"
            placeholder="VD: 1000"
            placeholderTextColor={theme.sub}
            value={target}
            onChangeText={setTarget}
          />

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
              <Text style={styles.btnTxt}>Xoá mã hàng</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, padding: 18, paddingBottom: 34 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  label: theme => ({ color: theme.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }),
  input: theme => ({ borderWidth: 1, borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink, borderRadius: 10, padding: 12, fontSize: 15 }),
  readonly: theme => ({ opacity: 0.6 }),
  pickerWrap: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
  hint: { fontSize: 11.5, marginTop: 6 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700' },
});
