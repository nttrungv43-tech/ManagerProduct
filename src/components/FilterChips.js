// src/components/FilterChips.js
import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function FilterChips({ options, activeValue, onSelect, theme }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
      {options.map(([value, label]) => {
        const active = activeValue === value;
        return (
          <TouchableOpacity
            key={value}
            onPress={() => onSelect(value)}
            style={[
              styles.chip,
              {
                borderColor: active ? theme.accent : theme.line,
                backgroundColor: active ? theme.accent : theme.card,
                elevation: active ? 3 : 1,
                shadowColor: active ? theme.accent : '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: active ? 0.25 : 0.03,
                shadowRadius: 2,
              },
            ]}
          >
            <Text style={{ color: active ? '#fff' : theme.sub, fontSize: 13, fontWeight: active ? '700' : '600' }}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
});