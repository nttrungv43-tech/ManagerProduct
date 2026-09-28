// src/components/ProgressBar.js
import React from 'react';
import { View } from 'react-native';

export default function ProgressBar({ pct, color, theme }) {
  return (
    <View style={{ height: 8, backgroundColor: theme.line, borderRadius: 2, overflow: 'hidden', marginTop: 10 }}>
      <View style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: color || theme.accent }} />
    </View>
  );
}