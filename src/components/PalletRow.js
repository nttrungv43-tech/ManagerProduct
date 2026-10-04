// src/components/PalletRow.js
// FEAT-21 — Trạng thái đóng kiện là **cột `pallet_lines.done`**, không phải khoá mã hoá.
//
// Bản cũ dựng khoá `${containerId}-${palletNo}` (kiện 1 mã) hoặc
// `${containerId}-${palletNo}-${ntk}` (kiện nhiều mã) rồi tra `palletDoneMap[khoá]`. Hệ quả đo
// được: thêm/xoá một dòng hàng trong kiện là **đổi khoá**, phải có `remapPalletStatus()` dựng lại
// cả map trong cùng transaction — 99 dòng code chỉ để giữ một cái tick (BUG-01, migration v2).
//
// Ở đây mỗi dòng hàng trong kiện có `id` riêng (`pallet_lines.id`) và `done` nằm ngay trên dòng đó:
//   • kiện 1 mã  → đúng 1 dòng → tick dòng = tick kiện (giữ nguyên hành vi và giao diện cũ).
//   • kiện nhiều mã → tick từng dòng (giữ nguyên hành vi và giao diện cũ).
// Không còn chuỗi khoá ⇒ không còn đường để mất tick (hết INV-P1).
import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';

export default function PalletRow({
  pallet, onToggleLine, onEditPallet, onDeletePallet, theme,
}) {
  const qty = pallet.items.reduce((s, it) => s + it.qty, 0);

  function confirmToggle(line, label) {
    Alert.alert(
      'Xác nhận',
      line.done
        ? `${label} đang được đánh dấu là đã xong.\nBạn có chắc muốn bỏ đánh dấu không?`
        : `Xác nhận ${label} đã đóng xong?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => onToggleLine(line.id, line.done) },
      ]
    );
  }

  // FEAT-10: nút sửa/xoá kiện. Không hiện ở thẻ lưu trữ (INV-B2 — chỉ truyền ở batch active).
  const actions = (onEditPallet || onDeletePallet) ? (
    <View style={styles.actions}>
      {onEditPallet && (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onEditPallet(pallet)}>
          <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 12 }}>✎ Sửa</Text>
        </TouchableOpacity>
      )}
      {onDeletePallet && (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onDeletePallet(pallet)}>
          <Text style={{ color: theme.bad, fontWeight: '600', fontSize: 12 }}>🗑 Xoá</Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  // `pallet_no` là tên cột; đổi tên ở tầng query (`id`, `pallet_no`) nhưng alias lại cho
  // component để không phải sửa mọi chỗ đọc `pallet.no`.
  const palletNo = pallet.pallet_no ?? pallet.no;

  if (pallet.items.length > 1) {
    return (
      <View style={[styles.row, { borderTopColor: theme.line }]}>
        <Text style={[styles.title, { color: theme.ink }]}>Kiện {palletNo} — {qty} pcs ({pallet.items.length} loại hàng)</Text>
        <View style={{ marginTop: 6, gap: 6 }}>
          {pallet.items.map(it => (
            <TouchableOpacity
              key={it.id}
              style={styles.subRow}
              onPress={() => confirmToggle(it, `loại hàng ${it.ntk}`)}
            >
              <View style={[styles.checkSm, { borderColor: theme.line, backgroundColor: it.done ? theme.good : theme.bg }]}>
                {it.done && <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>}
              </View>
              <Text style={{ color: it.done ? theme.good : theme.sub, fontSize: 12, textDecorationLine: it.done ? 'line-through' : 'none' }}>
                {it.ntk} × {it.qty}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {actions}
      </View>
    );
  }

  // Kiện một mã: dùng chính dòng hàng đó làm đơn vị tick — không cần nhân bản trạng thái.
  const line = pallet.items[0];
  const done = !!line?.done;
  const itemsTxt = pallet.items.map(it => `${it.ntk} × ${it.qty}`).join(', ');

  return (
    <View style={[styles.row, { borderTopColor: theme.line }]}>
      <TouchableOpacity
        disabled={!line}
        onPress={() => line && confirmToggle(line, `kiện ${palletNo}`)}
      >
        <View style={styles.palletHeader}>
          <View style={[styles.checkLg, { borderColor: theme.ink, backgroundColor: done ? theme.good : theme.bg }]}>
            {done && <Text style={{ color: '#fff' }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: done ? theme.good : theme.ink }]}>Kiện {palletNo} — {qty} pcs</Text>
            <Text style={{ color: theme.sub, fontSize: 11.5, marginTop: 2 }}>{itemsTxt}</Text>
          </View>
        </View>
      </TouchableOpacity>
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 11, borderTopWidth: 1 },
  palletHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 13.5, fontWeight: '700' },
  checkLg: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkSm: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  actionBtn: { paddingVertical: 2 },
});