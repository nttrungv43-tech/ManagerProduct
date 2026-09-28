// src/app/_layout.tsx
import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore } from '@/store/useAppStore';
import { getTheme } from '@/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = getTheme(scheme);
  const init = useAppStore(s => s.init);
  const ready = useAppStore(s => s.ready);

  useEffect(() => { init(); }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={{ color: theme.sub, marginTop: 10 }}>Đang tải dữ liệu...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}