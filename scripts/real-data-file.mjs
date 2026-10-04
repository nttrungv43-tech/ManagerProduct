// scripts/real-data-file.mjs
// Tìm file packing list thật trong `src/data/` để các script test kiểm chứng trên dữ liệu thật.
//
// ⚠️ Vì sao có helper: tên file nguồn đã đổi theo thời gian (`packing_data.json` → `Dmac.json`).
// Trước đây mỗi script tự `existsSync('…/packing_data.json')`; khi file đổi tên, các nhánh test
// đó **âm thầm bị bỏ qua** mà `npm test` vẫn xanh ⇒ mất phủ test mà không ai biết.
// Helper này thử lần lượt nhiều tên và **báo cáo tên file đã dùng** để còn lỡ sót thì thấy ngay.

import fs from 'node:fs';
import path from 'node:path';

/** Các tên file nguồn được chấp nhận, theo thứ tự ưu tiên. */
export const REAL_FILE_CANDIDATES = ['packing_data.json', 'Dmac.json'];

/**
 * @param {string} fromDir `import.meta.dirname` của script gọi (để không đoán đường dẫn).
 * @returns {{path: string|null, name: string|null, tried: string[]}}
 */
export function findRealDataFile(fromDir) {
  const tried = [];
  for (const name of REAL_FILE_CANDIDATES) {
    const p = path.resolve(fromDir, '../src/data', name);
    tried.push(name);
    if (fs.existsSync(p)) return { path: p, name, tried };
  }
  return { path: null, name: null, tried };
}

/** Cảnh báo một lần khi không tìm thấy file thật, để không bỏ qua phép kiểm âm thầm. */
export function warnMissingRealData(real) {
  console.error(
    `    ⚠ KHÔNG tìm thấy file thật (đã thử: ${real.tried.join(', ')}) — bỏ qua phần test này.`
  );
}