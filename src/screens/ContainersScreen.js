// src/screens/ContainersScreen.js
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore, containersData } from '@/store/useAppStore';
import { getTheme } from '@/theme';
import { isPalletDone, countPalletsDoneWithData } from '@/db/queries';
import FilterChips from '@/components/FilterChips';
import ProgressBar from '@/components/ProgressBar';
import PalletRow from '@/components/PalletRow';
import ArchiveCard from '@/components/ArchiveCard';
import PalletEditSheet from '@/components/PalletEditSheet';

export default function ContainersScreen() {
  const theme = getTheme(useColorScheme());
  const {
    items, palletDoneMap, togglePallet, finishOrder, archives,
    activeContainerFilter, setContainerFilter, containerData,
    addPallet, updatePallet, removePallet,
  } = useAppStore();
  const [expandedIds, setExpandedIds] = useState(new Set());
  // FEAT-10: form thêm/sửa kiện. `draftPallet` = null ⇒ đang thêm mới.
  const [draft, setDraft] = useState(null); // { containerId, label, pallet, nextNo }
  const containers = containerData || containersData;
  const cpos = [...new Set(containers.map(c => c.po.split('+')).flat())];
  const filtered = containers.filter(
    c => activeContainerFilter === 'all' || c.po.split('+').includes(activeContainerFilter)
  );
  const { done, total } = countPalletsDoneWithData(palletDoneMap, containerData);
  const itemNtks = items.map(it => it.ntk);
  const knownNtks = new Set(itemNtks);

  function toggleExpand(id) {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedIds(next);
  }

  function openAddPallet(c) {
    const nextNo = (c.pallets || []).reduce((m, p) => Math.max(m, p.no), 0) + 1;
    setDraft({ containerId: c.id, label: c.label, pallet: null, nextNo });
  }

  function openEditPallet(c, pallet) {
    setDraft({ containerId: c.id, label: c.label, pallet, nextNo: null });
  }

  function handleFinish() {
    const message = done < total
      ? `Mới đóng xong ${done}/${total} kiện trên tất cả container.\nBạn có chắc muốn hoàn tất đơn hàng và lưu trữ dữ liệu hiện tại không?`
      : 'Xác nhận hoàn tất đơn hàng hiện tại?\nDữ liệu sẽ được lưu trữ lại và màn hình làm việc sẽ được dọn sạch để bắt đầu đơn mới.';
    Alert.alert('Hoàn tất đơn hàng', message, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xác nhận', onPress: finishOrder },
    ]);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={[styles.h1, { color: theme.ink }]}>📦 Container</Text>
        <FilterChips
          options={[['all', 'Tất cả PO'], ...cpos.map(p => [p, p])]}
          activeValue={activeContainerFilter}
          onSelect={setContainerFilter}
          theme={theme}
        />

        {filtered.map(c => {
          const isOpen = expandedIds.has(c.id);
          let cDone = 0, totalQty = 0, doneQty = 0;
          c.pallets.forEach(p => {
            const pd = isPalletDone(c.id, p, palletDoneMap);
            if (pd) cDone++;
            const q = p.items.reduce((s, it) => s + it.qty, 0);
            totalQty += q;
            if (pd) doneQty += q;
          });
          const pct = c.pallets.length ? Math.round((cDone / c.pallets.length) * 1000) / 10 : 0;
          const isFull = cDone === c.pallets.length;
          // AC-EDIT-23: kiện chứa mã không còn trong đơn → cảnh báo, không tự xoá.
          const unknownNtks = [...new Set(
            c.pallets.flatMap(p => p.items.map(it => it.ntk)).filter(n => !knownNtks.has(n))
          )];

          return (
            <View key={c.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <TouchableOpacity style={styles.top} onPress={() => toggleExpand(c.id)}>
                <View>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 16 }}>📦 {c.label}</Text>
                  <Text style={{ color: theme.sub, fontSize: 11.5, marginTop: 2 }}>PO {c.po}</Text>
                </View>
                <Text style={{ color: isFull ? theme.good : theme.ink, fontWeight: '700' }}>
                  {cDone}/{c.pallets.length} kiện {isOpen ? '▴' : '▾'}
                </Text>
              </TouchableOpacity>
              <ProgressBar pct={pct} color={isFull ? theme.good : theme.accent} theme={theme} />
              <View style={styles.numsRow}>
                <Text style={{ color: theme.sub, fontSize: 12 }}>{pct}% số kiện</Text>
                <Text style={{ color: theme.sub, fontSize: 12 }}>{doneQty}/{totalQty} pcs đã đóng</Text>
                {isFull && <Text style={{ color: theme.good, fontWeight: '700', fontSize: 12 }}>Sẵn sàng đóng container ✓</Text>}
              </View>
              {unknownNtks.length > 0 && (
                <Text style={{ color: theme.warn, fontSize: 11.5, marginTop: 8 }}>
                  ⚠ Kiện chứa mã không có trong đơn: {unknownNtks.join(', ')}
                </Text>
              )}
              {isOpen && (
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity style={styles.addPalletBtn} onPress={() => openAddPallet(c)}>
                    <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12.5 }}>＋ Thêm kiện</Text>
                  </TouchableOpacity>
                  {c.pallets.map(p => (
                    <PalletRow
                      key={p.no}
                      containerId={c.id}
                      pallet={p}
                      palletDoneMap={palletDoneMap}
                      onTogglePallet={togglePallet}
                      onEditPallet={pallet => openEditPallet(c, pallet)}
                      onDeletePallet={pallet => openEditPallet(c, pallet)}
                      theme={theme}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={[styles.finishBox, { backgroundColor: theme.card, borderColor: theme.ink }]}>
          <Text style={{ color: theme.sub, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
            Khi đơn hàng hiện tại ({done}/{total} kiện) đã xong, bấm để lưu trữ toàn bộ dữ liệu và dọn màn hình cho đơn hàng mới.
          </Text>
          <TouchableOpacity style={[styles.finishBtn, { backgroundColor: theme.bad }]} onPress={handleFinish}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>✅ Hoàn tất đơn hàng hiện tại</Text>
          </TouchableOpacity>
        </View>

        {archives.length > 0 && (
          <>
            <Text style={[styles.archiveHead, { color: theme.ink }]}>📁 Đơn hàng đã lưu trữ ({archives.length})</Text>
            {archives.map(a => <ArchiveCard key={a.id} archive={a} theme={theme} />)}
          </>
        )}

        {draft && (
          <PalletEditSheet
            containerLabel={`📦 ${draft.label}`}
            pallet={draft.pallet}
            itemOptions={itemNtks}
            defaultNo={draft.nextNo}
            onClose={() => setDraft(null)}
            onSubmit={draft.pallet
              ? payload => updatePallet(draft.containerId, draft.pallet.no, payload)
              : payload => addPallet(draft.containerId, payload)}
            onDelete={no => removePallet(draft.containerId, no)}
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
  h1: { fontSize: 19, fontWeight: '700', marginBottom: 4 },
  card: { borderWidth: 1.5, borderRadius: 6, padding: 14, marginBottom: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  numsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 9 },
  finishBox: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 6, padding: 14, marginVertical: 16 },
  addPalletBtn: { paddingVertical: 8 },
  finishBtn: { padding: 13, borderRadius: 4, alignItems: 'center' },
  archiveHead: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
});