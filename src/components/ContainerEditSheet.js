// src/components/ContainerEditSheet.js
// FEAT-25 — Modal thêm / sửa / xoá container trong đơn hàng.
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
  Platform,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { containerErrorMessage } from '@/utils/containerError';

export { containerErrorMessage };


export default function ContainerEditSheet({
  container = null,
  poOptions = [],
  onClose,
  onSubmit,
  onDelete,
  theme,
}) {
  const isEdit = Boolean(container);
  const [containerNo, setContainerNo] = useState(container?.container_no ?? '');
  const [sealNo, setSealNo] = useState(container?.seal_no ?? '');
  const [selectedPo, setSelectedPo] = useState(
    container?.po ?? (poOptions.length > 0 ? poOptions[0] : '')
  );
  const [busy, setBusy] = useState(false);

  const palletsCount = (container?.pallets || []).length;

  async function handleSave() {
    if (busy) return;
    const trimmedNo = containerNo.trim();
    if (!trimmedNo) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên / mã container.');
      return;
    }
    if (!isEdit && !selectedPo) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn mã PO cho container.');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        container_no: trimmedNo,
        seal_no: sealNo.trim() || null,
        po: isEdit ? container.po : selectedPo,
      };
      const res = await onSubmit(payload);
      if (res && res.ok === false) {
        Alert.alert('Không lưu được', containerErrorMessage(res.error));
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function handleDelete() {
    if (busy || !isEdit || !onDelete) return;
    const warning = palletsCount > 0
      ? `Xoá container "${container.container_no}"?\nContainer này đang có ${palletsCount} kiện hàng. Xoá container sẽ xoá toàn bộ các kiện bên trong.\nKhông thể hoàn tác.`
      : `Xoá container "${container.container_no}"?\nThao tác này không thể hoàn tác.`;

    Alert.alert('Xác nhận xoá container', warning, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá container',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const res = await onDelete();
            if (res && res.ok === false) {
              Alert.alert('Không xoá được', containerErrorMessage(res.error));
              return;
            }
            onClose();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
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
              {isEdit ? '📦 Sửa thông tin container' : '📦 Thêm container mới'}
            </Text>

            {isEdit ? (
              <View style={[styles.infoBadge, { backgroundColor: theme.bg, borderColor: theme.line }]}>
                <Text style={{ color: theme.sub, fontSize: 12.5 }}>
                  Thuộc <Text style={{ color: theme.ink, fontWeight: '700' }}>PO {container.po}</Text>
                  {' · '}
                  <Text style={{ color: theme.ink, fontWeight: '600' }}>{palletsCount} kiện hàng</Text>
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.label(theme)}>Mã PO của Container *</Text>
                {poOptions.length > 0 ? (
                  <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                    <Picker
                      selectedValue={selectedPo}
                      onValueChange={v => setSelectedPo(v)}
                      style={{ color: theme.ink }}
                    >
                      {poOptions.map(p => (
                        <Picker.Item key={p} label={`PO ${p}`} value={p} />
                      ))}
                    </Picker>
                  </View>
                ) : (
                  <Text style={{ color: theme.bad, fontSize: 12, marginTop: 4 }}>
                    Đơn hàng chưa có mã PO nào để tạo container.
                  </Text>
                )}
              </>
            )}

            <Text style={styles.label(theme)}>Mã / Số Container *</Text>
            <TextInput
              style={styles.input(theme)}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="VD: MCCU1123643 hoặc Cont 1"
              placeholderTextColor={theme.sub}
              value={containerNo}
              onChangeText={setContainerNo}
            />

            <Text style={styles.label(theme)}>Số chì (Seal No)</Text>
            <TextInput
              style={styles.input(theme)}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="VD: ML-VN123456 (không bắt buộc)"
              placeholderTextColor={theme.sub}
              value={sealNo}
              onChangeText={setSealNo}
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
                <Text style={styles.btnTxt}>{isEdit ? 'Lưu thay đổi' : 'Thêm mới'}</Text>
              </TouchableOpacity>
            </View>

            {isEdit && onDelete && (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.bad, marginTop: 10, opacity: busy ? 0.6 : 1 }]}
                onPress={handleDelete}
                disabled={busy}
              >
                <Text style={styles.btnTxt}>Xoá container</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: 6,
  },
  infoBadge: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 6,
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
  },
});
