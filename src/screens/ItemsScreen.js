// src/screens/ItemsScreen.js
import React, { useState, useMemo } from 'react';
import { Text, TextInput, ScrollView, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore, allPOs, filteredItems, summaryTotals } from '@/store/useAppStore';
import { getTheme } from '@/theme';
import SummaryCards from '@/components/SummaryCards';
import PoSummaryTable from '@/components/PoSummaryTable';
import { poSummaries } from '@/utils/poSummary';
import FilterChips from '@/components/FilterChips';
import ItemCard from '@/components/ItemCard';
import ImportJsonButton from '@/components/ImportJsonButton';
import ItemEditSheet from '@/components/ItemEditSheet';

export default function ItemsScreen() {
  const theme = getTheme(useColorScheme());
  const state = useAppStore();
  const {
    items, addEntry, updateEntry, removeEntry, setFilter, setStatusFilter, setSearchQuery,
    importFromJson, addItem, updateItem, removeItem,
  } = state;
  // FEAT-10: form thêm/sửa mã hàng. `draftItem` = null ⇒ đang thêm mới.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftItem, setDraftItem] = useState(null);

  const totals = summaryTotals(items);
  // FEAT-12: tổng theo PO là dữ liệu dẫn xuất — luôn tính trên TOÀN BỘ items,
  // không theo bộ lọc, để bảng làm tham chiếu ổn định của cả đơn (AC-ITEM-25).
  const pos = useMemo(() => allPOs(items), [items]);
  // `allPOs` đảm bảo mọi PO của đơn đều có dòng, kể cả PO không có mã nào
  // thuộc riêng — bảng khớp đúng chip lọc PO (AC-ITEM-24).
  const poRows = useMemo(() => poSummaries(items, pos), [items, pos]);
  const list = filteredItems(state);

  const activePo = state.activeFilter !== 'all' ? state.activeFilter : null;

  // FEAT-11 / INV-V3: chỉ mở nút xoá khi đang có batch `active` nạp trong store.
  // `init()` luôn nạp batch active, nên batchId rỗng ⇒ chưa sẵn sàng ghi.
  // Nếu về sau màn hình này hiển thị batch `archived`, `removeItem` sẽ xoá nhầm
  // dòng cùng ntk ở batch active — nên chặn ngay ở tầng UI.
  const canDeleteItem = !!state.batchId;

  function openAdd() {
    setDraftItem(null);
    setSheetOpen(true);
  }

  function openEdit(item) {
    setDraftItem(item);
    setSheetOpen(true);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={[styles.h1, { color: theme.ink }]}>📦 Theo dõi sản xuất hàng ngày</Text>
        <ImportJsonButton onImport={importFromJson} hasContainerData={!!state.containerData} theme={theme} />
        <SummaryCards totals={totals} theme={theme} />
        <PoSummaryTable summaries={poRows} theme={theme} />

        <TextInput
          style={[styles.search, { borderColor: theme.line, backgroundColor: theme.card, color: theme.ink }]}
          placeholder="Tìm mã hàng (VD: 106160)..."
          placeholderTextColor={theme.sub}
          value={state.searchQuery}
          onChangeText={setSearchQuery}
        />

        <FilterChips
          options={[['all', 'Tất cả PO'], ...pos.map(p => [p, p])]}
          activeValue={state.activeFilter}
          onSelect={setFilter}
          theme={theme}
        />
        <FilterChips
          options={[['all', 'Tất cả'], ['incomplete', 'Chưa hoàn thành'], ['done', 'Đã xong']]}
          activeValue={state.activeStatusFilter}
          onSelect={setStatusFilter}
          theme={theme}
        />

        <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.accent }]} onPress={openAdd}>
          <Text style={styles.addBtnTxt}>＋ Thêm mã hàng</Text>
        </TouchableOpacity>

        {list.length === 0 ? (
          <Text style={{ color: theme.sub, textAlign: 'center', paddingVertical: 20 }}>
            Không tìm thấy mã hàng nào.
          </Text>
        ) : (
          list.map(item => (
            <ItemCard
              key={item.ntk}
              item={item}
              theme={theme}
              onAddEntry={addEntry}
              onUpdateEntry={updateEntry}
              onDeleteEntry={removeEntry}
              onEditItem={openEdit}
              onDeleteItem={canDeleteItem ? removeItem : undefined}
            />
          ))
        )}

        {sheetOpen && (
          <ItemEditSheet
            item={draftItem}
            pos={pos}
            defaultPo={activePo}
            onClose={() => setSheetOpen(false)}
            onSubmit={draftItem
              ? payload => updateItem(draftItem.ntk, payload)
              : payload => addItem(payload)}
            onDelete={removeItem}
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
  h1: { fontSize: 19, fontWeight: '700', marginBottom: 10 },
  search: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16, marginTop: 4 },
  addBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginTop: 12 },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});