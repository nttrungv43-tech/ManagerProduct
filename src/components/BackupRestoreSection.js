// src/components/BackupRestoreSection.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useAppStore } from '@/store/useAppStore';
import {
  validateBackupPayload,
  formatBackupSummary,
  generateBackupFilename,
} from '@/utils/backupFormat';

export default function BackupRestoreSection({ theme, onRestoreComplete }) {
  const { exportBackup, restoreBackup } = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const busy = exporting || restoring;

  async function handleExport() {
    if (busy) return;
    setExporting(true);
    let backupPayload;
    let jsonString;
    let filename;
    let fileUri = null;

    try {
      backupPayload = await exportBackup();
      jsonString = JSON.stringify(backupPayload, null, 2);
      filename = generateBackupFilename();

      // 1. Lưu file vào bộ nhớ bền vững của app (Paths.document) và cache
      try {
        if (Paths && Paths.document) {
          const docFile = new File(Paths.document, filename);
          docFile.write(jsonString);
          fileUri = docFile.uri;
        } else if (Paths && Paths.cache) {
          const cacheFile = new File(Paths.cache, filename);
          cacheFile.write(jsonString);
          fileUri = cacheFile.uri;
        }
      } catch (_fileErr) {
        // Dự phòng
      }
    } catch (e) {
      setExporting(false);
      Alert.alert('Lỗi sao lưu', e?.message || 'Không thể xuất dữ liệu sao lưu.');
      return;
    }

    // 2. Tắt trạng thái xoay vòng NGAY LẬP TỨC để người dùng không phải chờ đợi
    setExporting(false);

    const sizeKb = Math.round((jsonString.length / 1024) * 10) / 10;
    const summaryText = formatBackupSummary(backupPayload);

    // 3. Hiển thị thông báo thành công và cho phép người dùng chọn lưu máy hoặc chia sẻ
    const alertButtons = [
      { text: 'Đóng', style: 'cancel' },
    ];

    if (Platform.OS === 'android') {
      alertButtons.push({
        text: '💾 Lưu vào máy (Downloads)',
        onPress: async () => {
          try {
            const { StorageAccessFramework } = await import('expo-file-system/legacy');
            const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              const baseName = filename.replace(/\.json$/i, '');
              const safUri = await StorageAccessFramework.createFileAsync(
                permissions.directoryUri,
                baseName,
                'application/json'
              );
              await StorageAccessFramework.writeAsStringAsync(safUri, jsonString);
              Alert.alert('Thành công', `Đã lưu file "${filename}" vào thư mục bạn chọn.`);
            }
          } catch (_safErr) {
            // Nếu SAF không được cấp quyền hoặc lỗi, chuyển sang Share
            shareFileFallback(filename, fileUri, jsonString);
          }
        },
      });
    }

    alertButtons.push({
      text: Platform.OS === 'ios' ? '📤 Lưu Tệp / Chia sẻ' : '📤 Chia sẻ qua app',
      onPress: () => shareFileFallback(filename, fileUri, jsonString),
    });

    Alert.alert(
      '✅ Đã tạo file sao lưu thành công',
      `📁 Tên file: ${filename}\n📦 Dung lượng: ~${sizeKb} KB\n\n${summaryText}\n\nBạn có muốn lưu file ra bộ nhớ máy (thư mục Downloads) hoặc chia sẻ qua Zalo, Drive, Email không?`,
      alertButtons
    );
  }

  async function shareFileFallback(filename, fileUri, jsonString) {
    try {
      const shareOptions = {
        title: filename,
        ...(Platform.OS === 'ios'
          ? { url: fileUri || undefined, message: fileUri ? undefined : jsonString }
          : { message: jsonString, url: fileUri || undefined }),
      };
      await Share.share(shareOptions);
    } catch (_err) {
      // Người dùng bấm huỷ chia sẻ hoặc đóng dialog
    }
  }

  async function handleRestore() {
    if (busy) return;
    let asset;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      asset = result.assets[0];
    } catch (_e) {
      Alert.alert('Lỗi', 'Không thể mở trình chọn file. Vui lòng thử lại.');
      return;
    }

    setRestoring(true);
    let jsonContent;
    try {
      jsonContent = await new File(asset.uri).text();
    } catch (_e) {
      try {
        const response = await fetch(asset.uri);
        jsonContent = await response.text();
      } catch (_e2) {
        setRestoring(false);
        Alert.alert('Lỗi', 'Không thể đọc nội dung file sao lưu. Vui lòng thử lại.');
        return;
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (_e) {
      setRestoring(false);
      Alert.alert('Lỗi định dạng', 'File không đúng định dạng JSON.');
      return;
    }

    const validation = validateBackupPayload(parsed);
    if (!validation.valid) {
      setRestoring(false);
      Alert.alert('Không thể phục hồi', validation.error);
      return;
    }

    setRestoring(false);

    const summaryText = formatBackupSummary(parsed);
    Alert.alert(
      '⚠️ Xác nhận phục hồi dữ liệu',
      `${summaryText}\n\nLƯU Ý QUAN TRỌNG: Toàn bộ dữ liệu hiện tại trên ứng dụng sẽ bị xoá và thay thế hoàn toàn bằng dữ liệu từ file sao lưu này.\n\nBạn có chắc chắn muốn phục hồi không?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Phục hồi',
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              const res = await restoreBackup(parsed);
              if (res && res.ok === false) {
                Alert.alert('Lỗi phục hồi', res.error?.message || 'Có lỗi xảy ra khi phục hồi cơ sở dữ liệu.');
                return;
              }
              if (onRestoreComplete) {
                await onRestoreComplete();
              }
              Alert.alert(
                'Phục hồi thành công',
                `Đã khôi phục thành công:\n• ${res?.batches ?? 0} đơn hàng\n• ${res?.pos ?? 0} mã PO\n• ${res?.lines ?? 0} mã hàng\n• ${res?.entries ?? 0} lượt nhật ký\n• ${res?.containers ?? 0} container\n• ${res?.pallets ?? 0} kiện`
              );
            } catch (err) {
              Alert.alert('Lỗi phục hồi', err?.message || 'Có lỗi xảy ra khi phục hồi dữ liệu.');
            } finally {
              setRestoring(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.ink }]}>💾 Sao lưu & Phục hồi dữ liệu (JSON)</Text>
        <Text style={[styles.desc, { color: theme.sub }]}>
          Sao lưu toàn bộ app (đơn hàng, mã hàng, kiện, nhật ký) ra file JSON để tránh mất dữ liệu hoặc chuyển sang máy khác.
        </Text>
      </View>
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.accent, opacity: busy ? 0.7 : 1 }]}
          onPress={handleExport}
          disabled={busy}
          activeOpacity={0.8}
        >
          {exporting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnText}>💾 Sao lưu JSON</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            styles.restoreBtn,
            { borderColor: theme.accent, backgroundColor: theme.card, opacity: busy ? 0.7 : 1 },
          ]}
          onPress={handleRestore}
          disabled={busy}
          activeOpacity={0.8}
        >
          {restoring ? (
            <ActivityIndicator color={theme.accent} size="small" />
          ) : (
            <Text style={[styles.btnText, { color: theme.accent }]}>📥 Phục hồi JSON</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  header: {
    marginBottom: 10,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  desc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreBtn: {
    borderWidth: 1.5,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12.5,
  },
});
