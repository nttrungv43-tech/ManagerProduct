import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

  // Xử lý bàn phím để không che mất ô nhập liệu
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, e => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToElement = targetRef => {
    if (!targetRef?.current || !scrollViewRef?.current) return;
    try {
      targetRef.current.measureLayout(
        scrollViewRef.current,
        (_x, y) => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, y - 70),
            animated: true,
          });
        },
        () => {}
      );
    } catch {
      // ignore
    }
  };

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.wrap,
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 120 : 60 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={styles.headerTitleRow}>
            <Ionicons name="layers" size={22} color={theme.accent} style={{ marginRight: 8 }} />
            <Text style={[styles.h1, { color: theme.ink }]}>Theo dõi sản xuất hàng ngày</Text>
          </View>

          <ImportJsonButton onImport={importFromJson} hasContainerData={!!state.containerData} theme={theme} />
          <SummaryCards totals={totals} theme={theme} />
          <PoSummaryTable summaries={poRows} theme={theme} />

          <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Ionicons name="search-outline" size={18} color={theme.sub} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: theme.ink }]}
              placeholder="Tìm mã hàng (VD: 106160)..."
              placeholderTextColor={theme.sub}
              value={state.searchQuery}
              onChangeText={setSearchQuery}
            />
            {state.searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={theme.sub} />
              </TouchableOpacity>
            ) : null}
          </View>

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
              <Ionicons name="add-circle-outline" size={17} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.addBtnTxt}>Thêm mã hàng</Text>
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
                key={row.order_line_id}
                item={row}
                theme={theme}
                isLastUpdated={lastUpdatedInfo?.orderLineId === row.order_line_id}
                lastUpdatedInfo={lastUpdatedInfo?.orderLineId === row.order_line_id ? lastUpdatedInfo : null}
                onSetLastUpdated={setLastUpdatedInfo}
                onAddEntry={addEntry}
                onUpdateEntry={updateEntry}
                onDeleteEntry={removeEntry}
                onEditItem={openEdit}
                onDeleteItem={canDeleteItem ? removeItem : undefined}
                onFocusElement={scrollToElement}
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
                ? payload => updateItem(draftItem.order_line_id, {
                    target: payload.target,
                    po: payload.po,
                    itemCode: payload.ntk,
                  })
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: 14, paddingBottom: 40 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  h1: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12, marginBottom: 8, flexWrap: 'wrap' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});