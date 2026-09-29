// src/screens/HistoryScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, useColorScheme } from 'react-native';
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
                <View style={styles.top} onTouchEnd={() => toggleGroup(g.groupKey)}>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 15 }}>{labelFor(g.groupKey)}</Text>
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>{g.total.toLocaleString()} pcs</Text>
                </View>
                <View style={styles.numsRow}>
                  <Text style={{ color: theme.sub, fontSize: 12 }}>Thủ công: {g.manualTotal.toLocaleString()}</Text>
                  <Text style={{ color: theme.sub, fontSize: 12 }}>Tự động: {g.autoTotal.toLocaleString()}</Text>
                  <Text style={{ color: theme.bad, fontSize: 12 }}>Lỗi: {g.defectTotal.toLocaleString()}</Text>
                </View>
                {isOpen && (
                  <View style={{ marginTop: 8 }}>
                    {rows.map((r, i) => (
                      <View key={i} style={[styles.row, { borderTopColor: theme.line }]}>
                        <Text style={{ color: theme.sub, fontSize: 12 }}>
                          Mã {r.ntk}{historyGroup === 'day' ? ` — ${r.qty} pcs` : ''}
                        </Text>
                        <Text style={{ color: theme.sub, fontSize: 12 }}>
                          {historyGroup === 'day'
                            ? (r.defect_qty ? `Lỗi ${r.defect_qty}` : '')
                            : `${r.qty.toLocaleString()} pcs${r.defect_qty ? ` · Lỗi ${r.defect_qty}` : ''}`}
                        </Text>
                      </View>
                    ))}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1 },
});