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
              { borderColor: theme.line, backgroundColor: active ? theme.accent : theme.card },
            ]}
          >
            <Text style={{ color: active ? '#fff' : theme.sub, fontSize: 13, fontWeight: '600' }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 6,
    minHeight: 38,
    justifyContent: 'center',
  },
});