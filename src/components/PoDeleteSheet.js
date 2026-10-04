// src/components/PoDeleteSheet.js
// FEAT-13 — Xoá toàn bộ mã hàng thuộc một PO (xoá hàng loạt).
// Component chỉ **render**: không tự truy vấn, không gọi store. Nút "Xoá cả PO" chỉ
// hỏi xác nhận qua `confirmDeleteItemsByPo` (đường duy nhất tới `removeItemsByPo`, INV-U1).
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
// FEAT-11: nhãn "Huỷ" dùng chung để sheet này không lệch với nút xoá 1 mã (AC-DEL-12).
import { DELETE_CANCEL_TEXT } from '@/utils/deleteItem';
import { BULK_DELETE_BUTTON_TEXT, BULK_EMPTY_TEXT, formatNumber } from '@/utils/deleteItemsByPo';

const PO_PLACEHOLDER = '';

export default function PoDeleteSheet({
  pos,
  selectedPo,
  preview,
  loading,
  busy,
  onSelectPo,
  onClose,
  onConfirm,
  theme,
}) {
  // Không có mã nào để xoá, hoặc còn mã bị chặn => nút xoá khoá (AC-DEL-06/07/08).
  const canDelete = !!preview && preview.ok && preview.canDelete && !busy;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: '#0006' }]}>
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.title, { color: theme.ink }]}>Xoá mã hàng theo PO</Text>

          <Text style={styles.label(theme)}>Đơn hàng PO</Text>
          <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
            <Picker
              selectedValue={selectedPo || PO_PLACEHOLDER}
              onValueChange={onSelectPo}
              enabled={!busy}
              style={{ color: theme.ink }}
            >
              <Picker.Item label="— Chọn PO —" value={PO_PLACEHOLDER} />
              {pos.map(p => <Picker.Item key={p} label={p} value={p} />)}
            </Picker>
          </View>

          <View style={[styles.preview, { borderColor: theme.line, backgroundColor: theme.bg }]}>
            {loading ? (
              <Text style={{ color: theme.sub }}>Đang kiểm tra…</Text>
            ) : !selectedPo ? (
              <Text style={{ color: theme.sub }}>Vui lòng chọn PO.</Text>
            ) : !preview || !preview.ok || preview.itemCount === 0 ? (
              <Text style={{ color: theme.sub }}>{BULK_EMPTY_TEXT}</Text>
            ) : (
              <>
                <Text style={[styles.previewMain, { color: theme.ink }]}>
                  Xoá {preview.itemCount} mã · giảm {formatNumber(preview.totalTarget)} pcs kế hoạch
                </Text>
                <Text style={[styles.hint, { color: theme.sub }]}>
                  {preview.matched.map(it => it.ntk).join(', ')}
                </Text>
                {preview.multi.length > 0 && (
                  <Text style={[styles.warn, { color: theme.warn }]}>
                    Bỏ qua {preview.multi.length} mã thuộc nhiều PO: {preview.multi.join(', ')}
                  </Text>
                )}
                {preview.blocked.length > 0 && (
                  <Text style={[styles.warn, { color: theme.bad }]}>
                    Không thể xoá toàn bộ PO. Các mã sau bị chặn: {preview.blocked.map(it => it.ntk).join(', ')}
                  </Text>
                )}
              </>
            )}
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.sub }]} onPress={onClose} disabled={busy}>
              <Text style={styles.btnTxt}>{DELETE_CANCEL_TEXT}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.bad, opacity: canDelete ? 1 : 0.6 }]}
              onPress={onConfirm}
              disabled={!canDelete}
            >
              <Text style={styles.btnTxt}>{BULK_DELETE_BUTTON_TEXT}</Text>
            </TouchableOpacity>
          </View>
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
  pickerWrap: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
  preview: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 14 },
  previewMain: { fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: 6 },
  warn: { fontSize: 12, marginTop: 6, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700' },
});