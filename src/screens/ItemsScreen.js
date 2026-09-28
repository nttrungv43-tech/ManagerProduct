// src/screens/ItemsScreen.js
import React from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore, allPOs, filteredItems, summaryTotals } from '@/store/useAppStore';
import { getTheme } from '@/theme';
import SummaryCards from '@/components/SummaryCards';
import FilterChips from '@/components/FilterChips';
import ItemCard from '@/components/ItemCard';

export default function ItemsScreen() {
  const theme = getTheme(useColorScheme());
  const state = useAppStore();
  const { items, addEntry, updateEntry, removeEntry, setFilter, setStatusFilter, setSearchQuery } = state;

  const totals = summaryTotals(items);
  const pos = allPOs(items);
  const list = filteredItems(state);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={[styles.h1, { color: theme.ink }]}>📦 Theo dõi sản xuất hàng ngày</Text>
        <SummaryCards totals={totals} theme={theme} />

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
            />
          ))
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
});