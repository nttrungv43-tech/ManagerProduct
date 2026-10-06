// src/components/EntryLogRow.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function EntryLogRow({ entry, po, onEdit, onDelete, theme }) {
  const lineLabel = entry.line === 'auto' ? 'Tự động' : 'Thủ công';
  const defectTypes = (entry.defect_types || '').split(',').filter(Boolean);
  const typeLabels = { yellow: 'Thẻ vàng', red: 'Thẻ đỏ', tear: 'Rách bọc' };
  // FEAT-23: số hiệu đã gắn. Rỗng ⇒ nhật ký nhập bằng form gốc, **không bịa** ref (AC-RF-07).
  const refLabelText = (entry.ref_no || '').trim();

  return (
    <View style={[styles.row, { borderTopColor: theme.line }]}>
      <Text style={{ color: theme.sub, fontSize: 12, flex: 1 }}>
        {entry.date} — {entry.qty} pcs · {lineLabel}
        {/* PO truyền từ thẻ cha: mọi nhật ký đã thuộc đúng một dòng đơn hàng nên không còn khả năng
            "chưa gắn PO" (hết từ FEAT-21). Trước đó dòng này đọc `entry.po` — cột không được chọn ⇒
            luôn hiện "chưa gắn PO", tức sai. */}
        {po ? ` · PO ${po}` : ''}
        {refLabelText ? ` · ${refLabelText}` : ' · chưa gắn số hiệu'}
        {entry.defect_qty > 0 ? ` · Lỗi ${entry.defect_qty}` : ''}
        {defectTypes.length ? ` (${defectTypes.map(t => typeLabels[t]).join(', ')})` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity onPress={onEdit}><Text style={{ color: theme.accent, fontSize: 12 }}>Sửa</Text></TouchableOpacity>
        <TouchableOpacity onPress={onDelete}><Text style={{ color: theme.bad, fontSize: 12 }}>Xoá</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1 },
});