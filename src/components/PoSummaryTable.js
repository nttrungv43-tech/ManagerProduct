// src/components/PoSummaryTable.js
// FEAT-12 — Bảng tổng số lượng theo từng đơn hàng PO.
// Component chỉ nhận `summaries` đã tính sẵn, KHÔNG tự truy vấn dữ liệu.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PoSummaryTable({ summaries, theme }) {
  const rows = Array.isArray(summaries) ? summaries : [];

  if (rows.length === 0) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.title, { color: theme.ink }]}>Tổng theo PO</Text>
        <Text style={[styles.empty, { color: theme.sub }]}>Chưa có mã hàng.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.title, { color: theme.ink }]}>Tổng theo PO</Text>
      <View style={[styles.head, { borderBottomColor: theme.line }]}>
        <Text style={[styles.th, styles.colPo, { color: theme.sub }]}>PO</Text>
        <Text style={[styles.th, styles.colNum, { color: theme.sub }]}>Tổng</Text>
        <Text style={[styles.th, styles.colNum, { color: theme.sub }]}>Đã sản xuất</Text>
        <Text style={[styles.th, styles.colNum, { color: theme.sub }]}>Còn lại</Text>
      </View>
      {rows.map(r => (
        <View key={r.key} style={[styles.row, { borderBottomColor: theme.line }]}>
          <Text style={[styles.td, styles.colPo, { color: theme.ink }]} numberOfLines={1}>
            {r.label}
          </Text>
          <Text style={[styles.td, styles.colNum, { color: theme.ink }]}>
            {r.target.toLocaleString()}
          </Text>
          <Text style={[styles.td, styles.colNum, { color: theme.good }]}>
            {r.produced.toLocaleString()}
          </Text>
          <Text style={[styles.td, styles.colNum, { color: theme.warn }]}>
            {r.remaining.toLocaleString()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, borderWidth: 1, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  empty: { fontSize: 12, paddingVertical: 6 },
  head: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 5 },
  th: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  row: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 5 },
  td: { fontSize: 11.5 },
  colPo: { flex: 2.4 },
  colNum: { flex: 1, textAlign: 'right' },
});