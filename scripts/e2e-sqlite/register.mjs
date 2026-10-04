// scripts/e2e-sqlite/register.mjs
// Cổng `expo-sqlite` → **SQLite thật** của Node (`node:sqlite`) để chạy `src/db/queries.js`
// nguyên bản (không stub SQL, không pattern-match) với dữ liệu `src/data/Dmac.json` thật.
//
// Vì sao cần: `scripts/db-init-e2e/` chỉ mô phỏng *đúng những câu SQL mà tầng khởi tạo dùng*,
// nên nó **không** kiểm được phần quan trọng nhất sau khi thiết kế lại: `importPackingV1`,
// `fetchItemsWithStats`, `fetchPoSummaries`, `addEntry`, `finishOrder`… Chỉ SQLite thật mới bắt
// được lỗi SQL, lỗi FK/CHECK và sai số tổng.
//
// Khác `db-init-e2e`: stub này **không** mô phỏng lỗi, mọi câu SQL đều phải đúng.
import { register } from 'node:module';
register('./hook.mjs', import.meta.url);