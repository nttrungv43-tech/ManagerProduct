// src/components/PalletRow.js
// FEAT-21 — Trạng thái đóng kiện là cột pallet_lines.done
import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PalletRow({
  pallet, isMultiPo, onToggleLine, onEditPallet, onDeletePallet, theme, highlightNtk = '',
}) {
  const qty = pallet.items.reduce((s, it) => s + it.qty, 0);
  const palletPos = new Set((pallet.items || []).map(it => it.po).filter(Boolean));
  const hasMultiPo = Boolean(isMultiPo || palletPos.size > 1);

  function confirmToggle(line, label) {
    Alert.alert(
      'Xác nhận',
      line.done
        ? `${label} đang được đánh dấu là đã xong.\nBạn có chắc muốn bỏ đánh dấu không?`
        : `Xác nhận ${label} đã đóng xong?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => onToggleLine(line.id, line.done) },
      ]
    );
  }

  const actions = (onEditPallet || onDeletePallet) ? (
    <View style={styles.actions}>
      {onEditPallet && (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onEditPallet(pallet)}>
          <Ionicons name="pencil" size={12} color={theme.accent} style={{ marginRight: 3 }} />
          <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 12 }}>Sửa</Text>
        </TouchableOpacity>
      )}
      {onDeletePallet && (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onDeletePallet(pallet)}>
          <Ionicons name="trash-outline" size={12} color={theme.bad} style={{ marginRight: 3 }} />
          <Text style={{ color: theme.bad, fontWeight: '600', fontSize: 12 }}>Xoá</Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  const palletNo = pallet.pallet_no ?? pallet.no;

  if (pallet.items.length > 1) {
    const allDone = pallet.items.length > 0 && pallet.items.every(it => it.done);
    return (
      <View style={[styles.row, { borderTopColor: theme.line }]}>
        <Text
          style={[
            styles.title,
            {
              color: allDone ? theme.good : theme.ink,
              textDecorationLine: allDone ? 'line-through' : 'none',
              opacity: allDone ? 0.8 : 1,
            },
          ]}
        >
          Kiện {palletNo} — {qty.toLocaleString('vi-VN')} pcs ({pallet.items.length} loại hàng)
        </Text>
        <View style={{ marginTop: 8, gap: 8 }}>
          {pallet.items.map(it => (
            <TouchableOpacity
              key={it.id}
              style={styles.subRow}
              onPress={() => confirmToggle(it, `loại hàng ${it.ntk}${it.po ? ` (PO ${it.po})` : ''}`)}
            >
              <View
                style={[
                  styles.checkSm,
                  {
                    borderColor: it.done ? theme.good : theme.line,
                    backgroundColor: it.done ? theme.good : theme.bg,
                  },
                ]}
              >
                {it.done && <Ionicons name="checkmark" size={15} color="#fff" />}
              </View>
              <View style={styles.subItemContent}>
                {(() => {
                  const q = highlightNtk.trim().toLowerCase();
                  const isMatch = Boolean(q && String(it.ntk || '').toLowerCase().includes(q));
                  return (
                    <View
                      style={[
                        styles.ntkBadge,
                        {
                          backgroundColor: isMatch ? theme.accent + '35' : theme.bg,
                          borderColor: isMatch ? theme.accent : theme.line,
                        },
                      ]}
                    >
                      <Ionicons name="pricetag" size={11} color={theme.accent} style={{ marginRight: 4 }} />
                      <Text style={[styles.ntkPrefix, { color: theme.sub }]}>Mã</Text>
                      <Text
                        style={[
                          styles.ntkCode,
                          {
                            color: it.done ? theme.good : theme.ink,
                            textDecorationLine: it.done ? 'line-through' : 'none',
                          },
                        ]}
                      >
                        {it.ntk}
                      </Text>
                    </View>
                  );
                })()}

                <Text
                  style={[
                    styles.itemQtyText,
                    {
                      color: it.done ? theme.good : theme.ink,
                      textDecorationLine: it.done ? 'line-through' : 'none',
                      opacity: it.done ? 0.8 : 1,
                    },
                  ]}
                >
                  × <Text style={{ fontWeight: '800' }}>{it.qty.toLocaleString('vi-VN')}</Text> pcs
                </Text>

                {hasMultiPo && Boolean(it.po) && (
                  <View style={[styles.poBadge, { backgroundColor: theme.accent + '18', borderColor: theme.accent + '40' }]}>
                    <Text style={[styles.poBadgeText, { color: theme.accent }]}>PO {it.po}</Text>
                  </View>
                )}

                {Boolean(it.order_ref) && (
                  <View
                    style={[
                      styles.refBadge,
                      {
                        backgroundColor: (highlightNtk && String(it.order_ref || '').toLowerCase().includes(highlightNtk.trim().toLowerCase()))
                          ? theme.accent + '35'
                          : theme.sub + '18',
                        borderColor: (highlightNtk && String(it.order_ref || '').toLowerCase().includes(highlightNtk.trim().toLowerCase()))
                          ? theme.accent
                          : theme.sub + '40',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.refBadgeText,
                        {
                          color: (highlightNtk && String(it.order_ref || '').toLowerCase().includes(highlightNtk.trim().toLowerCase()))
                            ? theme.accent
                            : theme.ink,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      Ref {it.order_ref}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
        {actions}
      </View>
    );
  }

  // Kiện một mã
  const line = pallet.items[0];
  const done = !!line?.done;

  const q = highlightNtk.trim().toLowerCase();
  const isMatchSingle = Boolean(q && String(line?.ntk || '').toLowerCase().includes(q));
  const isMatchRefSingle = Boolean(q && line?.order_ref && String(line.order_ref).toLowerCase().includes(q));

  return (
    <View style={[styles.row, { borderTopColor: theme.line }]}>
      <TouchableOpacity
        disabled={!line}
        onPress={() => line && confirmToggle(line, `kiện ${palletNo}${line.po ? ` (PO ${line.po})` : ''}`)}
      >
        <View style={styles.palletHeader}>
          <View
            style={[
              styles.checkLg,
              {
                borderColor: done ? theme.good : theme.line,
                backgroundColor: done ? theme.good : theme.bg,
              },
            ]}
          >
            {done && <Ionicons name="checkmark" size={18} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.title,
                {
                  color: done ? theme.good : theme.ink,
                  textDecorationLine: done ? 'line-through' : 'none',
                  opacity: done ? 0.8 : 1,
                },
              ]}
            >
              Kiện {palletNo} — {qty.toLocaleString('vi-VN')} pcs
            </Text>
            {line ? (
              <View style={[styles.subItemContent, { marginTop: 4 }]}>
                <View
                  style={[
                    styles.ntkBadge,
                    {
                      backgroundColor: isMatchSingle ? theme.accent + '35' : theme.bg,
                      borderColor: isMatchSingle ? theme.accent : theme.line,
                    },
                  ]}
                >
                  <Ionicons name="pricetag" size={12} color={theme.accent} style={{ marginRight: 4 }} />
                  <Text style={[styles.ntkPrefix, { color: theme.sub }]}>Mã</Text>
                  <Text
                    style={[
                      styles.ntkCode,
                      {
                        color: done ? theme.good : theme.ink,
                        textDecorationLine: done ? 'line-through' : 'none',
                      },
                    ]}
                  >
                    {line.ntk}
                  </Text>
                </View>

                {hasMultiPo && Boolean(line.po) && (
                  <View style={[styles.poBadge, { backgroundColor: theme.accent + '18', borderColor: theme.accent + '40' }]}>
                    <Text style={[styles.poBadgeText, { color: theme.accent }]}>PO {line.po}</Text>
                  </View>
                )}

                {Boolean(line.order_ref) && (
                  <View
                    style={[
                      styles.refBadge,
                      {
                        backgroundColor: isMatchRefSingle ? theme.accent + '35' : theme.sub + '18',
                        borderColor: isMatchRefSingle ? theme.accent : theme.sub + '40',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.refBadgeText,
                        {
                          color: isMatchRefSingle ? theme.accent : theme.ink,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      Ref {line.order_ref}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, borderTopWidth: 1 },
  palletHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 14, fontWeight: '700' },
  checkLg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSm: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  ntkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  ntkPrefix: {
    fontSize: 11.5,
    fontWeight: '700',
    marginRight: 4,
  },
  ntkCode: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  itemQtyText: {
    fontSize: 12.5,
  },
  poBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  poBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  refBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  refBadgeText: {
    fontSize: 11,
  },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8, paddingLeft: 40 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
});