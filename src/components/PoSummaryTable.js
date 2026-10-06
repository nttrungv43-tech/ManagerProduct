// src/components/PoSummaryTable.js
// FEAT-12 — Bảng tổng số lượng theo từng đơn hàng PO.
// FEAT-18 — Dòng PO hiện đúng số lượng của riêng PO đó.
// FEAT-20 — cột "Đã sản xuất"/"Còn lại" là **số đo thật**: mỗi PO cộng sản lượng của những
// nhật ký đã gắn đúng PO đó (`entries.po`) ⇒ `Σ` cột này không bao giờ vượt tổng sản lượng.
// Chỉ dòng *chưa biết* (mã nhiều PO mà chưa gắn PO nào) mới hiện `—`.
// Component chỉ nhận `summaries` đã tính sẵn, KHÔNG tự truy vấn dữ liệu.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/** Ô số: `null`/`undefined` ⇒ `—` (không hiện 0 cho dữ liệu không xác định — INV-I1). */
function Num({ value, style, color }) {
  const text = value === null || value === undefined ? '—' : Number(value).toLocaleString();
  return <Text style={[{ color }, ...(Array.isArray(style) ? style : [style])]}>{text}</Text>;
}

export default function PoSummaryTable({ summaries, unattributed = 0, theme }) {
  const rows = Array.isArray(summaries) ? summaries : [];

  if (rows.length === 0) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.title, { color: theme.ink }]}>Tổng theo PO</Text>
        <Text style={[styles.empty, { color: theme.sub }]}>Chưa có mã hàng.</Text>
      </View>
    );
  }

  // Có dòng nào chưa quy được sản lượng về PO không ⇒ giải thích một lần cho cả bảng.
  const hasShared = rows.some(r => r.hasShared);
  // FEAT-20: tổng số lượng chưa gắn PO của các mã **nhiều** PO. Báo **một lần** ở chân bảng, không
  // lặp ở từng dòng — lặp lại sẽ khiến người dùng cộng trùng (xét cả lần nữa).
  const unattributedQty = Number(unattributed) || 0;

  return (
    <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.title, { color: theme.ink }]}>Tổng theo PO</Text>
      <View style={[styles.head, { borderBottomColor: theme.line }]}>
        <Text style={[styles.th, styles.colPo, { color: theme.sub }]}>PO</Text>
        <Text style={[styles.th, styles.colNum, { color: theme.sub }]}>Tổng</Text>
        <Text style={[styles.th, styles.colNum, { color: theme.sub }]}>Đã sản xuất</Text>
        <Text style={[styles.th, styles.colNum, { color: theme.sub }]}>Còn lại</Text>
      </View>
      {rows.map(r => {
        const isCompleted = r.target > 0 && r.produced >= r.target;
        const lineStyle = isCompleted ? 'line-through' : 'none';
        return (
          <View key={r.key} style={[styles.row, { borderBottomColor: theme.line }]}>
            <Text
              style={[
                styles.td,
                styles.colPo,
                { color: theme.ink, textDecorationLine: lineStyle },
              ]}
              numberOfLines={1}
            >
              {r.label}
            </Text>
            <Num value={r.target} style={[styles.td, styles.colNum, { textDecorationLine: lineStyle }]} color={theme.ink} />
            <Num value={r.produced} style={[styles.td, styles.colNum, { textDecorationLine: lineStyle }]} color={theme.good} />
            <Num value={r.remaining} style={[styles.td, styles.colNum, { textDecorationLine: lineStyle }]} color={theme.warn} />
          </View>
        );
      })}
      {hasShared && (
        <Text style={[styles.note, { color: theme.sub }]}>
          {unattributedQty > 0
            ? `Còn ${unattributedQty.toLocaleString('vi-VN')} pcs đã nhập chưa gắn PO của mã nhiều PO `
              + `— số này chỉ hiện ở Kế hoạch tổng và thẻ mã, chưa cộng vào PO nào. `
              + `Bấm "Xem nhật ký" trên thẻ mã để chọn PO cho từng mục.`
            : 'Mã dùng chung nhiều PO: nhật ký sản xuất ghi kèm PO nên mỗi PO có số riêng. '
              + 'Nhật ký cũ chưa gắn PO thì chưa cộng vào PO nào — bấm "Xem nhật ký" để gán.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, borderWidth: 1, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  empty: { fontSize: 12, paddingVertical: 6 },
  note: { fontSize: 10.5, paddingTop: 6, lineHeight: 14 },
  head: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 5 },
  th: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  row: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 5 },
  td: { fontSize: 11.5 },
  colPo: { flex: 2.4 },
  colNum: { flex: 1, textAlign: 'right' },
});