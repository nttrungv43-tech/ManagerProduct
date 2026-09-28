// src/components/SummaryCards.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ProgressBar from '@/components/ProgressBar';

export default function SummaryCards({ totals, theme }) {
  const { totalTarget, totalProduced, overallPct, totalDefect } = totals;
  const cards = [
    { num: totalTarget.toLocaleString(), lbl: 'Kế hoạch' },
    { num: totalProduced.toLocaleString(), lbl: 'Đã sản xuất' },
    { num: `${overallPct}%`, lbl: 'Hoàn thành' },
    { num: totalDefect.toLocaleString(), lbl: 'Hàng lỗi', color: theme.bad },
  ];
  return (
    <View>
      <View style={styles.row}>
        {cards.map((c, i) => (
          <View key={i} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.ink }]}>
            <Text style={[styles.num, { color: c.color || theme.ink }]}>{c.num}</Text>
            <Text style={[styles.lbl, { color: theme.sub }]}>{c.lbl}</Text>
          </View>
        ))}
      </View>
      <ProgressBar pct={overallPct} theme={theme} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  card: { flex: 1, borderWidth: 1.5, borderRadius: 4, paddingVertical: 10, alignItems: 'center' },
  num: { fontSize: 18, fontWeight: '700' },
  lbl: { fontSize: 9.5, marginTop: 2, textAlign: 'center' },
});