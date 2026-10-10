// src/screens/ItemsScreen.js
import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore, allPOs, summaryTotals, filteredItems } from '@/store/useAppStore';
import { getTheme } from '@/theme';
import SummaryCards from '@/components/SummaryCards';
import PoSummaryTable from '@/components/PoSummaryTable';
// FEAT-19: tách mã nhiều PO thành nhiều dòng, mỗi dòng một PO (`106167GF` → PO 2922 + PO 2923).
import FilterChips from '@/components/FilterChips';
import ItemCard from '@/components/ItemCard';
import ImportJsonButton from '@/components/ImportJsonButton';
import ItemEditSheet from '@/components/ItemEditSheet';

export default function ItemsScreen() {
  const theme = getTheme(useColorScheme());
  const state = useAppStore();
  const {
    items, poRows, addEntry, updateEntry, removeEntry, setFilter, setStatusFilter, setSearchQuery,
    importFromJson, addItem, updateItem, removeItem,
    lastUpdatedInfo, setLastUpdatedInfo,
  } = state;
  // FEAT-10: form thêm/sửa mã hàng. `draftItem` = null ⇒ đang thêm mới.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftItem, setDraftItem] = useState(null);

  const totals = summaryTotals(items);
  // FEAT-12: tổng theo PO là dữ liệu dẫn xuất — luôn tính trên TOÀN BỘ items,
  // không theo bộ lọc, để bảng làm tham chiếu ổn định của cả đơn (AC-ITEM-25).
  const pos = useMemo(() => allPOs(items), [items]);
  // FEAT-21: danh sách thẻ **đã là** (PO × mã) — không còn `splitItemRows` để tách, không còn
  // `item_po` để đối chiếu, không còn nhật ký "chưa gắn PO". `items` từ `fetchItemsWithStats`
  // đã mang `target`/`produced`/`remaining` của **riêng** PO đó (view `v_line_progress`).
  // Lọc trên tối đa 220 thẻ (`Dmac.json`) nên gọi thẳng còn hơn `useMemo` — tránh phải liệt kê
  // dependency và dễ đọc hơn.
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

        <View style={styles.addRow}>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.accent }]} onPress={openAdd}>
            <Text style={styles.addBtnTxt}>＋ Thêm mã hàng</Text>
          </TouchableOpacity>
        </View>

        {list.length === 0 ? (
          <Text style={{ color: theme.sub, textAlign: 'center', paddingVertical: 20 }}>
            {/* FEAT-14 (AC-ITEM-30): đơn trắng khác "lọc không ra kết quả" (AC-ITEM-15). */}
            {items.length === 0
              ? 'Chưa có mã hàng nào trong đơn hàng này.\nBấm ＋ Thêm mã hàng hoặc Nhập JSON để bắt đầu.'
              : 'Không tìm thấy mã hàng nào.'}
          </Text>
        ) : (
          list.map(row => (
            <ItemCard
              // FEAT-21: `order_line_id` là PK của một dòng đơn hàng (PO × mã) ⇒ ổn định và
              // duy nhất. `rowKey` của bản cũ không còn vì không còn bước "tách thẻ" (FEAT-19).
              // (Trước đây `key={item.ntk}` — BUG-06.)
              key={row.order_line_id}
              item={row}
              theme={theme}
              isLastUpdated={lastUpdatedInfo?.orderLineId === row.order_line_id}
              lastUpdatedInfo={lastUpdatedInfo?.orderLineId === row.order_line_id ? lastUpdatedInfo : null}
              onSetLastUpdated={setLastUpdatedInfo}
              onAddEntry={addEntry}
              onUpdateEntry={updateEntry}
              onDeleteEntry={removeEntry}
              // AC-SPLIT-07: `updateItem`/`removeItem` nhắm theo **mã** ⇒ bấm ở thẻ tách sẽ
              // xoá/sửa cả các PO khác của mã. Ẩn nút thay vì để người dùng xoá nhầm.
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
              // Sửa: hỗ trợ cập nhật số lượng target, số PO và tên mã hàng
              ? payload => updateItem(draftItem.order_line_id, {
                  target: payload.target,
                  po: payload.po,
                  itemCode: payload.ntk,
                })
              // Thêm: form gửi ntk, queries dùng tên itemCode; tự động về 'all' nếu PO khác bộ lọc hiện tại
              : async payload => {
                  const res = await addItem({ po: payload.po, itemCode: payload.ntk, target: payload.target });
                  if (res && res.ok !== false) {
                    if (state.activeFilter !== 'all' && state.activeFilter !== payload.po) {
                      setFilter('all');
                    }
                  }
                  return res;
                }}
            onDelete={draftItem ? () => removeItem(draftItem.order_line_id) : undefined}
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
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' },
  addBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});