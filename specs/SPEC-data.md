# SPEC-DATA — Mô hình dữ liệu & Migration

> **Từ SPEC.md §5, §10.1-10.2** — [Quay lại SPEC.md](SPEC.md) | [SPEC-rules.md](SPEC-rules.md) | [SPEC-api.md](SPEC-api.md)

---

## §5.1 Bảng (schema baseline v1)

**`order_batches`**: một đơn hàng/chu kỳ làm việc.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `status` | TEXT NOT NULL DEFAULT `'active'` | `'active'` hoặc `'archived'` |
| `finished_date` | TEXT | `YYYY-MM-DD`, chỉ có khi archived |
| `total_target`, `total_produced`, `total_defect` | INTEGER | Số tổng, chốt lúc hoàn tất |
| `pallets_done`, `pallets_total` | INTEGER | Chốt lúc hoàn tất |

**`items`**: mã hàng theo từng batch. PK `(ntk, order_batch_id)`. Cột: `ntk`, `po`, `target`, `order_batch_id`.

**`entries`**: nhật ký sản xuất.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `ntk` | TEXT NOT NULL | |
| `order_batch_id` | INTEGER NOT NULL | |
| `date` | TEXT NOT NULL | `YYYY-MM-DD` |
| `qty` | INTEGER NOT NULL DEFAULT 0 | |
| `line` | TEXT DEFAULT `'manual'` | `manual` hoặc `auto` |
| `defect_qty` | INTEGER DEFAULT 0 | |
| `defect_types` | TEXT DEFAULT `''` | Cách nhau dấu phẩy, ví dụ `'yellow,tear'` |

Index: `idx_entries_date(date)`, `idx_entries_ntk(ntk, order_batch_id)`, `idx_entries_batch(order_batch_id)`.

**`pallet_status`**: trạng thái đóng kiện.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `key` | TEXT PRIMARY KEY | ⚠️ Xem BUG-01. Định dạng key ở §5.2 |
| `order_batch_id` | INTEGER NOT NULL | |
| `done` | INTEGER DEFAULT 0 | 0/1 |

**`container_data`**: container/pallet structure từ packing list (Cấp 2, FEAT-08 phase 2).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `batch_id` | INTEGER PK | 1–1 với `order_batches(id)` (soft FK) |
| `data` | TEXT NOT NULL | JSON: mảng containers cùng format `containersData` |
| `created_at` | TEXT NOT NULL | `YYYY-MM-DD` |

Mỗi batch có **0 hoặc 1** hàng. `finishOrder` không xóa. Import mới → `INSERT OR REPLACE`. Batch mới → fallback seed.

---

## §5.2 Định dạng key pallet (BẤT BIẾN)

| Loại kiện | Key | Ví dụ |
|---|---|---|
| Kiện 1 loại hàng | `` `${containerId}-${palletNo}` `` | `'c1-3'` |
| Từng loại trong kiện nhiều loại | `` `${containerId}-${palletNo}-${itemIndex}` `` | `'c1-2-0'`, `'c1-2-1'` |

`itemIndex` là chỉ số (từ 0) trong `pallet.items`. **Đổi thứ tự phần tử trong `seed.js` sẽ làm lệch dữ liệu.**

Khi import packing list, `containerId` (ví dụ `HFMU2620080`) thay thế `c1`/`c2`/`c3`. Chúng không xung đột trong cùng batch vì mỗi batch chỉ dùng một nguồn (seed HOẶC imported).

---

## §5.3 Quan hệ và vòng đời batch

- Luôn có **đúng một** `order_batches` với `status='active'` (INV-B1).
- `entries`, `items`, `pallet_status` đều gắn `order_batch_id`.
- "Hoàn tất" **không copy dữ liệu**: chỉ `UPDATE` → `archived`, `INSERT` batch mới + nạp `seedItems`.
- Lịch sử truy vấn **toàn bộ** `entries` của mọi batch.

---

## §10.1 Phân cấp thay đổi

| Cấp | Loại | Ví dụ | Yêu cầu |
|---|---|---|---|
| **0** | Văn bản/kiểu dáng | Sửa chữ, chỉnh khoảng cách | Checklist nhanh |
| **1** | Thêm mới | Thêm component, hàm query mới | Spec + checklist hồi quy |
| **2** | Thay đổi dữ liệu | Thêm bảng/cột/index | Cấp 1 + migration + kiểm thử nâng cấp |
| **3** | Sửa hành vi đã có | Đổi công thức, đổi flow | Chỉ đạo rõ chủ dự án |

---

## §10.2 Quy trình migration

Hiện tại DB dùng `CREATE TABLE IF NOT EXISTS` và **chưa có version**. Bước đầu tiên (một lần, Cấp 2) là thêm cơ chế migration.

```js
// src/db/migrations.js  (🟢 file mới)
import { CREATE_TABLES_SQL } from './schema';

export const MIGRATIONS = [
  {
    version: 1, // baseline: schema hiện tại (IF NOT EXISTS)
    up: async (db) => { await db.execAsync(CREATE_TABLES_SQL_WITHOUT_PRAGMA); },
  },
  {
    version: 2, // BUG-01: PRIMARY KEY (key, order_batch_id)
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE pallet_status_new (
          key TEXT NOT NULL, order_batch_id INTEGER NOT NULL,
          done INTEGER DEFAULT 0, PRIMARY KEY (key, order_batch_id)
        );
        INSERT INTO pallet_status_new (key, order_batch_id, done)
          SELECT key, order_batch_id, done FROM pallet_status;
        DROP TABLE pallet_status;
        ALTER TABLE pallet_status_new RENAME TO pallet_status;
        CREATE INDEX IF NOT EXISTS idx_pallet_batch ON pallet_status(order_batch_id);
      `);
    },
  },
];

export async function runMigrations(db) {
  const row = await db.getFirstAsync('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      await db.withTransactionAsync(async () => {
        await m.up(db);
        await db.execAsync(`PRAGMA user_version = ${m.version}`);
      });
    }
  }
}
```

**Khi thêm bảng/cột mới (Cấp 2):**
- Dùng `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` trong `CREATE_TABLES_SQL`
- Tạo migration tương ứng trong `MIGRATIONS` (nếu chuyển sang migration system)
- `PRAGMA journal_mode = WAL` chạy riêng trong `getDb()` trước migration
