// src/components/ItemCard.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import ProgressBar from '@/components/ProgressBar';
import EntryLogRow from '@/components/EntryLogRow';
import { pctClass } from '@/store/useAppStore';
import { fetchEntriesForLine } from '@/db/queries';
import {
  parseQty, formatQtyError,
  INVALID_QTY_TITLE, INVALID_QTY_MESSAGE, OVER_TARGET_TITLE,
} from '@/utils/validateQty';
// FEAT-11: xoá mã trong 1 chạm. Dùng chung helper với nút trong ItemEditSheet (AC-EDIT-33/34).
import { confirmDeleteItem } from '@/utils/deleteItem';
// BUG-02: ngày cục bộ, không dùng `toISOString` (giờ UTC).
import { todayLocal } from '@/utils/date';
// FEAT-22: số hiệu nhà máy (`order_ref`) của **riêng PO × mã** này. Logic định dạng nằm ở util
// thuần để test được bằng `node`, component chỉ render.
import { refLabel, refLines, normalizeRefProgress, refProgressText, unattributedText, formatRefOverLimit }
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

// FEAT-11: `onDeleteItem` là prop TUỲ CHỌN — không truyền thì nút xoá không hiện (AC-EDIT-35).
export default function ItemCard({ item, theme, onAddEntry, onUpdateEntry, onDeleteEntry, onEditItem, onDeleteItem }) {
  const [expanded, setExpanded] = useState(false);
  const [qty, setQty] = useState('');
  const [line, setLine] = useState('manual');
  const [defectQty, setDefectQty] = useState('');
  const [defectTypes, setDefectTypes] = useState({ yellow: false, red: false, tear: false });
  const [logOpen, setLogOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editLine, setEditLine] = useState('manual');
  const [editDefectQty, setEditDefectQty] = useState('');
  const [editDefectTypes, setEditDefectTypes] = useState({ yellow: false, red: false, tear: false });
  // FEAT-23: ô nhập của từng số hiệu. Một state cho mọi ref, khoá theo tên ref ⇒ thêm bớt ref (do
  // nhập lại file nguồn) không cần dọn state.
  const [refQty, setRefQty] = useState({});

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

  function setRefQtyFor(refNo, value) {
    setRefQty(prev => ({ ...prev, [`${REF_KEY_PREFIX}${refNo}`]: value }));
  }

  /**
   * Ghi một mục nhật ký gắn vào **một** số hiệu.
   *
   * Dùng chung `readNumber` với form gốc nên ô rỗng ⇒ 0 ⇒ không ghi (không lỗi, giống `AC-ITEM-05`).
   * Vượt hạn mức **của ref** thì `Alert` riêng và **giữ nguyên ô nhập** để người dùng sửa lại —
   * cùng cách `AC-ITEM-18` xử lý vượt hạn mức tổng.
   */
  async function handleAddForRef(entry) {
    const refNo = entry.ref_no;
    const qRes = readNumber(refQty[`${REF_KEY_PREFIX}${refNo}`] ?? '');
    if (qRes.invalid) { showInvalidQty(); return; }
    if (qRes.value <= 0) return;

    const res = await onAddEntry(item.order_line_id, {
      date: todayLocal(),
      qty: qRes.value,
      line: 'manual',
      defectQty: 0,
      defectTypes: [],
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
    setRefQtyFor(refNo, '');
    loadEntries();
  }


  async function handleAdd() {
    const qRes = readNumber(qty);
    const dRes = readNumber(defectQty);
    if (qRes.invalid || dRes.invalid) { showInvalidQty(); return; }

    const q = qRes.value;
    const dq = dRes.value;
    if (q <= 0 && dq <= 0) return;
    const types = Object.keys(defectTypes).filter(k => defectTypes[k]);
    const res = await onAddEntry(item.order_line_id, {
      date: todayLocal(),
      qty: q, line, defectQty: dq, defectTypes: dq > 0 ? types : [],
    });
    // Vượt đơn đặt hàng: giữ nguyên ô nhập để người dùng sửa lại.
    if (res && res.ok === false) { showOverTarget(res.error); return; }
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
          handleEditCancel();
          loadEntries();
        },
      },
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

      {/* FEAT-17 (AC-NEW-05/06): 4 trường từ packing list. FEAT-22: chỉ còn `Kiện` — `KL`/`TKL`/
          `Thể tích` đã ẩn theo chỉ đạo chủ dự án, dữ liệu vẫn còn trong DB (INV-I2).
          `NULL` = không có dữ liệu ⇒ ẩn, không hiện `0` giả (INV-I1). */}
      {hasPackingMetrics(item) && (
        <View style={[styles.numsRow, { marginTop: 4 }]}>
          {metricParts(item).map(part => (
            <Text key={part} style={styles.numTxt(theme)}>{part}</Text>
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
            <Text key={line} style={styles.refTxt(theme)}>{line}</Text>
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
          <Text style={styles.sectionLabel(theme)}>Nhập sản xuất hôm nay</Text>
          {/* FEAT-20: nói rõ nhật ký sẽ được ghi cho PO nào — người dùng không phải đoán. */}
          <Text style={[styles.hint, { color: theme.sub }]}>Ghi cho PO {item.po}</Text>
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

          {/* FEAT-23 (phương án A): thẻ cha GIỮ NGUYÊN, mỗi số hiệu là một dòng nhập bên dưới.
              Ô trống ⇒ không ghi (không lỗi). Vượt hạn mức ref ⇒ Alert riêng + giữ ô nhập. */}
          {refProgress.length > 0 && (
            <View style={styles.refSection(theme)}>
              <Text style={styles.sectionLabel(theme)}>Tiến độ & nhập theo số hiệu</Text>
              {refProgress.map(entry => {
                const key = `${REF_KEY_PREFIX}${entry.ref_no}`;
                return (
                  <View key={entry.ref_no} style={styles.refInputRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.ink, fontSize: 13, fontWeight: '600' }}>
                        {entry.ref_no}
                      </Text>
                      <Text style={{ color: theme.sub, fontSize: 11.5, marginTop: 1 }}>
                        {refProgressText(entry)}
                      </Text>
                    </View>
                    <TextInput
                      style={[styles.refInput(theme), { width: 74 }]}
                      keyboardType="numeric"
                      placeholder="SL"
                      placeholderTextColor={theme.sub}
                      value={refQty[key] ?? ''}
                      onChangeText={v => setRefQtyFor(entry.ref_no, v)}
                    />
                    <TouchableOpacity
                      style={[styles.addBtn, { backgroundColor: theme.accent, paddingHorizontal: 16 }]}
                      onPress={() => handleAddForRef(entry)}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Thêm</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {/* AC-RF-08: phần chưa gắn số hiệu phải được nói ra, nếu không `Σ` các ref sẽ lệch
                  với `Đã làm` ở thẻ cha mà không có lý do. */}
              {unattributed && (
                <Text style={{ color: theme.sub, fontSize: 11.5, marginTop: 6, fontStyle: 'italic' }}>
                  {unattributed}
                </Text>
              )}
            </View>
          )}

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
  title: { fontSize: 16, fontWeight: '700' },
  numsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 9 },
  // FEAT-19: ghi chú nhỏ dưới PO (sản lượng dùng chung / chưa tách được theo PO).
  note: { fontSize: 10.5, marginTop: 2, fontStyle: 'italic' },
  hint: { fontSize: 11, marginBottom: 6 },
  editRow: { marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', gap: 16 },
  editBtn: { flexDirection: 'row' },
  numTxt: (theme) => ({ color: theme.sub, fontSize: 12 }),
  // FEAT-22: khối số hiệu tách nhẹ khỏi dòng số bằng **khoảng lề + cỡ chữ**, không dùng viền màu
  // (màu hard-code trong component bị `SPEC-rules` §0.3 cấm).
  refBox: { marginTop: 8, paddingLeft: 6 },
  refLabel: (theme) => ({ color: theme.sub, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' }),
  refTxt: (theme) => ({ color: theme.ink, fontSize: 12.5, marginTop: 2 }),
  // FEAT-23: khối nhập theo số hiệu, tách khỏi form nhập tổng bằng nền nhạt hơn.
  refSection: (theme) => ({ marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.line }),
  refInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  refInput: (theme) => ({
    borderWidth: 1, borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14,
  }),
  sectionLabel: (theme) => ({ color: theme.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }),
  input: (theme) => ({ borderWidth: 1, borderColor: theme.line, backgroundColor: theme.bg, color: theme.ink, borderRadius: 10, padding: 12, fontSize: 15 }),
  pickerWrap: { flex: 1, borderWidth: 1, borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
  addBtn: { paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  defectChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
});