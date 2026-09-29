// src/components/ItemCard.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import ProgressBar from '@/components/ProgressBar';
import EntryLogRow from '@/components/EntryLogRow';
import { pctClass } from '@/store/useAppStore';
import { fetchEntriesForItem } from '@/db/queries';

const COLOR_BY_CLASS = { ok: 'good', mid: 'warn', low: 'bad' };

export default function ItemCard({ item, theme, onAddEntry, onUpdateEntry, onDeleteEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [qty, setQty] = useState('');
  const [line, setLine] = useState('manual');
  const [defectQty, setDefectQty] = useState('');
  const [defectTypes, setDefectTypes] = useState({ yellow: false, red: false, tear: false });
  const [logOpen, setLogOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  // planned FEAT-01: editingId dùng cho form sửa nhật ký
  // eslint-disable-next-line no-unused-vars
  const [editingId, setEditingId] = useState(null);

  const produced = item.produced || 0;
  const remaining = Math.max(item.target - produced, 0);
  const pct = item.target ? Math.round((produced / item.target) * 1000) / 10 : 0;
  const cls = pctClass(pct);
  const pctColor = theme[COLOR_BY_CLASS[cls]];

  async function loadEntries() {
    const rows = await fetchEntriesForItem(item.order_batch_id, item.ntk);
    setEntries(rows);
  }

  function toggleLog() {
    if (!logOpen) loadEntries();
    setLogOpen(!logOpen);
  }

  async function handleAdd() {
    const q = parseFloat(qty) || 0;
    const dq = parseFloat(defectQty) || 0;
    if (q <= 0 && dq <= 0) return;
    const types = Object.keys(defectTypes).filter(k => defectTypes[k]);
    await onAddEntry(item.ntk, {
      date: new Date().toISOString().slice(0, 10),
      qty: q, line, defectQty: dq, defectTypes: types,
    });
    setQty(''); setDefectQty(''); setDefectTypes({ yellow: false, red: false, tear: false });
    setLogOpen(true);
    loadEntries();
  }

  function confirmDelete(entryId) {
    Alert.alert('Xác nhận', 'Bạn có chắc muốn xoá mục này không?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: async () => { await onDeleteEntry(entryId); loadEntries(); } },
    ]);
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <TouchableOpacity style={styles.top} onPress={() => setExpanded(!expanded)}>
        <View>
          <Text style={[styles.title, { color: theme.ink }]}>Mã {item.ntk}</Text>
          <Text style={{ color: theme.sub, fontSize: 11.5, marginTop: 2 }}>PO {item.po}</Text>
        </View>
        <Text style={{ color: pctColor, fontSize: 15, fontWeight: '700' }}>{pct}% {expanded ? '▴' : '▾'}</Text>
      </TouchableOpacity>

      <ProgressBar pct={pct} color={pctColor} theme={theme} />

      <View style={styles.numsRow}>
        <Text style={styles.numTxt(theme)}>Kế hoạch: {item.target}</Text>
        <Text style={styles.numTxt(theme)}>Đã làm: {produced}</Text>
        <Text style={styles.numTxt(theme)}>Còn lại: {remaining}</Text>
        <Text style={[styles.numTxt(theme), { color: theme.bad }]}>Lỗi: {item.defect || 0}</Text>
      </View>

      {expanded && (
        <View>
          <Text style={styles.sectionLabel(theme)}>Nhập sản xuất hôm nay</Text>
          <TextInput
            style={styles.input(theme)}
            keyboardType="numeric"
            placeholder="Số lượng sản xuất"
            placeholderTextColor={theme.sub}
            value={qty}
            onChangeText={setQty}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
              <Picker selectedValue={line} onValueChange={setLine} style={{ color: theme.ink }}>
                <Picker.Item label="Thủ công" value="manual" />
                <Picker.Item label="Tự động" value="auto" />
              </Picker>
            </View>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.accent }]} onPress={handleAdd}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Thêm</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel(theme)}>Hàng lỗi (không bắt buộc)</Text>
          <TextInput
            style={styles.input(theme)}
            keyboardType="numeric"
            placeholder="Số lượng hàng lỗi"
            placeholderTextColor={theme.sub}
            value={defectQty}
            onChangeText={setDefectQty}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {[['yellow', 'Thẻ vàng'], ['red', 'Thẻ đỏ'], ['tear', 'Rách bọc']].map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.defectChip, { borderColor: theme.line, backgroundColor: defectTypes[key] ? theme.accent : theme.card }]}
                onPress={() => setDefectTypes(prev => ({ ...prev, [key]: !prev[key] }))}
              >
                <Text style={{ color: defectTypes[key] ? '#fff' : theme.sub, fontSize: 12.5 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={toggleLog} style={{ marginTop: 12 }}>
            <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 12.5 }}>
              📋 {logOpen ? 'Ẩn' : 'Xem'} nhật ký
            </Text>
          </TouchableOpacity>

          {logOpen && (
            <View>
              {entries.length === 0 ? (
                <Text style={{ color: theme.sub, fontSize: 12, paddingVertical: 8 }}>Chưa có mục nào</Text>
              ) : (
                entries.map(e => (
                  <EntryLogRow
                    key={e.id}
                    entry={e}
                    theme={theme}
                    onDelete={() => confirmDelete(e.id)}
                    onEdit={() => setEditingId(e.id)}
                  />
                ))
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 6, padding: 14, marginBottom: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 16, fontWeight: '700' },
  numsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 9 },
  numTxt: (theme) => ({ color: theme.sub, fontSize: 12 }),
  sectionLabel: (theme) => ({ color: theme.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }),
  input: (theme) => ({ borderWidth: 1, borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink, borderRadius: 10, padding: 12, fontSize: 15 }),
  pickerWrap: { flex: 1, borderWidth: 1, borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
  addBtn: { paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  defectChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
});