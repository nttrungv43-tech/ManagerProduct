// src/components/ItemEditSheet.js
// FEAT-10 — Form thêm / sửa / xoá mã hàng và số lượng kế hoạch.
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { parseQty } from '@/utils/validateQty';
import { itemErrorMessage, confirmDeleteItem } from '@/utils/deleteItem';

const PO_PLACEHOLDER = '';

export default function ItemEditSheet({ item, pos, defaultPo, onClose, onSubmit, onDelete, theme }) {
  const isEdit = !!item;
  const poOptions = item?.po && !pos.includes(item.po) ? [...pos, item.po] : pos;
  const [ntk, setNtk] = useState(item?.ntk || '');
  const [isNewPo, setIsNewPo] = useState(poOptions.length === 0);
  const [po, setPo] = useState(item ? (item.po || PO_PLACEHOLDER) : (defaultPo || PO_PLACEHOLDER));
  const [customPo, setCustomPo] = useState(item?.po || '');
  const [target, setTarget] = useState(item ? String(item.target ?? 0) : '');
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (busy) return;
    const ntkValue = ntk.trim();
    const poValue = isNewPo ? customPo.trim() : po.trim();

    if (!ntkValue) {
      Alert.alert('Thiếu mã hàng', 'Vui lòng nhập mã hàng.');
      return;
    }
    if (!poValue) {
      Alert.alert('Thiếu PO', isNewPo ? 'Vui lòng nhập số PO.' : 'Vui lòng chọn PO hoặc bấm nhập PO mới.');
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
          { text: 'Tiếp tục', onPress: () => submit(ntkValue, poValue) },
        ]
      );
      return;
    }
    submit(ntkValue, poValue);
  }

  async function submit(ntkValue, poValue) {
    setBusy(true);
    try {
      const res = await onSubmit({ ntk: ntkValue, po: poValue, target });
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
            style={styles.input(theme)}
            placeholder="VD: 106160"
            placeholderTextColor={theme.sub}
            autoCapitalize="none"
            autoCorrect={false}
            value={ntk}
            onChangeText={setNtk}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 }}>
            <Text style={styles.labelNoMargin(theme)}>PO</Text>
            {poOptions.length > 0 && (
              <TouchableOpacity onPress={() => setIsNewPo(!isNewPo)}>
                <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
                  {isNewPo ? 'Chọn PO có sẵn' : '＋ Nhập PO mới'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {isNewPo || poOptions.length === 0 ? (
            <TextInput
              style={styles.input(theme)}
              placeholder="VD: 2919 hoặc PO2600189"
              placeholderTextColor={theme.sub}
              autoCapitalize="none"
              autoCorrect={false}
              value={customPo}
              onChangeText={setCustomPo}
            />
          ) : (
            <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
              <Picker selectedValue={po} onValueChange={setPo} style={{ color: theme.ink }}>
                <Picker.Item label="— Chọn PO —" value={PO_PLACEHOLDER} />
                {poOptions.map(p => <Picker.Item key={p} label={p} value={p} />)}
              </Picker>
            </View>
          )}

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
  labelNoMargin: theme => ({ color: theme.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }),
  input: theme => ({ borderWidth: 1, borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink, borderRadius: 10, padding: 12, fontSize: 15 }),
  pickerWrap: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700' },
});
