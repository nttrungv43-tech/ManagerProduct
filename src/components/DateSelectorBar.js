// src/components/DateSelectorBar.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  todayLocal,
  yesterdayLocal,
  isToday,
  isYesterday,
  formatDisplayDate,
} from '@/utils/date';

/**
 * Thanh chọn ngày sản xuất cho thao tác ghi nhật ký sản lượng:
 * - Mặc định là ngày hôm nay.
 * - Có nút chọn nhanh "Hôm nay", "Hôm qua".
 * - Nút "Khác..." mở Modal lịch tháng trực quan để chọn ngày bất kỳ.
 */
export default function DateSelectorBar({
  selectedDate,
  onSelectDate,
  theme,
  label = 'Ngày sản xuất:',
}) {
  const [modalVisible, setModalVisible] = useState(false);

  const curDate = selectedDate || todayLocal();
  const isCurToday = isToday(curDate);
  const isCurYesterday = isYesterday(curDate);
  const isCustomDate = !isCurToday && !isCurYesterday;

  // Khởi tạo tháng/năm hiển thị trong modal lịch từ curDate
  const parseYearMonth = () => {
    try {
      const [y, m] = curDate.split('-').map(Number);
      if (y && m) return { year: y, month: m - 1 };
    } catch {
      // fallback
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  };

  const [calState, setCalState] = useState(parseYearMonth);

  function openModal() {
    setCalState(parseYearMonth());
    setModalVisible(true);
  }

  function handlePrevMonth() {
    setCalState(prev => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: prev.month - 1 };
    });
  }

  function handleNextMonth() {
    setCalState(prev => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: prev.month + 1 };
    });
  }

  function handleSelectDay(day) {
    const pad = n => String(n).padStart(2, '0');
    const dStr = `${calState.year}-${pad(calState.month + 1)}-${pad(day)}`;
    onSelectDate(dStr);
    setModalVisible(false);
  }

  function handleSelectToday() {
    onSelectDate(todayLocal());
    setModalVisible(false);
  }

  // Tính toán các ngày hiển thị trong lịch tháng (Thứ 2 đến Chủ nhật)
  const daysInMonth = new Date(calState.year, calState.month + 1, 0).getDate();
  const startDayOfWeek = (new Date(calState.year, calState.month, 1).getDay() + 6) % 7; // Thứ 2 = 0, CN = 6
  const todayStr = todayLocal();

  const daysGrid = [];
  // Các ô trống đầu tháng
  for (let i = 0; i < startDayOfWeek; i++) {
    daysGrid.push({ blank: true, key: `b-${i}` });
  }
  // Các ngày trong tháng
  for (let d = 1; d <= daysInMonth; d++) {
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${calState.year}-${pad(calState.month + 1)}-${pad(d)}`;
    daysGrid.push({
      blank: false,
      day: d,
      dateStr,
      key: `d-${d}`,
      isSelected: dateStr === curDate,
      isTodayDate: dateStr === todayStr,
    });
  }

  const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, borderColor: theme.line }]}>
      {/* Header bar: Icon + Nhãn + Badge ngày */}
      <View style={styles.headerRow}>
        <View style={styles.labelGroup}>
          <Ionicons name="calendar" size={15} color={theme.accent} style={{ marginRight: 5 }} />
          <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>
          <View
            style={[
              styles.dateBadge,
              {
                backgroundColor: isCurToday
                  ? theme.good + '22'
                  : isCurYesterday
                  ? theme.warn + '22'
                  : theme.accent + '22',
                borderColor: isCurToday ? theme.good : isCurYesterday ? theme.warn : theme.accent,
              },
            ]}
          >
            <Text
              style={[
                styles.dateBadgeText,
                { color: isCurToday ? theme.good : isCurYesterday ? theme.warn : theme.accent },
              ]}
            >
              {isCurToday
                ? `Hôm nay (${formatDisplayDate(curDate)})`
                : isCurYesterday
                ? `Hôm qua (${formatDisplayDate(curDate)})`
                : formatDisplayDate(curDate)}
            </Text>
          </View>
        </View>
      </View>

      {/* Quick selection chips */}
      <View style={styles.chipsRow}>
        <TouchableOpacity
          style={[
            styles.chip,
            {
              backgroundColor: isCurToday ? theme.accent : theme.card,
              borderColor: isCurToday ? theme.accent : theme.line,
            },
          ]}
          onPress={() => onSelectDate(todayLocal())}
        >
          <Text
            style={[
              styles.chipText,
              { color: isCurToday ? '#fff' : theme.ink, fontWeight: isCurToday ? '700' : '600' },
            ]}
          >
            Hôm nay
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.chip,
            {
              backgroundColor: isCurYesterday ? theme.accent : theme.card,
              borderColor: isCurYesterday ? theme.accent : theme.line,
            },
          ]}
          onPress={() => onSelectDate(yesterdayLocal())}
        >
          <Text
            style={[
              styles.chipText,
              { color: isCurYesterday ? '#fff' : theme.ink, fontWeight: isCurYesterday ? '700' : '600' },
            ]}
          >
            Hôm qua
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.chip,
            styles.customChip,
            {
              backgroundColor: isCustomDate ? theme.accent : theme.card,
              borderColor: isCustomDate ? theme.accent : theme.line,
            },
          ]}
          onPress={openModal}
        >
          <Ionicons
            name="calendar-outline"
            size={13}
            color={isCustomDate ? '#fff' : theme.accent}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.chipText,
              { color: isCustomDate ? '#fff' : theme.ink, fontWeight: isCustomDate ? '700' : '600' },
            ]}
          >
            {isCustomDate ? formatDisplayDate(curDate) : 'Khác...'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal Lịch chọn ngày */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.line }]}>
            {/* Modal Title & Navigation */}
            <View style={styles.calHeader}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                style={[styles.calNavBtn, { borderColor: theme.line }]}
              >
                <Ionicons name="chevron-back" size={18} color={theme.ink} />
              </TouchableOpacity>
              <Text style={[styles.calTitle, { color: theme.ink }]}>
                Tháng {calState.month + 1}/{calState.year}
              </Text>
              <TouchableOpacity
                onPress={handleNextMonth}
                style={[styles.calNavBtn, { borderColor: theme.line }]}
              >
                <Ionicons name="chevron-forward" size={18} color={theme.ink} />
              </TouchableOpacity>
            </View>

            {/* Days of week header */}
            <View style={styles.calDaysOfWeekRow}>
              {DAY_NAMES.map((dName, idx) => (
                <View key={dName} style={styles.calDayCol}>
                  <Text
                    style={[
                      styles.calDayNameText,
                      { color: idx === 6 ? theme.bad : theme.sub },
                    ]}
                  >
                    {dName}
                  </Text>
                </View>
              ))}
            </View>

            {/* Calendar grid */}
            <View style={styles.calGrid}>
              {daysGrid.map(cell => {
                if (cell.blank) {
                  return <View key={cell.key} style={styles.calDayCol} />;
                }
                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[
                      styles.calDayBtn,
                      cell.isSelected && { backgroundColor: theme.accent },
                      cell.isTodayDate && !cell.isSelected && {
                        borderColor: theme.accent,
                        borderWidth: 1.5,
                      },
                    ]}
                    onPress={() => handleSelectDay(cell.day)}
                  >
                    <Text
                      style={[
                        styles.calDayText,
                        {
                          color: cell.isSelected
                            ? '#fff'
                            : cell.isTodayDate
                            ? theme.accent
                            : theme.ink,
                          fontWeight: cell.isSelected || cell.isTodayDate ? '700' : '500',
                        },
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Modal footer */}
            <View style={[styles.modalFooter, { borderTopColor: theme.line }]}>
              <TouchableOpacity
                style={[styles.modalTodayBtn, { borderColor: theme.line, backgroundColor: theme.bg }]}
                onPress={handleSelectToday}
              >
                <Ionicons name="today-outline" size={14} color={theme.accent} style={{ marginRight: 4 }} />
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Hôm nay</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: theme.line }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 13 }}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 9,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  labelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  dateBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  dateBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  customChip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipText: {
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  calDaysOfWeekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calDayCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  calDayNameText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDayBtn: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  calDayText: {
    fontSize: 13,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  modalTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
});
