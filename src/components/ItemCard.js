import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import ProgressBar from '@/components/ProgressBar';
import EntryLogRow from '@/components/EntryLogRow';
import { pctClass } from '@/store/useAppStore';
import { fetchEntriesForLine } from '@/db/queries';
import {
  parseQty, formatQtyError, checkQtyLimit,
  INVALID_QTY_TITLE, INVALID_QTY_MESSAGE, OVER_TARGET_TITLE,
} from '@/utils/validateQty';
// FEAT-11: xoá mã trong 1 chạm. Dùng chung helper với nút trong ItemEditSheet (AC-EDIT-33/34).
import { confirmDeleteItem } from '@/utils/deleteItem';
// BUG-02: ngày cục bộ, không dùng `toISOString` (giờ UTC).
import { todayLocal } from '@/utils/date';
// FEAT-22: số hiệu nhà máy (`order_ref`) của **riêng PO × mã** này. Logic định dạng nằm ở util
// thuần để test được bằng `node`, component chỉ render.
import { refLabel, refLines, normalizeRefProgress, unattributedText, formatRefOverLimit }
  from '@/utils/refFormat';

const COLOR_BY_CLASS = { ok: 'good', mid: 'warn', low: 'bad' };

// FEAT-17: định dạng số kiểu Việt Nam, giữ tối đa 2 chữ số thập phân và bỏ số `0` vô nghĩa.
// `null`/`undefined` ⇒ không hiển thị (INV-I1) — KHÔNG thay bằng 0.
function fmtMetric(value, unit) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}${unit}`;
}

/**
 * Các nhãn sẽ hiển thị; mảng rỗng = mã này không có dữ liệu packing list ⇒ ẩn cả dòng.
 *
 * FEAT-22: `KL`/`TKL`/`Thể tích` **không hiển thị nữa** theo chỉ đạo chủ dự án 2026-10-05. Cột
 * `nw_kg`/`gw_kg`/`volume_cbm` trong `order_lines` **giữ nguyên** — chỉ ẩn ở tầng UI, không xoá dữ
 * liệu và không sửa logic ghi (INV-I2: dữ liệu chỉ đọc từ packing list). `Kiện` giữ lại: đây là số
 * kiện thực tế của riêng PO × mã.
 */
function metricParts(item) {
  const fields = [
    ['Kiện: ', item.package_count, ' kiện'],
  ];
  const parts = [];
  for (const [label, value, unit] of fields) {
    const text = fmtMetric(value, unit);
    if (text) parts.push(`${label}${text}`);
  }
  return parts;
}

function hasPackingMetrics(item) {
  return metricParts(item).length > 0;
}

// FEAT-22: số hiệu nhà máy của riêng thẻ (PO × mã). `[]`/`null` ⇒ ẩn cả khối (INV-I1).
function refRows(item) {
  return refLines(item.refs);
}

// FEAT-23: tiến độ + nhập số lượng theo từng số hiệu (phương án A — thẻ cha giữ nguyên).
// Không có ref ⇒ ẩn khối, mọi thao tác nhập số lượng vẫn qua form gốc (AC-RF-10).
const REF_KEY_PREFIX = 'refQty:';


/**
 * FEAT-21 — không còn ghi chú nào dưới tiêu đề PO.
 *
 * Bản cũ phải giải thích `isSplit` / `mergedMultiPo` / `productionUnknown` vì số liệu được tính
 * theo **mã** còn thẻ tách theo **PO** ⇒ số trên thẻ có thể không phải của riêng PO đó. Ở thiết kế
 * mới, thẻ **chính là** một dòng đơn hàng (PO × mã) và sản lượng được gắn thẳng vào nó, nên mọi
 * con số hiển thị đều là của riêng PO đó — không cần cảnh báo nữa.
 */

export default function ItemCard({
  item,
  theme,
  isLastUpdated = false,
  lastUpdatedInfo = null,
  onSetLastUpdated,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onEditItem,
  onDeleteItem,
}) {
  const [expanded, setExpanded] = useState(false);
  const [qty, setQty] = useState('');
  const [line, setLine] = useState('manual');
  const [defectQty, setDefectQty] = useState('');
  const [defectTypes, setDefectTypes] = useState({ yellow: false, red: false, tear: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingRef, setSubmittingRef] = useState(null);
  const qtyInputRef = useRef(null);
  const defectQtyInputRef = useRef(null);
  const [logOpen, setLogOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editLine, setEditLine] = useState('manual');
  const [editDefectQty, setEditDefectQty] = useState('');
  const [editDefectTypes, setEditDefectTypes] = useState({ yellow: false, red: false, tear: false });

  const produced = item.produced || 0;
  const remaining = Math.max(item.target - produced, 0);
  const pct = item.target ? Math.round((produced / item.target) * 1000) / 10 : 0;
  const cls = pctClass(pct);
  const pctColor = theme[COLOR_BY_CLASS[cls]];

  async function loadEntries() {
    const rows = await fetchEntriesForLine(item.order_line_id);
    setEntries(rows);
  }

  function toggleLog() {
    if (!logOpen) loadEntries();
    setLogOpen(!logOpen);
  }

  // FEAT-09: đọc số lượng từ ô nhập. Ô trống ⇒ 0 (giữ nguyên AC-ITEM-05/RC-04: không lỗi).
  // Ô có chữ/ký hiệu lạ ⇒ invalid ⇒ báo lỗi, không ghi DB.
  function readNumber(raw) {
    if (typeof raw === 'string' && raw.trim() === '') return { value: 0, empty: true, invalid: false };
    const parsed = parseQty(raw);
    if (parsed === null) return { value: 0, empty: false, invalid: true };
    return { value: parsed, empty: false, invalid: false };
  }

  function showInvalidQty() {
    Alert.alert(INVALID_QTY_TITLE, INVALID_QTY_MESSAGE);
  }

  function showOverTarget(error) {
    Alert.alert(OVER_TARGET_TITLE, formatQtyError(error, item.ntk));
  }

  // ── FEAT-23: nhập số lượng theo số hiệu ────────────────────────────────────
  const refProgress = normalizeRefProgress(item.refProgress);
  const unattributed = unattributedText(item.unattributedProduced);
  const hasRefs = refProgress.length > 0;

  // State for ref input form (per ref)
  const [refQty, setRefQty] = useState({});
  const [refDefectQty, setRefDefectQty] = useState({});
  const [refLine, setRefLine] = useState({});
  const [refDefectTypes, setRefDefectTypes] = useState({});

  function setRefQtyFor(refNo, value) {
    setRefQty(prev => ({ ...prev, [`${REF_KEY_PREFIX}${refNo}`]: value }));
  }
  function setRefDefectQtyFor(refNo, value) {
    setRefDefectQty(prev => ({ ...prev, [`${REF_KEY_PREFIX}${refNo}`]: value }));
  }
  function setRefLineFor(refNo, value) {
    setRefLine(prev => ({ ...prev, [`${REF_KEY_PREFIX}${refNo}`]: value }));
  }
  function setRefDefectTypesFor(refNo, types) {
    setRefDefectTypes(prev => ({ ...prev, [`${REF_KEY_PREFIX}${refNo}`]: types }));
  }

  /**
   * Kiểm tra client-side trước khi gửi: số lượng nhập có vượt kế hoạch không.
   * Dùng `checkQtyLimit` (FEAT-09) để tái sử dụng logic & thông báo.
   */
  function validateQtyBeforeAdd(qtyValue, target, produced, label) {
    const res = checkQtyLimit({ target, produced, incomingQty: qtyValue });
    if (!res.ok) {
      Alert.alert(label, formatQtyError(res, item.ntk));
      return false;
    }
    return true;
  }

  /**
   * Ghi một mục nhật ký gắn vào **một** số hiệu.
   * Hỗ trợ: qty, defectQty, line (manual/auto), defectTypes.
   * Ô trống ⇒ 0 ⇒ không ghi (không lỗi, giống AC-ITEM-05).
   * Vượt hạn mức ref ⇒ Alert riêng + giữ nguyên ô nhập (AC-ITEM-18).
   */
  async function handleAddForRef(entry) {
    const refNo = entry.ref_no;
    const key = `${REF_KEY_PREFIX}${refNo}`;
    const qRes = readNumber(refQty[key] ?? '');
    const dRes = readNumber(refDefectQty[key] ?? '');
    if (qRes.invalid || dRes.invalid) { showInvalidQty(); return; }

    const q = qRes.value;
    const dq = dRes.value;
    if (q <= 0 && dq <= 0) return;

    // Client-side validation: check ref target before calling DB
    if (q > 0 && !validateQtyBeforeAdd(q, entry.target, entry.produced, 'Vượt kế hoạch số hiệu')) {
      return;
    }

    setSubmittingRef(refNo);
    try {
      const types = Object.keys(refDefectTypes[key] || {}).filter(k => refDefectTypes[key][k]);
      const lineVal = refLine[key] || 'manual';

      const res = await onAddEntry(item.order_line_id, {
        date: todayLocal(),
        qty: q,
        line: lineVal,
        defectQty: dq,
        defectTypes: dq > 0 ? types : [],
        refNo,
      });
      if (res && res.ok === false) {
        const refMsg = formatRefOverLimit(res.error);
        Alert.alert(
          refMsg ? 'Vượt kế hoạch số hiệu' : OVER_TARGET_TITLE,
          refMsg || formatQtyError(res.error, item.ntk)
        );
        return;
      }
      // Xử lý xong: ô nhập liệu trở về trạng thái trống như ban đầu
      setRefQtyFor(refNo, '');
      setRefDefectQtyFor(refNo, '');
      setRefDefectTypesFor(refNo, { yellow: false, red: false, tear: false });
      Keyboard.dismiss();

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      onSetLastUpdated?.({
        orderLineId: item.order_line_id,
        ntk: item.ntk,
        po: item.po,
        qty: q,
        refNo,
        time: timeStr,
      });
      loadEntries();
    } catch (err) {
      Alert.alert('Lỗi', err?.message || 'Không thể thêm sản lượng');
    } finally {
      setSubmittingRef(null);
    }
  }


  async function handleAdd() {
    const qRes = readNumber(qty);
    const dRes = readNumber(defectQty);
    if (qRes.invalid || dRes.invalid) { showInvalidQty(); return; }

    const q = qRes.value;
    const dq = dRes.value;
    if (q <= 0 && dq <= 0) return;

    // Client-side validation: check total target before calling DB
    if (q > 0 && !validateQtyBeforeAdd(q, item.target, produced, OVER_TARGET_TITLE)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const types = Object.keys(defectTypes).filter(k => defectTypes[k]);
      const res = await onAddEntry(item.order_line_id, {
        date: todayLocal(),
        qty: q, line, defectQty: dq, defectTypes: dq > 0 ? types : [],
      });
      // Vượt đơn đặt hàng: giữ nguyên ô nhập để người dùng sửa lại.
      if (res && res.ok === false) { showOverTarget(res.error); return; }
      // Xử lý xong: ô nhập liệu trở về trạng thái trống như ban đầu
      setQty('');
      setDefectQty('');
      setDefectTypes({ yellow: false, red: false, tear: false });
      qtyInputRef.current?.blur();
      defectQtyInputRef.current?.blur();
      Keyboard.dismiss();

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      onSetLastUpdated?.({
        orderLineId: item.order_line_id,
        ntk: item.ntk,
        po: item.po,
        qty: q,
        time: timeStr,
      });
      setLogOpen(true);
      loadEntries();
    } catch (err) {
      Alert.alert('Lỗi', err?.message || 'Không thể thêm sản lượng');
    } finally {
      setIsSubmitting(false);
    }
  }

  function confirmDelete(entryId) {
    Alert.alert('Xác nhận', 'Bạn có chắc muốn xoá mục này không?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: async () => { await onDeleteEntry(entryId); loadEntries(); } },
    ]);
  }

  function handleEdit(entry) {
    setEditingId(entry.id);
    setEditDate(entry.date || '');
    setEditQty(String(entry.qty || 0));
    setEditLine(entry.line || 'manual');
    setEditDefectQty(String(entry.defect_qty || 0));
    const types = { yellow: false, red: false, tear: false };
    (entry.defect_types || '').split(',').filter(Boolean).forEach(t => {
      if (types.hasOwnProperty(t)) types[t] = true;
    });
    setEditDefectTypes(types);
  }

  function handleEditCancel() {
    setEditingId(null);
    setEditDate('');
    setEditQty('');
    setEditDefectQty('');
    setEditDefectTypes({ yellow: false, red: false, tear: false });
  }

  async function handleEditSave() {
    const qRes = readNumber(editQty);
    const dRes = readNumber(editDefectQty);
    if (qRes.invalid || dRes.invalid) { showInvalidQty(); return; }

    const q = qRes.value;
    const dq = dRes.value;
    if (q <= 0 && dq <= 0) {
      handleEditCancel();
      return;
    }
    const types = Object.keys(editDefectTypes).filter(k => editDefectTypes[k]);
    const payload = {
      date: editDate,
      qty: q,
      line: editLine,
      defectQty: dq,
      defectTypes: dq > 0 ? types : [],
    };
    Alert.alert('Xác nhận', 'Lưu thay đổi cho nhật ký này?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Lưu',
        onPress: async () => {
          const res = await onUpdateEntry(editingId, payload);
          // Vượt hạn mức: giữ form sửa mở để người dùng điều chỉnh (AC-ITEM-18).
          if (res && res.ok === false) { showOverTarget(res.error); return; }
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          onSetLastUpdated?.({
            orderLineId: item.order_line_id,
            ntk: item.ntk,
            po: item.po,
            qty: q,
            time: timeStr,
            isEdit: true,
          });
          handleEditCancel();
          loadEntries();
        },
      },
    ]);
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: isLastUpdated ? theme.good : theme.line,
          borderWidth: isLastUpdated ? 2.5 : 1.5,
        },
      ]}
    >
      {/* FEAT-26: Huy hiệu nhận diện thẻ vừa được cập nhật số liệu */}
      {isLastUpdated && (
        <View
          style={[
            styles.lastUpdatedBanner,
            {
              backgroundColor: theme.good + '18',
              borderColor: theme.good,
            },
          ]}
        >
          <View style={styles.lastUpdatedRow}>
            <Text style={[styles.lastUpdatedTitle, { color: theme.good }]}>
              ⚡ VỪA CẬP NHẬT (PO {item.po})
            </Text>
            {lastUpdatedInfo?.time ? (
              <Text style={{ color: theme.good, fontSize: 11.5, fontWeight: '700' }}>
                lúc {lastUpdatedInfo.time}
              </Text>
            ) : null}
          </View>
          {lastUpdatedInfo?.qty ? (
            <Text style={{ color: theme.ink, fontSize: 12, marginTop: 2 }}>
              Đã ghi nhận: <Text style={{ fontWeight: '700', color: theme.good }}>+{lastUpdatedInfo.qty.toLocaleString()} pcs</Text>
              {lastUpdatedInfo?.refNo ? ` · Ref ${lastUpdatedInfo.refNo}` : ''}
            </Text>
          ) : null}
        </View>
      )}

      <TouchableOpacity style={styles.top} onPress={() => setExpanded(!expanded)}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Text style={[styles.title, { color: theme.ink }]}>Mã {item.ntk}</Text>
            <View style={[styles.poBadge, { backgroundColor: theme.accent + '22', borderColor: theme.accent }]}>
              <Text style={[styles.poBadgeText, { color: theme.accent }]}>PO {item.po}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.pctText(theme, pctColor)}>{pct}% {expanded ? '▴' : '▾'}</Text>
      </TouchableOpacity>


      <ProgressBar pct={pct} color={pctColor} theme={theme} />

      <View style={styles.numsRow}>
        <Text style={styles.numLabel(theme)}>Kế hoạch:</Text>
        <Text style={styles.numValue(theme)}>{item.target.toLocaleString('vi-VN')}</Text>
        <Text style={styles.numLabel(theme)}>Đã làm:</Text>
        <Text style={styles.numValue(theme)}>{produced.toLocaleString('vi-VN')}</Text>
        <Text style={styles.numLabel(theme)}>Còn lại:</Text>
        <Text style={styles.numValue(theme)}>{remaining.toLocaleString('vi-VN')}</Text>
        <Text style={styles.numLabel(theme)}>Lỗi:</Text>
        <Text style={styles.numValueBad(theme)}>{(item.defect || 0).toLocaleString('vi-VN')}</Text>
      </View>

      {/* FEAT-17 (AC-NEW-05/06): 4 trường từ packing list. FEAT-22: chỉ còn `Kiện` — `KL`/`TKL`/
          `Thể tích` đã ẩn theo chỉ đạo chủ dự án, dữ liệu vẫn còn trong DB (INV-I2).
          `NULL` = không có dữ liệu ⇒ ẩn, không hiện `0` giả (INV-I1). */}
      {hasPackingMetrics(item) && (
        <View style={[styles.numsRow, { marginTop: 4 }]}>
          {metricParts(item).map(part => (
            <Text key={part} style={styles.numMetric(theme)}>{part}</Text>
          ))}
        </View>
      )}

      {/* FEAT-22: số hiệu nhà máy (DMAC No.). Gắn với **PO × mã** nên thẻ nào hiện ref của chính PO
          đó — không lẫn ref của PO khác. Mã không có ref (thêm tay, hoặc DB cũ chưa nhập lại file
          nguồn) ⇒ ẩn hoàn toàn (INV-I1). */}
      {refRows(item).length > 0 && (
        <View style={styles.refBox}>
          <Text style={styles.refLabel(theme)}>{refLabel(item.refs)}</Text>
          {refRows(item).map(line => (
            <Text key={line} style={styles.refValue(theme)}>{line}</Text>
          ))}
        </View>
      )}

      {(onEditItem || onDeleteItem) && (
        <View style={styles.editRow}>
          {onEditItem && (
            <TouchableOpacity style={styles.editBtn} onPress={() => onEditItem(item)}>
              <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 12.5 }}>
                ✎ Sửa mã hàng & số lượng
              </Text>
            </TouchableOpacity>
          )}
          {onDeleteItem && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => confirmDeleteItem({ item, onDelete: onDeleteItem, alert: Alert })}
            >
              <Text style={{ color: theme.bad, fontWeight: '600', fontSize: 12.5 }}>
                ✕ Xoá mã hàng
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {expanded && (
        <View>
          {/* A. Mã hàng KHÔNG có số hiệu → hiển thị form nhập tổng (AC-RF-10) */}
          {!hasRefs && (
            <>
              <Text style={styles.sectionLabel(theme)}>Nhập sản xuất hôm nay</Text>
              <View style={[styles.poNoticeBanner, { backgroundColor: theme.bg, borderColor: theme.line }]}>
                <Text style={{ color: theme.sub, fontSize: 12 }}>
                  Đang nhập cho: <Text style={{ color: theme.ink, fontWeight: '700' }}>Mã {item.ntk}</Text>
                  {' · '}
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>PO {item.po}</Text>
                </Text>
              </View>
              <TextInput
                ref={qtyInputRef}
                editable={!isSubmitting}
                style={[styles.input(theme), isSubmitting && { opacity: 0.7 }]}
                keyboardType="numeric"
                placeholder="Số lượng sản xuất"
                placeholderTextColor={theme.sub}
                value={qty}
                onChangeText={setQty}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                  <Picker
                    selectedValue={line}
                    onValueChange={setLine}
                    style={{ color: theme.ink }}
                    enabled={!isSubmitting}
                  >
                    <Picker.Item label="Thủ công" value="manual" />
                    <Picker.Item label="Tự động" value="auto" />
                  </Picker>
                </View>
                <TouchableOpacity
                  style={[
                    styles.addBtn,
                    {
                      backgroundColor: theme.accent,
                      opacity: isSubmitting ? 0.7 : 1,
                      flexDirection: 'row',
                      gap: 6,
                    },
                  ]}
                  onPress={handleAdd}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Đang thêm...</Text>
                    </>
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Thêm</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel(theme)}>Hàng lỗi (không bắt buộc)</Text>
              <TextInput
                ref={defectQtyInputRef}
                editable={!isSubmitting}
                style={[styles.input(theme), isSubmitting && { opacity: 0.7 }]}
                keyboardType="numeric"
                placeholder="Số lượng hàng lỗi"
                placeholderTextColor={theme.sub}
                value={defectQty}
                onChangeText={setDefectQty}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {[['yellow', 'Thẻ vàng'], ['red', 'Thẻ đỏ'], ['tear', 'Rách bọc']].map(([key, label]) => {
                  const chipColor = key === 'yellow' ? '#FFD600' : key === 'red' ? '#E53935' : '#FFFFFF';
                  const textColor = key === 'tear' ? '#333' : '#FFFFFF';
                  return (
                    <TouchableOpacity
                      key={key}
                      disabled={isSubmitting}
                      style={[styles.defectChip, { borderColor: theme.line, backgroundColor: defectTypes[key] ? chipColor : theme.card }]}
                      onPress={() => setDefectTypes(prev => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <Text style={{ color: defectTypes[key] ? textColor : theme.sub, fontSize: 12.5 }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* B. Mã hàng CÓ số hiệu → hiển thị tiến độ & nhập theo từng số hiệu */}
          {hasRefs && (
            <View style={[styles.refSection, { borderTopColor: theme.line }]}>
              <View style={[styles.poNoticeBanner, { backgroundColor: theme.bg, borderColor: theme.line, marginBottom: 10 }]}>
                <Text style={{ color: theme.sub, fontSize: 12 }}>
                  Đang nhập cho: <Text style={{ color: theme.ink, fontWeight: '700' }}>Mã {item.ntk}</Text>
                  {' · '}
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>PO {item.po}</Text>
                </Text>
              </View>

              <View style={styles.refSectionHeaderRow}>
                <Text style={styles.sectionLabel(theme)}>Tiến độ & nhập theo từng số hiệu</Text>
                <View style={[styles.refCountBadge, { backgroundColor: theme.bg, borderColor: theme.line }]}>
                  <Text style={{ color: theme.sub, fontSize: 11, fontWeight: '700' }}>
                    {refProgress.length} số hiệu
                  </Text>
                </View>
              </View>

              {refProgress.map(entry => {
                const key = `${REF_KEY_PREFIX}${entry.ref_no}`;
                const lineForRef = refLine[key] || 'manual';
                const defectTypesForRef = refDefectTypes[key] || { yellow: false, red: false, tear: false };
                const isRefBusy = submittingRef === entry.ref_no;

                const refProduced = entry.produced || 0;
                const refTarget = entry.target || 0;
                const refRemaining = Math.max(refTarget - refProduced, 0);
                const refPct = refTarget > 0 ? Math.round((refProduced / refTarget) * 1000) / 10 : 0;
                const refCls = pctClass(refPct);
                const refPctColor = theme[COLOR_BY_CLASS[refCls]];
                const isRefDone = refTarget > 0 && refProduced >= refTarget;
                const isRefLastUpdated = isLastUpdated && lastUpdatedInfo?.refNo === entry.ref_no;

                return (
                  <View
                    key={entry.ref_no}
                    style={[
                      styles.refCard,
                      {
                        backgroundColor: theme.bg,
                        borderColor: isRefLastUpdated
                          ? theme.good
                          : isRefDone
                          ? theme.good + '66'
                          : theme.line,
                        borderWidth: isRefLastUpdated ? 2 : 1.5,
                      },
                    ]}
                  >
                    {/* Tag vừa cập nhật cho ref */}
                    {isRefLastUpdated && (
                      <View style={[styles.refLastUpdatedTag, { backgroundColor: theme.good + '18', borderColor: theme.good }]}>
                        <Text style={[styles.refLastUpdatedText, { color: theme.good }]}>
                          ⚡ Vừa cập nhật: +{lastUpdatedInfo.qty?.toLocaleString('vi-VN')} pcs {lastUpdatedInfo.time ? `(${lastUpdatedInfo.time})` : ''}
                        </Text>
                      </View>
                    )}

                    {/* Header: Ref Badge + % / Hoàn thành */}
                    <View style={styles.refCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.refBadge, { backgroundColor: theme.accent + '22', borderColor: theme.accent }]}>
                          <Text style={[styles.refBadgeText, { color: theme.ink }]}>Ref {entry.ref_no}</Text>
                        </View>
                        {isRefDone && (
                          <View style={[styles.refDoneBadge, { backgroundColor: theme.good + '22', borderColor: theme.good }]}>
                            <Text style={{ color: theme.good, fontSize: 11, fontWeight: '700' }}>✓ Hoàn tất</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.refPctText, { color: refPctColor }]}>
                        {refPct}%
                      </Text>
                    </View>

                    {/* Mini progress bar */}
                    <View style={[styles.refProgressBarBg, { backgroundColor: theme.line }]}>
                      <View
                        style={[
                          styles.refProgressBarFill,
                          { width: `${Math.min(refPct, 100)}%`, backgroundColor: refPctColor },
                        ]}
                      />
                    </View>

                    {/* Chỉ số chi tiết: Kế hoạch / Đã làm / Còn lại */}
                    <View style={[styles.refMetricsRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
                      <View style={styles.refMetricItem}>
                        <Text style={[styles.refMetricLabel, { color: theme.sub }]}>Kế hoạch</Text>
                        <Text style={[styles.refMetricValue, { color: theme.ink }]}>{refTarget.toLocaleString('vi-VN')}</Text>
                      </View>
                      <View style={styles.refMetricItem}>
                        <Text style={[styles.refMetricLabel, { color: theme.sub }]}>Đã làm</Text>
                        <Text style={[styles.refMetricValue, { color: refPctColor }]}>
                          {refProduced.toLocaleString('vi-VN')}
                        </Text>
                      </View>
                      <View style={styles.refMetricItem}>
                        <Text style={[styles.refMetricLabel, { color: theme.sub }]}>Còn lại</Text>
                        <Text style={[styles.refMetricValue, { color: refRemaining === 0 ? theme.good : theme.ink }]}>
                          {refRemaining.toLocaleString('vi-VN')}
                        </Text>
                      </View>
                    </View>

                    {/* Dòng 1: Nhập SL sản xuất + Chọn Chuyền + Nút Thêm */}
                    <View style={styles.refInputMainRow}>
                      <TextInput
                        editable={!isRefBusy}
                        style={[
                          styles.refInputMain,
                          { borderColor: theme.line, backgroundColor: theme.card, color: theme.ink },
                          isRefBusy && { opacity: 0.7 },
                        ]}
                        keyboardType="numeric"
                        placeholder="SL sản xuất"
                        placeholderTextColor={theme.sub}
                        value={refQty[key] ?? ''}
                        onChangeText={v => setRefQtyFor(entry.ref_no, v)}
                      />
                      <View style={[styles.refPickerWrap, { borderColor: theme.line, backgroundColor: theme.card }]}>
                        <Picker
                          selectedValue={lineForRef}
                          onValueChange={v => setRefLineFor(entry.ref_no, v)}
                          style={{ color: theme.ink, width: 110 }}
                          enabled={!isRefBusy}
                        >
                          <Picker.Item label="Thủ công" value="manual" />
                          <Picker.Item label="Tự động" value="auto" />
                        </Picker>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.refAddBtn,
                          {
                            backgroundColor: theme.accent,
                            opacity: isRefBusy ? 0.7 : 1,
                          },
                        ]}
                        onPress={() => handleAddForRef(entry)}
                        disabled={isRefBusy}
                      >
                        {isRefBusy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.refAddBtnText}>＋ Thêm</Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Dòng 2: Nhập SL lỗi + Loại lỗi */}
                    <View style={styles.refDefectRow}>
                      <TextInput
                        editable={!isRefBusy}
                        style={[
                          styles.refInputDefect,
                          { borderColor: theme.line, backgroundColor: theme.card, color: theme.ink },
                          isRefBusy && { opacity: 0.7 },
                        ]}
                        keyboardType="numeric"
                        placeholder="SL lỗi"
                        placeholderTextColor={theme.sub}
                        value={refDefectQty[key] ?? ''}
                        onChangeText={v => setRefDefectQtyFor(entry.ref_no, v)}
                      />
                      <View style={styles.refDefectChips}>
                        {[
                          ['yellow', 'Thẻ vàng', '#FFD600', '#333'],
                          ['red', 'Thẻ đỏ', '#E53935', '#fff'],
                          ['tear', 'Rách bọc', '#FFFFFF', '#333'],
                        ].map(([dKey, dLabel, chipColor, textColor]) => {
                          const active = !!defectTypesForRef[dKey];
                          return (
                            <TouchableOpacity
                              key={dKey}
                              disabled={isRefBusy}
                              style={[
                                styles.refDefectChip,
                                {
                                  borderColor: active ? chipColor : theme.line,
                                  backgroundColor: active ? chipColor : theme.card,
                                },
                              ]}
                              onPress={() => setRefDefectTypesFor(entry.ref_no, { ...defectTypesForRef, [dKey]: !active })}
                            >
                              <Text
                                style={{
                                  color: active ? textColor : theme.sub,
                                  fontSize: 11,
                                  fontWeight: active ? '700' : '500',
                                }}
                              >
                                {dLabel}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* AC-RF-08: phần chưa gắn số hiệu */}
              {unattributed && (
                <View style={[styles.unattributedBanner, { backgroundColor: theme.warn + '15', borderColor: theme.warn }]}>
                  <Text style={[styles.unattributedText, { color: theme.warn }]}>
                    ⚠️ {unattributed}
                  </Text>
                </View>
              )}
            </View>
          )}

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
                entries.map(e => {
                  if (editingId === e.id) {
                    return (
                      <View key={`edit-${e.id}`} style={{ marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.line }}>
                        <Text style={styles.sectionLabel(theme)}>Sửa nhật ký</Text>
                        <TextInput
                          style={styles.input(theme)}
                          keyboardType="numeric"
                          placeholder="Số lượng sản xuất"
                          placeholderTextColor={theme.sub}
                          value={editQty}
                          onChangeText={setEditQty}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <View style={[styles.pickerWrap, { borderColor: theme.line, backgroundColor: theme.bg }]}>
                            <Picker selectedValue={editLine} onValueChange={setEditLine} style={{ color: theme.ink }}>
                              <Picker.Item label="Thủ công" value="manual" />
                              <Picker.Item label="Tự động" value="auto" />
                            </Picker>
                          </View>
                        </View>
                        <Text style={styles.sectionLabel(theme)}>Hàng lỗi (không bắt buộc)</Text>
                        <TextInput
                          style={styles.input(theme)}
                          keyboardType="numeric"
                          placeholder="Số lượng hàng lỗi"
                          placeholderTextColor={theme.sub}
                          value={editDefectQty}
                          onChangeText={setEditDefectQty}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          {[['yellow', 'Thẻ vàng'], ['red', 'Thẻ đỏ'], ['tear', 'Rách bọc']].map(([key, label]) => (
                            <TouchableOpacity
                              key={key}
                              style={[styles.defectChip, { borderColor: theme.line, backgroundColor: editDefectTypes[key] ? theme.accent : theme.card }]}
                              onPress={() => setEditDefectTypes(prev => ({ ...prev, [key]: !prev[key] }))}
                            >
                              <Text style={{ color: editDefectTypes[key] ? '#fff' : theme.sub, fontSize: 12.5 }}>{label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                          <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.good }]} onPress={handleEditSave}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Lưu</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.sub }]} onPress={handleEditCancel}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Huỷ</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }
                  return (
<EntryLogRow
                    key={e.id}
                    entry={e}
                    po={item.po}
                    theme={theme}
                    onDelete={() => confirmDelete(e.id)}
                    onEdit={() => handleEdit(e)}
                  />
                  );
                })
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
  title: { fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  poText: (theme) => ({ color: theme.sub, fontSize: 12.5, marginTop: 2, fontWeight: '500' }),
  pctText: (theme, pctColor) => ({ color: pctColor, fontSize: 16, fontWeight: '800' }),
  numsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  note: { fontSize: 10.5, marginTop: 2, fontStyle: 'italic' },
  hint: { fontSize: 11, marginBottom: 6 },
  editRow: { marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', gap: 16 },
  editBtn: { flexDirection: 'row' },
  numLabel: (theme) => ({ color: theme.sub, fontSize: 12, fontWeight: '500' }),
  numValue: (theme) => ({ color: theme.ink, fontSize: 14.5, fontWeight: '700' }),
  numValueBad: (theme) => ({ color: theme.bad, fontSize: 14.5, fontWeight: '700' }),
  numMetric: (theme) => ({ color: theme.ink, fontSize: 13, fontWeight: '600' }),
  refBox: { marginTop: 10, paddingLeft: 6 },
  refLabel: (theme) => ({ color: theme.sub, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 3 }),
  refValue: (theme) => ({ color: theme.ink, fontSize: 13.5, fontWeight: '600', marginTop: 2 }),
  refSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  refSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  refCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  refCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  refCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  refBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  refBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  refDoneBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  refPctText: {
    fontSize: 14,
    fontWeight: '800',
  },
  refProgressBarBg: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  refProgressBarFill: {
    height: '100%',
  },
  refMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  refMetricItem: {
    alignItems: 'center',
  },
  refMetricLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  refMetricValue: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  refInputMainRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginBottom: 8,
  },
  refInputMain: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    minHeight: 38,
  },
  refPickerWrap: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    height: 38,
  },
  refAddBtn: {
    paddingHorizontal: 14,
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
  },
  refAddBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12.5,
  },
  refDefectRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  refInputDefect: {
    width: 72,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    minHeight: 34,
  },
  refDefectChips: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
    flexWrap: 'wrap',
  },
  refDefectChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  refLastUpdatedTag: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  refLastUpdatedText: {
    fontSize: 11,
    fontWeight: '700',
  },
  unattributedBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
  },
  unattributedText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  sectionLabel: (theme) => ({ color: theme.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }),
  input: (theme) => ({ borderWidth: 1, borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink, borderRadius: 10, padding: 12, fontSize: 15 }),
  pickerWrap: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
  addBtn: { paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  defectChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  defectChipCompact: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  defectChipsCompact: { flexDirection: 'row', gap: 3 },
  poBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'center',
  },
  poBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  lastUpdatedBanner: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  lastUpdatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastUpdatedTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  poNoticeBanner: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 6,
    marginBottom: 8,
  },
});