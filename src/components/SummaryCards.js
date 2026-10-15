// src/components/SummaryCards.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ProgressBar from '@/components/ProgressBar';

export default function SummaryCards({ totals, theme }) {
  const { totalTarget, totalProduced, overallPct, totalDefect = 0, totalDefectBox = 0 } = totals;
  const defectNum = totalDefectBox > 0
    ? `${totalDefect.toLocaleString()} / ${totalDefectBox.toLocaleString()}`
    : totalDefect.toLocaleString();
  const defectLbl = totalDefectBox > 0 ? 'SP / Thùng lỗi' : 'Hàng lỗi';

  const cards = [
    { num: totalTarget.toLocaleString(), lbl: 'Kế hoạch', color: theme.ink },
    { num: totalProduced.toLocaleString(), lbl: 'Đã sản xuất', color: theme.accent },
    { num: `${overallPct}%`, lbl: 'Hoàn thành', color: theme.good },
    { num: defectNum, lbl: defectLbl, color: theme.bad },
  ];
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {cards.map((c, i) => (
          <View
            key={i}
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.line,
              },
            ]}
          >
            <Text style={[styles.num, { color: c.color }]} numberOfLines={1} adjustsFontSizeToFit>
              {c.num}
            </Text>
            <Text style={[styles.lbl, { color: theme.sub }]}>{c.lbl}</Text>
          </View>
        ))}
      </View>
      <ProgressBar pct={overallPct} theme={theme} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  num: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  lbl: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});