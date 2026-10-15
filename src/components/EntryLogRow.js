import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatDisplayDate } from '@/utils/date';
import DefectBadgeList, { getDefectColor } from '@/components/DefectBadges';

export default function EntryLogRow({ entry, po, onEdit, onDelete, theme }) {
  const lineLabel = entry.line === 'auto' ? 'Tự động' : 'Thủ công';
  const defectTypes = (entry.defect_types || '').split(',').filter(Boolean);
  // FEAT-23: số hiệu đã gắn. Rỗng ⇒ nhật ký nhập bằng form gốc, **không bịa** ref (AC-RF-07).
  const refLabelText = (entry.ref_no || '').trim();

  const defectParts = [];
  if (entry.defect_qty > 0) defectParts.push(`${entry.defect_qty.toLocaleString('vi-VN')} pcs`);
  if (entry.defect_box_qty > 0) defectParts.push(`${entry.defect_box_qty.toLocaleString('vi-VN')} thùng`);

  const defectTextColor = getDefectColor(defectTypes, theme.warn);

  return (
    <View style={[styles.row, { borderTopColor: theme.line }]}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ color: theme.sub, fontSize: 12 }}>
          {formatDisplayDate(entry.date)} — {entry.qty.toLocaleString('vi-VN')} pcs · {lineLabel}
          {/* PO truyền từ thẻ cha: mọi nhật ký đã thuộc đúng một dòng đơn hàng nên không còn khả năng
              "chưa gắn PO" (hết từ FEAT-21). Trước đó dòng này đọc `entry.po` — cột không được chọn ⇒
              luôn hiện "chưa gắn PO", tức sai. */}
          {po ? ` · PO ${po}` : ''}
          {refLabelText ? ` · ${refLabelText}` : ' · chưa gắn số hiệu'}
        </Text>
        {defectParts.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
            <Text style={{ color: defectTextColor, fontSize: 11, fontWeight: '600' }}>
              Lỗi: {defectParts.join(', ')}
            </Text>
            <DefectBadgeList types={defectTypes} theme={theme} size="sm" />
          </View>
        )}
        {(entry.is_labeled === 0 || (entry.unlabeled_qty && entry.unlabeled_qty > 0)) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <View style={{ backgroundColor: theme.warn + '20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: theme.warn }}>
              <Text style={{ color: theme.warn, fontSize: 10.5, fontWeight: '700' }}>
                🏷 Chưa dán: {(entry.unlabeled_qty || entry.qty).toLocaleString('vi-VN')} pcs
              </Text>
            </View>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <TouchableOpacity onPress={onEdit}><Text style={{ color: theme.accent, fontSize: 12 }}>Sửa</Text></TouchableOpacity>
        <TouchableOpacity onPress={onDelete}><Text style={{ color: theme.bad, fontSize: 12 }}>Xoá</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1 },
});