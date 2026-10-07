// src/components/ArchiveCard.js
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { fetchArchiveItems } from '@/db/queries';

/**
 * Thẻ "Đơn hàng đã lưu trữ" (AC-CONT-08, mở rộng ở FEAT-15).
 *
 * FEAT-15: trạng thái mở/đóng do **cha** điều khiển qua props `expanded` + `onToggle`
 * để nút "👁 Ẩn/Hiện nội dung" của cả mục lưu trữ thu gọn/mở được mọi thẻ (AC-ARCH-03).
 * Nếu không truyền `expanded` thì thẻ tự quản lý như trước (giữ hành vi cũ).
 */
export default function ArchiveCard({ archive, theme, expanded, onToggle, onDelete, busy }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const isControlled = expanded !== undefined;
  const isOpen = isControlled ? !!expanded : localExpanded;

  // Nạp chi tiết **một lần** cho mỗi thẻ (đợt mở đầu tiên). Thu gọn không xoá cache.
  useEffect(() => {
    if (!isOpen || loaded) return;
    let cancelled = false;
    fetchArchiveItems(archive.id).then(rows => {
      if (cancelled) return;
      setItems(rows);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [isOpen, loaded, archive.id]);

  function toggle() {
    if (onToggle) onToggle(archive.id);
    else setLocalExpanded(v => !v);
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <TouchableOpacity style={styles.top} onPress={toggle}>
        <View style={styles.info}>
          <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 14.5 }}>
            Hoàn tất ngày {archive.finished_date}
          </Text>
          {Boolean(archive.po_codes) && (
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600', marginTop: 1 }}>
              PO: {archive.po_codes}
            </Text>
          )}
          <Text style={{ color: theme.sub, fontSize: 11, marginTop: 2 }}>
            {archive.total_produced.toLocaleString()}/{archive.total_target.toLocaleString()} pcs ·{' '}
            {archive.pallets_done}/{archive.pallets_total} kiện · Lỗi {archive.total_defect.toLocaleString()}
          </Text>
        </View>
        {/* Vùng chạm tách biệt: nút xoá KHÔNG nằm trong TouchableOpacity mở nội dung
            ⇒ không xoá nhầm khi người dùng chỉ muốn xem (AC-ARCH-02). */}
        <View style={styles.actions}>
          {onDelete && (
            <TouchableOpacity
              style={styles.delBtn}
              onPress={() => onDelete(archive.id)}
              disabled={busy}
              accessibilityLabel={`Xoá đơn hoàn tất ngày ${archive.finished_date}`}
            >
              <Text style={{ color: theme.bad, fontWeight: '700', fontSize: 13 }}>
                {busy ? '⏳' : '🗑'}
              </Text>
            </TouchableOpacity>
          )}
          <Text style={{ color: theme.sub, marginLeft: 6 }}>{isOpen ? '▴' : '▾'}</Text>
        </View>
      </TouchableOpacity>
      {isOpen && (
        <View style={{ marginTop: 10 }}>
          {items.map(it => (
            <View key={it.ntk} style={[styles.row, { borderTopColor: theme.line }]}>
              <Text style={{ color: theme.sub, fontSize: 12 }}>Mã {it.ntk}</Text>
              <Text style={{ color: theme.sub, fontSize: 12 }}>
                {it.produced}/{it.target} pcs{it.defect ? ` · Lỗi ${it.defect}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 6, padding: 14, marginBottom: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  info: { flex: 1, paddingRight: 8 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  delBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1 },
});