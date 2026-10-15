// src/components/DefectBadges.js
// Hiển thị huy hiệu loại hàng lỗi (Thẻ đỏ, Thẻ vàng, Rách bọc) trực quan, có màu sắc chuẩn.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DEFECT_META, normalizeDefectTypes, formatDefectCount, getDefectColor } from '@/utils/defectFormat';

export { DEFECT_META, normalizeDefectTypes, formatDefectCount, getDefectColor };

/**
 * Component hiển thị một huy hiệu loại lỗi riêng lẻ.
 */
export function DefectBadge({ typeKey, theme, size = 'sm' }) {
  const meta = DEFECT_META[typeKey];
  if (!meta) return null;

  const isDark = theme?.bg === '#1b1712';
  const isMini = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        isMini ? styles.badgeSm : styles.badgeMd,
        {
          backgroundColor: isDark ? meta.darkBg : meta.bg,
          borderColor: isDark ? meta.darkBorder : meta.border,
        },
      ]}
    >
      <View
        style={[
          styles.dot,
          isMini ? styles.dotSm : styles.dotMd,
          { backgroundColor: meta.color },
        ]}
      />
      <Text
        style={[
          styles.badgeTxt,
          isMini ? styles.badgeTxtSm : styles.badgeTxtMd,
          { color: meta.color },
        ]}
      >
        {meta.label}
      </Text>
    </View>
  );
}

/**
 * Component hiển thị danh sách các huy hiệu loại lỗi theo hàng ngang.
 */
export default function DefectBadgeList({ types, theme, size = 'sm', style = null }) {
  const validTypes = normalizeDefectTypes(types);
  if (validTypes.length === 0) return null;

  return (
    <View style={[styles.listWrap, style]}>
      {validTypes.map(key => (
        <DefectBadge key={key} typeKey={key} theme={theme} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  listWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  badgeMd: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: {
    borderRadius: 999,
  },
  dotSm: {
    width: 5,
    height: 5,
    marginRight: 4,
  },
  dotMd: {
    width: 6,
    height: 6,
    marginRight: 5,
  },
  badgeTxt: {
    fontWeight: '700',
  },
  badgeTxtSm: {
    fontSize: 10.5,
    lineHeight: 13,
  },
  badgeTxtMd: {
    fontSize: 12,
    lineHeight: 15,
  },
});
