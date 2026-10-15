// src/utils/defectFormat.js
// Định nghĩa và chuẩn hoá thông tin loại sản phẩm lỗi (Thẻ đỏ, Thẻ vàng, Rách bọc).

export const DEFECT_META = {
  red: {
    key: 'red',
    label: 'Thẻ đỏ',
    color: '#E53935',
    bg: '#FEE2E2',
    border: '#FCA5A5',
    darkBg: 'rgba(229, 57, 53, 0.22)',
    darkBorder: 'rgba(229, 57, 53, 0.45)',
  },
  yellow: {
    key: 'yellow',
    label: 'Thẻ vàng',
    color: '#D97706',
    bg: '#FEF3C7',
    border: '#FCD34D',
    darkBg: 'rgba(217, 119, 6, 0.22)',
    darkBorder: 'rgba(217, 119, 6, 0.45)',
  },
  tear: {
    key: 'tear',
    label: 'Rách bọc',
    color: '#475569',
    bg: '#F1F5F9',
    border: '#CBD5E1',
    darkBg: 'rgba(100, 116, 139, 0.25)',
    darkBorder: 'rgba(100, 116, 139, 0.45)',
  },
};

/**
 * Chuẩn hoá danh sách loại lỗi thành mảng các key hợp lệ ('red', 'yellow', 'tear').
 * Luôn sắp xếp theo thứ tự quy ước: Thẻ đỏ -> Thẻ vàng -> Rách bọc.
 */
export function normalizeDefectTypes(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(',');
  const valid = [];
  const seen = new Set();
  for (const item of arr) {
    const key = String(item ?? '').trim().toLowerCase();
    if (DEFECT_META[key] && !seen.has(key)) {
      seen.add(key);
      valid.push(key);
    }
  }
  const order = { red: 1, yellow: 2, tear: 3 };
  return valid.sort((a, b) => (order[a] || 99) - (order[b] || 99));
}

/**
 * Định dạng chuỗi tóm tắt số lượng lỗi (VD: "5 pcs, 1 thùng").
 */
export function formatDefectCount(defectQty, defectBoxQty) {
  const parts = [];
  const dq = Number(defectQty) || 0;
  const dbq = Number(defectBoxQty) || 0;
  if (dq > 0) parts.push(`${dq.toLocaleString('vi-VN')} pcs`);
  if (dbq > 0) parts.push(`${dbq.toLocaleString('vi-VN')} thùng`);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Lấy màu đại diện cho danh sách loại lỗi để tô màu text/icon:
 * - Có Thẻ đỏ -> màu đỏ (#E53935)
 * - Chỉ có Thẻ vàng -> màu vàng cam (#D97706)
 * - Chỉ có Rách bọc -> màu slate (#475569)
 * - Không chọn loại lỗi hoặc rỗng -> màu fallback (thường là theme.warn hoặc theme.sub)
 */
export function getDefectColor(types, fallbackColor = '#D97706') {
  const norm = normalizeDefectTypes(types);
  if (norm.includes('red')) return DEFECT_META.red.color;
  if (norm.includes('yellow')) return DEFECT_META.yellow.color;
  if (norm.includes('tear')) return DEFECT_META.tear.color;
  return fallbackColor;
}
