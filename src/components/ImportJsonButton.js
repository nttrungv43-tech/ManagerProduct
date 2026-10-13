// src/components/ImportJsonButton.js
import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import {
  detectFormat, detectFormatError, estimateImportCount,
  FORMAT_ENTRIES, FORMAT_PACKING_V1,
} from '@/utils/importFormat';

export default function ImportJsonButton({ onImport, hasContainerData, theme }) {
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
      jsonContent = await new File(asset.uri).text();
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
    const formatError = detectFormatError(parsed, asset.name);
    if (formatError) {
      Alert.alert('Lỗi định dạng', formatError);
      return;
    }

    const count = estimateImportCount(parsed);

    Alert.alert(
      'Xác nhận nhập',
      fmt === FORMAT_ENTRIES
        ? `Nhập ${count} nhật ký sản xuất từ file "${asset.name}"?`
        : `Nhập ${count} mã hàng từ packing list "${asset.name}"?\nDữ liệu sẽ được thêm vào/cập nhật cho đơn hiện tại (dữ liệu các đơn cũ được giữ nguyên).`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Nhập',
          onPress: async () => {
            setLoading(true);
            try {
              const res = await onImport(jsonContent);
              if (res && res.ok === false) {
                Alert.alert('Lỗi nhập dữ liệu', res.error?.message || res.error?.code || 'Có lỗi xảy ra khi nhập dữ liệu.');
                return;
              }
              if (fmt === FORMAT_ENTRIES) {
                const over = (res?.skippedOver ?? 0) > 0
                  ? `\nVượt đơn đặt hàng: ${res.skippedOver} mục bị bỏ qua.`
                  : '';
                Alert.alert('Hoàn tất', `Đã nhập: ${res?.imported ?? 0} mục.\nBỏ qua: ${res?.skipped ?? 0} mục.${over}`);
              } else {
                const v1 = fmt === FORMAT_PACKING_V1;
                const multiPo = v1 && (res?.multiPoItems ?? 0) > 0
                  ? `\n${res.multiPoItems} mã thuộc nhiều PO (hiển thị dạng A+B).`
                  : '';
                const shipments = v1 && res?.shipments ? `\nShipment: ${res.shipments}` : '';
                Alert.alert('Hoàn tất', `Đã nhập: ${res?.imported ?? 0} mã hàng.\nContainer: ${res?.containers ?? 0} | Kiện: ${res?.pallets ?? 0}${shipments}${multiPo}`);
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
        <View style={styles.btnContent}>
          <Ionicons name="cloud-upload-outline" size={17} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.btnText}>Nhập JSON</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
