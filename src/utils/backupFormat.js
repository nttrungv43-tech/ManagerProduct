// src/utils/backupFormat.js
// Định dạng sao lưu JSON toàn bộ cơ sở dữ liệu ứng dụng Theo dõi sản xuất.
// Hàm thuần JS, không phụ thuộc React Native, không fs => kiểm thử được bằng node.

export const BACKUP_FORMAT_ID = 'production_tracker_backup';
export const CURRENT_SCHEMA_VERSION = 3;

export const BACKUP_TABLES = [
  'order_batches',
  'pos',
  'order_lines',
  'item_refs',
  'order_line_refs',
  'production_entries',
  'production_defects',
  'production_entry_refs',
  'containers',
  'pallets',
  'pallet_lines',
];

/**
 * Kiểm tra đối tượng có phải plain object không.
 */
function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Tạo tên file sao lưu mặc định theo thời gian cục bộ.
 * Ví dụ: production_tracker_backup_20261009_203500.json
 */
export function generateBackupFilename(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `production_tracker_backup_${yyyy}${MM}${dd}_${hh}${mm}${ss}.json`;
}

/**
 * Đóng gói dữ liệu từ 11 bảng thành payload sao lưu JSON hoàn chỉnh.
 *
 * @param {object} tablesData - Dữ liệu từng bảng
 * @param {string} [appVersion='1.0.0'] - Phiên bản ứng dụng
 */
export function buildBackupPayload(tablesData = {}, appVersion = '1.0.0') {
  const batches = Array.isArray(tablesData.order_batches) ? tablesData.order_batches : [];
  const pos = Array.isArray(tablesData.pos) ? tablesData.pos : [];
  const lines = Array.isArray(tablesData.order_lines) ? tablesData.order_lines : [];
  const itemRefs = Array.isArray(tablesData.item_refs) ? tablesData.item_refs : [];
  const lineRefs = Array.isArray(tablesData.order_line_refs) ? tablesData.order_line_refs : [];
  const entries = Array.isArray(tablesData.production_entries) ? tablesData.production_entries : [];
  const defects = Array.isArray(tablesData.production_defects) ? tablesData.production_defects : [];
  const entryRefs = Array.isArray(tablesData.production_entry_refs) ? tablesData.production_entry_refs : [];
  const containers = Array.isArray(tablesData.containers) ? tablesData.containers : [];
  const pallets = Array.isArray(tablesData.pallets) ? tablesData.pallets : [];
  const palletLines = Array.isArray(tablesData.pallet_lines) ? tablesData.pallet_lines : [];

  const activeBatches = batches.filter(b => b.status === 'active').length;
  const archivedBatches = batches.filter(b => b.status === 'archived').length;

  return {
    format: BACKUP_FORMAT_ID,
    schema_version: CURRENT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    app_version: appVersion,
    metadata: {
      total_batches: batches.length,
      active_batches: activeBatches,
      archived_batches: archivedBatches,
      total_pos: pos.length,
      total_lines: lines.length,
      total_entries: entries.length,
      total_containers: containers.length,
      total_pallets: pallets.length,
      total_pallet_lines: palletLines.length,
    },
    data: {
      order_batches: batches,
      pos,
      order_lines: lines,
      item_refs: itemRefs,
      order_line_refs: lineRefs,
      production_entries: entries,
      production_defects: defects,
      production_entry_refs: entryRefs,
      containers,
      pallets,
      pallet_lines: palletLines,
    },
  };
}

/**
 * Kiểm tra tính hợp lệ của file sao lưu JSON.
 *
 * @param {any} parsed - Dữ liệu JSON đã parse
 * @returns {{ valid: boolean, error?: string, data?: object }}
 */
