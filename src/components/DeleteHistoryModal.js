// src/components/DeleteHistoryModal.js
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { fetchHistoryGrouped } from '@/db/queries';
import { formatDisplayDate } from '@/utils/date';

export default function DeleteHistoryModal({
  visible,
  onClose,
  onConfirmDelete,
  initialGroup = 'day',
  theme,
}) {
  const [groupType, setGroupType] = useState(initialGroup);
  const [groups, setGroups] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchHistoryGrouped(groupType).then(rows => {
      if (cancelled) return;
      setGroups(rows);
      setSelectedKey(rows.length > 0 ? rows[0].groupKey : '');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [groupType, visible]);

  function labelFor(key, type) {
    if (!key) return '';
    if (type === 'month') {
      const [y, m] = key.split('-');
      return `Tháng ${m}/${y}`;
    }
    if (type === 'year') return `Năm ${key}`;
    return formatDisplayDate(key);
  }

  const selectedGroup = groups.find(g => g.groupKey === selectedKey);

  function handleConfirm() {
    if (!selectedGroup || busy) return;
    const label = labelFor(selectedGroup.groupKey, groupType);
    Alert.alert(
      'Xác nhận xoá dữ liệu',
      `Bạn có chắc chắn muốn xoá toàn bộ lịch sử sản xuất của ${label}?\n\n• Tổng sản lượng: ${selectedGroup.total.toLocaleString('vi-VN')} pcs\n• Số lỗi: ${selectedGroup.defectTotal.toLocaleString('vi-VN')} pcs\n\nSố lượng đã sản xuất trên các mã hàng sẽ được hoàn lại tương ứng. Thao tác này KHÔNG THỂ HOÀN TÁC.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá toàn bộ',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await onConfirmDelete(groupType, selectedGroup.groupKey);
              if (res && res.ok === false) {
                Alert.alert('Không xoá được', 'Có lỗi xảy ra khi xoá dữ liệu.');
              } else {
                onClose();
              }
            } catch (e) {
              Alert.alert('Lỗi', e?.message || 'Có lỗi xảy ra.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
            <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.line }]}>
              {/* Header */}
              <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="trash-bin-outline" size={20} color={theme.bad} style={{ marginRight: 8 }} />
                  <Text style={[styles.title, { color: theme.ink }]}>Xoá lịch sử sản xuất</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={theme.sub} />
                </TouchableOpacity>
              </View>

              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                {/* Chọn phạm vi: Ngày / Tháng / Năm */}
                <Text style={[styles.label, { color: theme.ink }]}>Phạm vi xoá</Text>
                <View style={styles.tabRow}>
                  {[
                    ['day', 'Theo ngày'],
                    ['month', 'Theo tháng'],
                    ['year', 'Theo năm'],
                  ].map(([type, tabLabel]) => {
                    const active = groupType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.tabBtn,
                          {
                            backgroundColor: active ? theme.bad : theme.bg,
                            borderColor: active ? theme.bad : theme.line,
                          },
                        ]}
                        onPress={() => setGroupType(type)}
                      >
                        <Text
                          style={[
                            styles.tabBtnTxt,
                            {
                              color: active ? '#fff' : theme.ink,
                              fontWeight: active ? '700' : '500',
                            },
                          ]}
                        >
                          {tabLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Chọn mốc thời gian */}
                <Text style={[styles.label, { color: theme.ink, marginTop: 14 }]}>
                  Chọn {groupType === 'day' ? 'ngày' : groupType === 'month' ? 'tháng' : 'năm'} cần xoá
                </Text>

                {loading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={theme.accent} />
                  </View>
                ) : groups.length === 0 ? (
                  <View style={[styles.emptyBox, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                    <Text style={{ color: theme.sub, textAlign: 'center', fontSize: 13 }}>
                      Không có dữ liệu lịch sử nào trong phạm vi này.
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                      <Picker
                        selectedValue={selectedKey}
                        onValueChange={v => setSelectedKey(v)}
                        style={{ color: theme.ink }}
                      >
                        {groups.map(g => (
                          <Picker.Item
                            key={g.groupKey}
                            label={`${labelFor(g.groupKey, groupType)} (${g.total.toLocaleString('vi-VN')} pcs)`}
                            value={g.groupKey}
                          />
                        ))}
                      </Picker>
                    </View>

                    {/* Preview box */}
                    {selectedGroup && (
                      <View style={[styles.previewCard, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 14.5 }}>
                            {labelFor(selectedGroup.groupKey, groupType)}
                          </Text>
                          <Text style={{ color: theme.bad, fontWeight: '800', fontSize: 15 }}>
                            {selectedGroup.total.toLocaleString('vi-VN')} pcs
                          </Text>
                        </View>
                        <View style={styles.previewStats}>
                          <Text style={{ color: theme.sub, fontSize: 12 }}>
                            Thủ công: {selectedGroup.manualTotal.toLocaleString('vi-VN')} pcs
                          </Text>
                          <Text style={{ color: theme.sub, fontSize: 12 }}>
                            Tự động: {selectedGroup.autoTotal.toLocaleString('vi-VN')} pcs
                          </Text>
                          {selectedGroup.defectTotal > 0 && (
                            <Text style={{ color: theme.bad, fontSize: 12 }}>
                              Lỗi: {selectedGroup.defectTotal.toLocaleString('vi-VN')} pcs
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.warnText, { color: theme.bad }]}>
                          ⚠ Toàn bộ các lượt sản xuất thuộc mốc thời gian này sẽ bị xoá vĩnh viễn. Số lượng đã sản xuất trên các mã hàng sẽ được hoàn lại tương ứng.
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {/* Nút hành động */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.cancelBtn, { borderColor: theme.line, backgroundColor: theme.bg }]}
                    onPress={onClose}
                    disabled={busy}
                  >
                    <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 14 }}>Huỷ</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.btn,
                      styles.deleteBtn,
                      {
                        backgroundColor: theme.bad,
                        opacity: (!selectedGroup || busy || groups.length === 0) ? 0.4 : 1,
                      },
                    ]}
                    onPress={handleConfirm}
                    disabled={!selectedGroup || busy || groups.length === 0}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                          Xác nhận xoá
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0007',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnTxt: {
    fontSize: 12.5,
  },
  pickerWrap: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  previewStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  warnText: {
    fontSize: 11.5,
    marginTop: 10,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    marginBottom: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  deleteBtn: {
    elevation: 1,
  },
});
