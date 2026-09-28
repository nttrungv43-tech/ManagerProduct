// src/components/EntryLogRow.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function EntryLogRow({ entry, onEdit, onDelete, theme }) {
  const lineLabel = entry.line === 'auto' ? 'Tự động' : 'Thủ công';
  const defectTypes = (entry.defect_types || '').split(',').filter(Boolean);
  const typeLabels = { yellow: 'Thẻ vàng', red: 'Thẻ đỏ', tear: 'Rách bọc' };

  return (
    <View style={[styles.row, { borderTopColor: theme.line }]}>
      <Text style={{ color: theme.sub, fontSize: 12, flex: 1 }}>
        {entry.date} — {entry.qty} pcs · {lineLabel}
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