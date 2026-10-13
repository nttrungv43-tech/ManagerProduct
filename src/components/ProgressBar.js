// src/components/ProgressBar.js
import React from 'react';
import { View } from 'react-native';

export default function ProgressBar({ pct, color, theme }) {
  const barColor = color || (pct >= 100 ? theme.good : theme.accent);
  return (
    <View style={{ height: 8, backgroundColor: theme.line, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
      <View style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: barColor, borderRadius: 999 }} />
    </View>
  );
}