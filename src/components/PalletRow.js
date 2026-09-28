// src/components/PalletRow.js
import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';

export default function PalletRow({ containerId, pallet, palletDoneMap, onTogglePallet, theme }) {
  const qty = pallet.items.reduce((s, it) => s + it.qty, 0);

  function confirmToggle(key, currentlyDone, label) {
    Alert.alert(
      'Xác nhận',
      currentlyDone
        ? `${label} đang được đánh dấu là đã xong.\nBạn có chắc muốn bỏ đánh dấu không?`
        : `Xác nhận ${label} đã đóng xong?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => onTogglePallet(key, currentlyDone) },
      ]
    );
  }

  if (pallet.items.length > 1) {
    return (
      <View style={[styles.row, { borderTopColor: theme.line }]}>
        <Text style={[styles.title, { color: theme.ink }]}>Kiện {pallet.no} — {qty} pcs ({pallet.items.length} loại hàng)</Text>
        <View style={{ marginTop: 6, gap: 6 }}>
          {pallet.items.map((it, idx) => {
            const key = `${containerId}-${pallet.no}-${idx}`;
            const done = !!palletDoneMap[key];
            return (
              <TouchableOpacity
                key={idx}
                style={styles.subRow}
                onPress={() => confirmToggle(key, done, `loại hàng ${it.ntk}`)}
              >
                <View style={[styles.checkSm, { borderColor: theme.line, backgroundColor: done ? theme.good : theme.bg }]}>
                  {done && <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>}
                </View>
                <Text style={{ color: done ? theme.good : theme.sub, fontSize: 12, textDecorationLine: done ? 'line-through' : 'none' }}>
                  {it.ntk} × {it.qty}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  const key = `${containerId}-${pallet.no}`;
  const done = !!palletDoneMap[key];
  const itemsTxt = pallet.items.map(it => `${it.ntk} × ${it.qty}`).join(', ');

  return (
    <TouchableOpacity
      style={[styles.row, { borderTopColor: theme.line }]}
      onPress={() => confirmToggle(key, done, `kiện ${pallet.no}`)}
    >
      <View style={styles.palletHeader}>
        <View style={[styles.checkLg, { borderColor: theme.ink, backgroundColor: done ? theme.good : theme.bg }]}>
          {done && <Text style={{ color: '#fff' }}>✓</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: done ? theme.good : theme.ink }]}>Kiện {pallet.no} — {qty} pcs</Text>
          <Text style={{ color: theme.sub, fontSize: 11.5, marginTop: 2 }}>{itemsTxt}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 11, borderTopWidth: 1 },
  palletHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 13.5, fontWeight: '700' },
  checkLg: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkSm: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});