export function validateBackupPayload(parsed) {
  if (!isPlainObject(parsed)) {
    return { valid: false, error: 'Dữ liệu không phải là đối tượng JSON hợp lệ.' };
  }

  if (parsed.format !== BACKUP_FORMAT_ID) {
    // Có thể là file format khác hoặc file sao lưu cũ
    if (!parsed.data || typeof parsed.data !== 'object') {
      return { valid: false, error: 'File không phải là file sao lưu của ứng dụng (thiếu mã định dạng).' };
    }
  }

  if (typeof parsed.schema_version !== 'number' || parsed.schema_version < 1) {
    return { valid: false, error: 'Phiên bản schema sao lưu không hợp lệ.' };
  }

  if (!isPlainObject(parsed.data)) {
    return { valid: false, error: 'File sao lưu không chứa phần dữ liệu bảng (data).' };
  }

  // Các bảng cốt lõi bắt buộc phải tồn tại dưới dạng mảng
  const requiredTables = [
    'order_batches',
    'pos',
    'order_lines',
    'production_entries',
    'containers',
    'pallets',
    'pallet_lines',
  ];

  for (const tbl of requiredTables) {
    if (!Array.isArray(parsed.data[tbl])) {
      return { valid: false, error: `Bảng dữ liệu "${tbl}" bị thiếu hoặc không đúng định dạng danh sách.` };
    }
  }

  // Làm sạch và gán giá trị mặc định cho các bảng phụ nếu thiếu trong bản sao lưu cũ
  const sanitizedData = {
    order_batches: parsed.data.order_batches,
    pos: parsed.data.pos,
    order_lines: parsed.data.order_lines,
    item_refs: Array.isArray(parsed.data.item_refs) ? parsed.data.item_refs : [],
    order_line_refs: Array.isArray(parsed.data.order_line_refs) ? parsed.data.order_line_refs : [],
    production_entries: parsed.data.production_entries,
    production_defects: Array.isArray(parsed.data.production_defects) ? parsed.data.production_defects : [],
    production_entry_refs: Array.isArray(parsed.data.production_entry_refs) ? parsed.data.production_entry_refs : [],
    containers: parsed.data.containers,
    pallets: parsed.data.pallets,
    pallet_lines: parsed.data.pallet_lines,
  };

  return { valid: true, data: sanitizedData };
}

/**
 * Định dạng tóm tắt nội dung file sao lưu để hiển thị xác nhận cho người dùng.
 *
 * @param {object} parsed - Dữ liệu JSON sao lưu
 * @returns {string}
 */
export function formatBackupSummary(parsed) {
  const meta = parsed?.metadata || {};
  const data = parsed?.data || {};

  const totalBatches = meta.total_batches ?? data.order_batches?.length ?? 0;
  const activeBatches = meta.active_batches ?? (data.order_batches || []).filter(b => b.status === 'active').length;
  const archivedBatches = meta.archived_batches ?? (data.order_batches || []).filter(b => b.status === 'archived').length;
  const totalPos = meta.total_pos ?? data.pos?.length ?? 0;
  const totalLines = meta.total_lines ?? data.order_lines?.length ?? 0;
  const totalEntries = meta.total_entries ?? data.production_entries?.length ?? 0;
  const totalContainers = meta.total_containers ?? data.containers?.length ?? 0;
  const totalPallets = meta.total_pallets ?? data.pallets?.length ?? 0;

  let exportDate = 'Không rõ';
  if (parsed?.exported_at) {
    try {
      const d = new Date(parsed.exported_at);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        exportDate = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    } catch {
      // ignore
    }
  }

  return [
    `• Thời gian sao lưu: ${exportDate}`,
    `• Đơn hàng: ${totalBatches} (${activeBatches} đang sản xuất, ${archivedBatches} lưu trữ)`,
    `• Mã PO: ${totalPos}`,
    `• Dòng mã hàng: ${totalLines}`,
    `• Nhật ký sản xuất: ${totalEntries} lượt`,
    `• Vận chuyển: ${totalContainers} container, ${totalPallets} kiện`,
  ].join('\n');
}
