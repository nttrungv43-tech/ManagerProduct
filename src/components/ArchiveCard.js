// src/components/ArchiveCard.js
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchArchiveItems } from '@/db/queries';

export default function ArchiveCard({ archive, theme, expanded, onToggle, onDelete, busy }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const isControlled = expanded !== undefined;
  const isOpen = isControlled ? !!expanded : localExpanded;

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
          <Text style={{ color: theme.sub, fontSize: 11.5, marginTop: 3 }}>
            {archive.total_produced.toLocaleString()}/{archive.total_target.toLocaleString()} pcs ·{' '}
            {archive.pallets_done}/{archive.pallets_total} kiện · Lỗi {archive.total_defect.toLocaleString()}
          </Text>
        </View>
        <View style={styles.actions}>
          {onDelete && (
            <TouchableOpacity
              style={styles.delBtn}
              onPress={() => onDelete(archive.id)}
              disabled={busy}
              accessibilityLabel={`Xoá đơn hoàn tất ngày ${archive.finished_date}`}
            >
              {busy ? (
                <ActivityIndicator size="small" color={theme.bad} />
              ) : (
                <Ionicons name="trash-outline" size={17} color={theme.bad} />
              )}
            </TouchableOpacity>
          )}
          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.sub} style={{ marginLeft: 6 }} />
        </View>
      </TouchableOpacity>
      {isOpen && (
        <View style={{ marginTop: 10 }}>
          {items.map(it => (
            <View key={it.ntk} style={[styles.row, { borderTopColor: theme.line }]}>
              <Text style={{ color: theme.sub, fontSize: 12.5 }}>Mã {it.ntk}</Text>
              <Text style={{ color: theme.sub, fontSize: 12.5 }}>
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
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  info: { flex: 1, paddingRight: 8 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  delBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1 },
});