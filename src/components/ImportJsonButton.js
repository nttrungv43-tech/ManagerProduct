// src/components/ImportJsonButton.js
import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const SUMMARY_KEY = '\u7e3d\u8868';

function detectFormat(parsed) {
  if (Array.isArray(parsed)) {
    const sample = parsed.find(e => typeof e === 'object' && e !== null);
    return sample && sample.ntk && sample.date ? 'entries' : 'unknown';
  }
  if (parsed && typeof parsed === 'object') {
    if (parsed.entries) return 'entries';
    if (parsed[SUMMARY_KEY]) return 'packingList';
    const hasArray = Object.keys(parsed).some(k => Array.isArray(parsed[k]));
    if (hasArray) return 'packingList';
  }
  return 'unknown';
}

export default function ImportJsonButton({ onImport, theme }) {
  const [loading, setLoading] = useState(false);

  async function handleImport() {
    let asset;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      asset = result.assets[0];
    } catch (_e) {
      Alert.alert('Lỗi', 'Không thể chọn file. Vui lòng thử lại.');
      return;
    }

    let jsonContent;
    try {
      jsonContent = await FileSystem.readAsStringAsync(asset.uri);
    } catch (_e) {
      try {
        const response = await fetch(asset.uri);
        jsonContent = await response.text();
      } catch (_e2) {
        Alert.alert('Lỗi', 'Không thể đọc nội dung file. Vui lòng thử file khác.');
        return;
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (_e) {
      Alert.alert('Lỗi định dạng', 'File JSON không hợp lệ. Vui lòng kiểm tra cú pháp.');
      return;
    }

    const fmt = detectFormat(parsed);
    if (fmt === 'unknown') {
      Alert.alert(
        'Lỗi định dạng',
        'File JSON không được nhận diện.\nCần có mảng `entries` (nhật ký sản xuất) hoặc dữ liệu packing list (cot\u7e3d\u8868 / Column4).'
      );
      return;
    }

    let count;
    if (fmt === 'entries') {
      const entries = Array.isArray(parsed) ? parsed : parsed.entries;
      count = entries.length;
    } else {
      const summary = parsed[SUMMARY_KEY] || Object.values(parsed).find(Array.isArray);
      if (Array.isArray(summary)) {
        count = summary.filter(r => r && typeof r === 'object'
          && r.Column4 && typeof r.Column4 === 'string'
          && r.Column6 && typeof r.Column6 === 'number' && r.Column6 > 0).length;
      } else {
        count = 0;
      }
    }

    Alert.alert(
      'Xác nhận nhập',
      fmt === 'entries'
        ? `Nhập ${count} nhật ký sản xuất từ file "${asset.name}"?`
        : `Nhập ${count} mã hàng từ packing list "${asset.name}"?\nDữ liệu sẽ cập nhật items cho đơn hiện tại.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Nhập',
          onPress: async () => {
            setLoading(true);
            try {
              const res = await onImport(jsonContent);
              if (fmt === 'entries') {
                // FEAT-09: báo riêng số mục bị bỏ qua vì vượt đơn đặt hàng.
                const over = res.skippedOver > 0
                  ? `\nVượt đơn đặt hàng: ${res.skippedOver} mục bị bỏ qua.`
                  : '';
                Alert.alert('Hoàn tất', `Đã nhập: ${res.imported} mục.\nBỏ qua: ${res.skipped} mục.${over}`);
              } else {
                Alert.alert('Hoàn tất', `Đã nhập: ${res.imported} mã hàng.\nContainer: ${res.containers} | Kiện: ${res.pallets}`);
              }
            } catch (e) {
              Alert.alert('Lỗi', e.message || 'Có lỗi xảy ra khi nhập dữ liệu.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: loading ? theme.sub : theme.accent }]}
      onPress={handleImport}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={styles.btnText}>📥 Nhập JSON</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
