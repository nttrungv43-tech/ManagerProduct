// src/app/(tabs)/_layout.tsx
import React from 'react';
import { Text, useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { getTheme } from '@/theme';

export default function TabsLayout() {
  const theme = getTheme(useColorScheme());

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.sub,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.ink, borderTopWidth: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Mã hàng', tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧵</Text> }}
      />
      <Tabs.Screen
        name="containers"
        options={{ title: 'Container', tabBarIcon: () => <Text style={{ fontSize: 20 }}>📦</Text> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Lịch sử', tabBarIcon: () => <Text style={{ fontSize: 20 }}>📊</Text> }}
      />
    </Tabs>
  );
}