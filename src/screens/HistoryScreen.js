// src/screens/HistoryScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { getTheme } from '@/theme';
import { fetchHistoryGrouped, fetchHistoryDetail, fetchHistoryEntries } from '@/db/queries';
import FilterChips from '@/components/FilterChips';
import { formatDisplayDate, todayLocal } from '@/utils/date';
import BackupRestoreSection from '@/components/BackupRestoreSection';
import HistoryEntrySheet from '@/components/HistoryEntrySheet';

export default function HistoryScreen() {
  const theme = getTheme(useColorScheme());
  const {
    historyGroup,
    historyFilterValue,
    setHistoryGroup,
    dataVersion,
    init,
    items,
    addEntry,
    updateEntry,
    removeEntry,
  } = useAppStore();

  const [groups, setGroups] = useState([]);
  const [details, setDetails] = useState({});
  const [entriesByGroup, setEntriesByGroup] = useState({});
  const [expanded, setExpanded] = useState(new Set());

  // Quản lý Modal / Sheet thêm & sửa
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [sheetInitialDate, setSheetInitialDate] = useState(null);

  // Reset state and reload when filter or dataVersion changes
  useEffect(() => {
    fetchHistoryGrouped(historyGroup, historyFilterValue).then(setGroups);
    /* eslint-disable react-hooks/set-state-in-effect */
    setExpanded(new Set());
    setDetails({});
    setEntriesByGroup({});
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [historyGroup, historyFilterValue, dataVersion]);

  async function toggleGroup(groupKey) {
    const next = new Set(expanded);
    if (next.has(groupKey)) {
      next.delete(groupKey);
    } else {
      next.add(groupKey);
      if (!details[groupKey] || !entriesByGroup[groupKey]) {
        const [rows, entries] = await Promise.all([
          fetchHistoryDetail(historyGroup, groupKey),
          fetchHistoryEntries(historyGroup, groupKey),
        ]);
        setDetails(prev => ({ ...prev, [groupKey]: rows }));
        setEntriesByGroup(prev => ({ ...prev, [groupKey]: entries }));
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
    return formatDisplayDate(groupKey);
  }

  function handleOpenAdd(initialDateForAdd = null) {
    setEditingEntry(null);
    setSheetInitialDate(initialDateForAdd || todayLocal());
    setSheetOpen(true);
  }

  function handleOpenEdit(entry) {
    setEditingEntry(entry);
    setSheetOpen(true);
  }

  function handleDelete(entry) {
    Alert.alert(
      'Xác nhận xoá lịch sử',
      `Xoá lượt sản xuất ${entry.qty.toLocaleString('vi-VN')} pcs (Mã ${entry.ntk} · PO ${entry.po}) ngày ${formatDisplayDate(entry.date)}?\nSố lượng đã sản xuất sẽ giảm tương ứng. Thao tác không thể hoàn tác.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá lượt này',
          style: 'destructive',
          onPress: async () => {
            await removeEntry(entry.id);
          },
        },
      ]
    );
  }

  async function handleSubmitSheet(payload) {
    if (editingEntry) {
      return updateEntry(editingEntry.id, {
        date: payload.date,
        qty: payload.qty,
        line: payload.line,
        defectQty: payload.defectQty,
        defectTypes: payload.defectTypes,
        refNo: payload.refNo,
      });
    } else {
      return addEntry(payload.orderLineId, {
        date: payload.date,
        qty: payload.qty,
        line: payload.line,
        defectQty: payload.defectQty,
        defectTypes: payload.defectTypes,
        refNo: payload.refNo,
      });
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="stats-chart" size={22} color={theme.accent} style={{ marginRight: 8 }} />
          <Text style={[styles.h1, { color: theme.ink }]}>Lịch sử sản xuất</Text>
        </View>

        {/* Chức năng sao lưu & phục hồi dữ liệu JSON toàn bộ app */}
        <BackupRestoreSection theme={theme} onRestoreComplete={init} />

        {/* Nút thêm lịch sử sản xuất chính */}
        <TouchableOpacity
          style={[styles.mainAddBtn, { backgroundColor: theme.accent }]}
          onPress={() => handleOpenAdd()}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.mainAddBtnTxt}>Thêm lịch sử sản xuất</Text>
        </TouchableOpacity>

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
            const entries = entriesByGroup[g.groupKey] || [];

            return (
              <View key={g.groupKey} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <TouchableOpacity style={styles.top} activeOpacity={0.7} onPress={() => toggleGroup(g.groupKey)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="calendar-outline" size={16} color={theme.accent} style={{ marginRight: 6 }} />
                    <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 15.5 }}>{labelFor(g.groupKey)}</Text>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={15} color={theme.sub} style={{ marginLeft: 5 }} />
                  </View>
                  <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 15 }}>{g.total.toLocaleString()} pcs</Text>
                </TouchableOpacity>

                <View style={styles.numsRow}>
                  <Text style={{ color: theme.sub, fontSize: 12 }}>Thủ công: {g.manualTotal.toLocaleString()}</Text>
                  <Text style={{ color: theme.sub, fontSize: 12 }}>Tự động: {g.autoTotal.toLocaleString()}</Text>
                  <Text style={{ color: theme.bad, fontSize: 12 }}>Lỗi: {g.defectTotal.toLocaleString()}</Text>
                </View>

                {isOpen && (
                  <View style={{ marginTop: 10 }}>
                    {/* Danh sách tóm tắt theo mã hàng */}
                    {rows.map((r, i) => {
                      const hasMultipleRefs = (r.refs?.length > 1) || (r.refs?.length === 1 && r.unattributedQty > 0);
                      const singleRef = (r.refs?.length === 1 && !r.unattributedQty) ? r.refs[0].refNo : null;
                      return (
                        <View key={r.orderLineId ?? i} style={[styles.itemBlock, { borderTopColor: theme.line }]}>
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

                    {/* Chi tiết từng lượt sản xuất (kèm nút sửa & xoá) */}
                    {entries.length > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <View style={styles.entriesSectionHeader}>
                          <Text style={[styles.entriesSectionTitle, { color: theme.sub }]}>
                            CHI TIẾT TỪNG LƯỢT SẢN XUẤT ({entries.length})
                          </Text>
                        </View>

                        {entries.map(entry => (
                          <View
                            key={entry.id}
                            style={[styles.entryCard, { borderColor: theme.line, backgroundColor: theme.bg }]}
                          >
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 13.5 }}>
                                  Mã {entry.ntk}
                                </Text>
                                <Text style={{ color: theme.sub, fontSize: 12, marginLeft: 6 }}>
                                  PO {entry.po}{entry.refNo ? ` · Ref ${entry.refNo}` : ''}
                                </Text>
                              </View>

                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
                                {historyGroup !== 'day' && (
                                  <Text style={{ color: theme.sub, fontSize: 11.5 }}>
                                    {formatDisplayDate(entry.date)} ·
                                  </Text>
                                )}
                                <View style={[styles.lineBadge, { borderColor: theme.line }]}>
                                  <Text style={{ color: theme.sub, fontSize: 11 }}>
                                    {entry.line === 'auto' ? 'Tự động' : 'Thủ công'}
                                  </Text>
                                </View>
                                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12.5 }}>
                                  {entry.qty.toLocaleString()} pcs
                                </Text>
                                {entry.defect_qty > 0 && (
                                  <Text style={{ color: theme.bad, fontSize: 11.5 }}>
                                    · Lỗi: {entry.defect_qty.toLocaleString()}
                                    {entry.defect_types?.length ? ` (${entry.defect_types.join(', ')})` : ''}
                                  </Text>
                                )}
                              </View>
                            </View>

                            <View style={styles.entryActions}>
                              <TouchableOpacity
                                style={[styles.actionBtn, { borderColor: theme.line }]}
                                onPress={() => handleOpenEdit(entry)}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Ionicons name="create-outline" size={15} color={theme.accent} />
                                <Text style={[styles.actionBtnTxt, { color: theme.accent }]}>Sửa</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[styles.actionBtn, { borderColor: theme.line }]}
                                onPress={() => handleDelete(entry)}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Ionicons name="trash-outline" size={15} color={theme.bad} />
                                <Text style={[styles.actionBtnTxt, { color: theme.bad }]}>Xoá</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Nút thêm nhanh vào nhóm này */}
                    <TouchableOpacity
                      style={[styles.addInGroupBtn, { borderColor: theme.accent }]}
                      onPress={() => handleOpenAdd(historyGroup === 'day' ? g.groupKey : null)}
                    >
                      <Ionicons name="add" size={16} color={theme.accent} style={{ marginRight: 4 }} />
                      <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12.5 }}>
                        {historyGroup === 'day' ? `Thêm sản lượng ngày ${formatDisplayDate(g.groupKey)}` : 'Thêm sản lượng vào nhóm này'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Modal / Sheet Thêm & Sửa lịch sử sản xuất */}
        {sheetOpen && (
          <HistoryEntrySheet
            entry={editingEntry}
            initialDate={sheetInitialDate}
            items={items}
            onClose={() => setSheetOpen(false)}
            onSubmit={handleSubmitSheet}
            onDelete={removeEntry}
            theme={theme}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: 14, paddingBottom: 40 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  h1: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  mainAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  mainAddBtnTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
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
  numsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  itemBlock: { paddingVertical: 6, borderTopWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subList: { marginTop: 3, paddingLeft: 6 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  entriesSectionHeader: {
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: '#0001',
    marginBottom: 4,
  },
  entriesSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  lineBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  entryActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 5,
    gap: 3,
  },
  actionBtnTxt: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  addInGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 9,
    marginTop: 12,
  },
});