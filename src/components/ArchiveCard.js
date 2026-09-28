// src/components/ArchiveCard.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { fetchArchiveItems } from '@/db/queries';

export default function ArchiveCard({ archive, theme }) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState([]);

  async function toggle() {
    if (!expanded) setItems(await fetchArchiveItems(archive.id));
    setExpanded(!expanded);
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <TouchableOpacity style={styles.top} onPress={toggle}>
        <View>
          <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 14.5 }}>Hoàn tất ngày {archive.finished_date}</Text>
          <Text style={{ color: theme.sub, fontSize: 11, marginTop: 2 }}>
            {archive.total_produced.toLocaleString()}/{archive.total_target.toLocaleString()} pcs ·{' '}
            {archive.pallets_done}/{archive.pallets_total} kiện · Lỗi {archive.total_defect.toLocaleString()}
          </Text>
        </View>
        <Text style={{ color: theme.sub }}>{expanded ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {expanded && (
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
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1 },
});