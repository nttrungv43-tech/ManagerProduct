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
import DeleteHistoryModal from '@/components/DeleteHistoryModal';

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
    removeHistoryGroup,
  } = useAppStore();

  const [groups, setGroups] = useState([]);
  const [details, setDetails] = useState({});
  const [entriesByGroup, setEntriesByGroup] = useState({});
  const [expanded, setExpanded] = useState(new Set());

  // Quản lý Modal / Sheet thêm & sửa
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [sheetInitialDate, setSheetInitialDate] = useState(null);

  // Quản lý Modal xoá lịch sử theo ngày / tháng / năm
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

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

  function handleDeleteGroup(g) {
    const label = labelFor(g.groupKey);
    const typeText = historyGroup === 'day' ? 'ngày' : historyGroup === 'month' ? 'tháng' : 'năm';
    const defectParts = [];
    if (g.defectTotal > 0) defectParts.push(`${g.defectTotal.toLocaleString('vi-VN')} pcs`);
    if (g.defectBoxTotal > 0) defectParts.push(`${g.defectBoxTotal.toLocaleString('vi-VN')} thùng`);
    const defectText = defectParts.length ? defectParts.join(', ') : '0';

    Alert.alert(
      `Xác nhận xoá ${typeText}`,
      `Bạn có chắc chắn muốn xoá toàn bộ lịch sử sản xuất của ${label}?\n\n• Tổng sản lượng: ${g.total.toLocaleString('vi-VN')} pcs\n• Số lỗi: ${defectText}\n\nSố lượng đã sản xuất trên các mã hàng sẽ được hoàn lại tương ứng. Thao tác không thể hoàn tác.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá toàn bộ',
          style: 'destructive',
          onPress: async () => {
            const res = await removeHistoryGroup(historyGroup, g.groupKey);
            if (res && res.ok === false) {
              Alert.alert('Không xoá được', 'Có lỗi xảy ra khi xoá dữ liệu lịch sử.');
            }
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
        defectBoxQty: payload.defectBoxQty,
        defectTypes: payload.defectTypes,
        refNo: payload.refNo,
      });
    } else {
      return addEntry(payload.orderLineId, {
        date: payload.date,
        qty: payload.qty,
        line: payload.line,
        defectQty: payload.defectQty,
        defectBoxQty: payload.defectBoxQty,
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

        {/* Hàng nút chức năng chính: Thêm sản lượng & Xoá theo ngày/tháng/năm */}
        <View style={styles.topActionButtonsRow}>
          <TouchableOpacity
            style={[styles.mainAddBtn, { backgroundColor: theme.accent }]}
            onPress={() => handleOpenAdd()}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={17} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.mainAddBtnTxt}>Thêm sản lượng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainDeleteBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
            onPress={() => setDeleteModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={16} color={theme.bad} style={{ marginRight: 6 }} />
            <Text style={[styles.mainDeleteBtnTxt, { color: theme.bad }]}>Xoá theo ngày/tháng/năm</Text>
          </TouchableOpacity>
        </View>

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
                <View style={styles.cardHeaderRow}>
                  <TouchableOpacity
                    style={styles.cardHeaderTouchable}
                    activeOpacity={0.7}
                    onPress={() => toggleGroup(g.groupKey)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 6 }}>
                      <Ionicons name="calendar-outline" size={16} color={theme.accent} style={{ marginRight: 6 }} />
                      <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 15.5 }} numberOfLines={1}>
                        {labelFor(g.groupKey)}
                      </Text>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={15} color={theme.sub} style={{ marginLeft: 5 }} />
                    </View>
                    <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 15 }}>{g.total.toLocaleString()} pcs</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.groupDeleteBtn, { borderColor: theme.line, backgroundColor: theme.bg }]}
                    onPress={() => handleDeleteGroup(g)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={`Xoá lịch sử ${labelFor(g.groupKey)}`}
                  >
                    <Ionicons name="trash-outline" size={15} color={theme.bad} />
                  </TouchableOpacity>
                </View>

                <View style={styles.numsRow}>
                  <Text style={{ color: theme.sub, fontSize: 12 }}>Thủ công: {g.manualTotal.toLocaleString()}</Text>
                  <Text style={{ color: theme.sub, fontSize: 12 }}>Tự động: {g.autoTotal.toLocaleString()}</Text>
                  <Text style={{ color: theme.bad, fontSize: 12 }}>
                    Lỗi: {[
                      g.defectTotal > 0 ? `${g.defectTotal.toLocaleString()} pcs` : null,
                      g.defectBoxTotal > 0 ? `${g.defectBoxTotal.toLocaleString()} thùng` : null,
                    ].filter(Boolean).join(', ') || '0'}
                  </Text>
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
                              {Boolean(r.defect_qty || r.defect_box_qty) && (
                                <Text style={{ color: theme.bad, fontSize: 11, fontWeight: '500', marginTop: 1 }}>
                                  Lỗi: {[
                                    r.defect_qty ? `${r.defect_qty.toLocaleString()} pcs` : null,
                                    r.defect_box_qty ? `${r.defect_box_qty.toLocaleString()} thùng` : null,
                                  ].filter(Boolean).join(', ')}
                                </Text>
                              )}
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
                                    {Boolean(rf.defect_qty || rf.defect_box_qty)
                                      ? ` · Lỗi ${[
                                          rf.defect_qty ? `${rf.defect_qty.toLocaleString()} pcs` : null,
                                          rf.defect_box_qty ? `${rf.defect_box_qty.toLocaleString()} thùng` : null,
                                        ].filter(Boolean).join(', ')}`
                                      : ''}
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
                                {Boolean(entry.defect_qty > 0 || entry.defect_box_qty > 0) && (
                                  <Text style={{ color: theme.bad, fontSize: 11.5 }}>
                                    · Lỗi: {[
                                      entry.defect_qty > 0 ? `${entry.defect_qty.toLocaleString()} pcs` : null,
                                      entry.defect_box_qty > 0 ? `${entry.defect_box_qty.toLocaleString()} thùng` : null,
                                    ].filter(Boolean).join(', ')}
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

                    {/* Hàng nút dưới cùng của nhóm: Thêm nhanh & Xoá toàn bộ */}
                    <View style={styles.groupBottomActions}>
                      <TouchableOpacity
                        style={[styles.addInGroupBtn, { borderColor: theme.accent }]}
                        onPress={() => handleOpenAdd(historyGroup === 'day' ? g.groupKey : null)}
                      >
                        <Ionicons name="add" size={15} color={theme.accent} style={{ marginRight: 4 }} />
                        <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12 }}>
                          {historyGroup === 'day' ? `Thêm ngày ${formatDisplayDate(g.groupKey)}` : 'Thêm sản lượng'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.deleteGroupBottomBtn, { borderColor: theme.bad }]}
                        onPress={() => handleDeleteGroup(g)}
                      >
                        <Ionicons name="trash-outline" size={14} color={theme.bad} style={{ marginRight: 4 }} />
                        <Text style={{ color: theme.bad, fontWeight: '700', fontSize: 12 }}>
                          Xoá {historyGroup === 'day' ? 'ngày này' : (historyGroup === 'month' ? 'tháng này' : 'năm này')}
                        </Text>
                      </TouchableOpacity>
                    </View>
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

        {/* Modal Xoá lịch sử theo ngày / tháng / năm */}
        <DeleteHistoryModal
          visible={deleteModalOpen}
          initialGroup={historyGroup}
          onClose={() => setDeleteModalOpen(false)}
          onConfirmDelete={removeHistoryGroup}
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: 14, paddingBottom: 40 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  h1: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  topActionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  mainAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  mainAddBtnTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13.5,
  },
  mainDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  mainDeleteBtnTxt: {
    fontWeight: '700',
    fontSize: 13,
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderTouchable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  groupDeleteBtn: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 8,
  },
  groupBottomActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  deleteGroupBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
});