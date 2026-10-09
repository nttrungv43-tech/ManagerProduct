// src/screens/HistoryScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '@/store/useAppStore';
import { getTheme } from '@/theme';
import { fetchHistoryGrouped, fetchHistoryDetail } from '@/db/queries';
import FilterChips from '@/components/FilterChips';

export default function HistoryScreen() {
  const theme = getTheme(useColorScheme());
  const { historyGroup, historyFilterValue, setHistoryGroup, dataVersion } = useAppStore();
  const [groups, setGroups] = useState([]);
  const [details, setDetails] = useState({});
  const [expanded, setExpanded] = useState(new Set());

  // reset state when filter or dataVersion changes (intentional)
  useEffect(() => {
    fetchHistoryGrouped(historyGroup, historyFilterValue).then(setGroups);
    /* eslint-disable react-hooks/set-state-in-effect */
    setExpanded(new Set());
    setDetails({});
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [historyGroup, historyFilterValue, dataVersion]);

  async function toggleGroup(groupKey) {
    const next = new Set(expanded);
    if (next.has(groupKey)) {
      next.delete(groupKey);
    } else {
      next.add(groupKey);
      if (!details[groupKey]) {
        const rows = await fetchHistoryDetail(historyGroup, groupKey);
        setDetails(prev => ({ ...prev, [groupKey]: rows }));
      }
    }
    setExpanded(next);
  }

  function labelFor(groupKey) {
    if (historyGroup === 'month') {
      const [y, m] = groupKey.split('-');
      return `Tháng ${m}/${y}`;
    }
    if (historyGroup === 'year') return `Năm ${groupKey}`;
    return groupKey;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={[styles.h1, { color: theme.ink }]}>📊 Lịch sử</Text>
        <FilterChips
          options={[['day', 'Theo ngày'], ['month', 'Theo tháng'], ['year', 'Theo năm']]}
          activeValue={historyGroup}
          onSelect={setHistoryGroup}
          theme={theme}
        />

        {groups.length === 0 ? (
          <Text style={{ color: theme.sub, textAlign: 'center', paddingVertical: 20 }}>
            Chưa có dữ liệu sản xuất nào được ghi nhận.
          </Text>
        ) : (
          groups.map(g => {
            const isOpen = expanded.has(g.groupKey);
            const rows = details[g.groupKey] || [];
            return (
              <View key={g.groupKey} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <TouchableOpacity style={styles.top} activeOpacity={0.7} onPress={() => toggleGroup(g.groupKey)}>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 15 }}>{labelFor(g.groupKey)}</Text>
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>{g.total.toLocaleString()} pcs</Text>
                </TouchableOpacity>
                <View style={styles.numsRow}>
                  <Text style={{ color: theme.sub, fontSize: 12 }}>Thủ công: {g.manualTotal.toLocaleString()}</Text>
                  <Text style={{ color: theme.sub, fontSize: 12 }}>Tự động: {g.autoTotal.toLocaleString()}</Text>
                  <Text style={{ color: theme.bad, fontSize: 12 }}>Lỗi: {g.defectTotal.toLocaleString()}</Text>
                </View>
                {isOpen && (
                  <View style={{ marginTop: 8 }}>
                    {rows.map((r, i) => {
                      const hasMultipleRefs = (r.refs?.length > 1) || (r.refs?.length === 1 && r.unattributedQty > 0);
                      const singleRef = (r.refs?.length === 1 && !r.unattributedQty) ? r.refs[0].refNo : null;
                      return (
                        <View key={r.orderLineId ?? i} style={[styles.itemBlock, { borderTopColor: theme.line }]}>
                          {/* Dòng cha: Nổi bật Mã hàng và Số lượng, PO làm phụ */}
                          <View style={styles.row}>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginRight: 8 }}>
                              <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '700' }}>
                                Mã {r.ntk}
                              </Text>
                              <Text style={{ color: theme.sub, fontSize: 11.5, marginLeft: 6 }}>
                                (PO {r.po}{singleRef ? ` · Ref ${singleRef}` : ''})
                              </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: theme.accent, fontSize: 13.5, fontWeight: '700' }}>
                                {hasMultipleRefs ? 'Tổng ' : ''}{r.qty.toLocaleString()} pcs
                              </Text>
                              {r.defect_qty ? (
                                <Text style={{ color: theme.bad, fontSize: 11, fontWeight: '500', marginTop: 1 }}>
                                  Lỗi: {r.defect_qty.toLocaleString()} pcs
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          {/* Dòng con: phân tách chi tiết từng order_ref khi có nhiều ref */}
                          {hasMultipleRefs && (
                            <View style={styles.subList}>
                              {r.refs.map((rf, rfIdx) => (
                                <View key={rfIdx} style={styles.subRow}>
                                  <Text style={{ color: theme.sub, fontSize: 11.5, paddingLeft: 8 }}>
                                    ↳ Ref {rf.refNo}
                                  </Text>
                                  <Text style={{ color: theme.sub, fontSize: 11.5 }}>
                                    {rf.qty.toLocaleString()} pcs
                                    {rf.defect_qty ? ` · Lỗi ${rf.defect_qty.toLocaleString()}` : ''}
                                  </Text>
                                </View>
                              ))}
                              {r.unattributedQty > 0 && (
                                <View style={styles.subRow}>
                                  <Text style={{ color: theme.sub, fontSize: 11.5, paddingLeft: 8 }}>
                                    ↳ Chưa gắn số hiệu
                                  </Text>
                                  <Text style={{ color: theme.sub, fontSize: 11.5 }}>
                                    {r.unattributedQty.toLocaleString()} pcs
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: 14, paddingBottom: 40 },
  h1: { fontSize: 19, fontWeight: '700', marginBottom: 4 },
  card: { borderWidth: 1.5, borderRadius: 6, padding: 14, marginBottom: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  numsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  itemBlock: { paddingVertical: 6, borderTopWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subList: { marginTop: 3, paddingLeft: 6 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
});