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

> **FEAT-10 đã đổi định dạng:** khoá theo **mã hàng** thay vì chỉ số. Bảng dưới là định dạng **hiện hành**.
> Định dạng cũ (`${cid}-${no}-${idx}`) chỉ còn trong DB chưa nâng cấp; migration v2 chuyển sang định dạng mới.

| Loại kiện | Key | Ví dụ |
|---|---|---|
| Kiện 1 loại hàng | `` `${containerId}-${palletNo}` `` | `'c1-3'` |
| Từng loại trong kiện nhiều loại | `` `${containerId}-${palletNo}-${ntk}` `` | `'c1-2-106160'`, `'c1-2-1063022'` |

Dùng `ntk` (định danh tự nhiên) nên trạng thái tick **không bị mất** khi thêm/xoá/đổi thứ tự dòng hàng trong kiện. Hàm dựng khoá: `palletKey()` trong `src/utils/palletKey.js`; chuyển đổi khi đổi thành phần kiện: `remapPalletStatus()`.

Khi import packing list, `containerId` (ví dụ `HFMU2620080`) thay thế `c1`/`c2`/`c3`. Chúng không xung đột trong cùng batch vì mỗi batch chỉ dùng một nguồn (seed HOẶC imported).

---

## §5.3 Quan hệ và vòng đời batch

- Luôn có **đúng một** `order_batches` với `status='active'` (INV-B1).
- `entries`, `items`, `pallet_status` đều gắn `order_batch_id`.
- "Hoàn tất" **không copy dữ liệu**: chỉ `UPDATE` → `archived`, `INSERT` batch mới + nạp `seedItems`.
- Lịch sử truy vấn **toàn bộ** `entries` của mọi batch.

---

## §5.4 Nguồn dữ liệu kiểm tra hạn mức đơn đặt hàng (FEAT-09)

Kiểm tra hợp lệ **không cần bảng/cột/index mới** — dùng hai cột đã có:

| Nhu cầu | Nguồn | Ghi chú |
|---|---|---|
| Hạn mức (đơn đặt hàng) | `items.target` cho `ntk` trong `order_batch_id` đang `active` | Nguồn duy nhất. Không thêm cột hạn mức riêng |
| Đã sản xuất | `SUM(entries.qty)` cùng `order_batch_id` | Phải **trừ** dòng đang sửa (`id = excludeEntryId`) khi kiểm tra AC-ITEM-18 |
| Phạm vi | Chỉ batch `active` | Batch `archived` không sửa được từ UI (INV-B2) |

Quy tắc: `SUM(entries.qty) ≤ items.target` cho mọi `ntk` khi `items.target > 0`.
- `items.target = 0` hoặc NULL ⇒ `hasLimit = false`, **không** áp dụng giới hạn.
- `defect_qty` **không** tính vào hạn mức (hàng lỗi nằm trong tổng đã sản xuất).
- Dữ liệu `entries` **đã tồn tại** không được kiểm tra lại và không bị tự sửa. DB có thể ở trạng thái "vượt" hạn mức sau khi `importItemsFromJson` nạp `target` mới nhỏ hơn — đây là trạng thái được chấp nhận.
- Truy vấn kiểm tra dùng index `idx_entries_ntk(ntk, order_batch_id)`.

---

## §5.5 Mô hình dữ liệu sửa tay sản phẩm & kiện (FEAT-10)

> Chi tiết: [`features/FEAT-10-edit-items-pallets.md`](features/FEAT-10-edit-items-pallets.md).

### §5.5.1 Không cần bảng/cột mới

| Đối tượng | Thay đổi schema? | Cách thực hiện |
|---|---|---|
| `items` | ❌ | `INSERT` / `UPDATE` / `DELETE` trên PK `(ntk, order_batch_id)`; không thêm cột |
| `container_data` | ❌ | Sửa **tại chỗ** JSON `data` (read‑modify‑write) trong transaction |
| `order_batches.total_target`, `pallets_total` | ❌ | Tính lại sau mỗi thay đổi |
| `pallet_status` | ⚠️ xem §5.5.2 | Có thể phải đổi giá trị `key` + sửa PK (BUG-01) |

### §5.5.2 Định dạng key pallet — **đã chọn PA A** (khóa theo `ntk`)

`INV-D4` (§5.2) coi định dạng key là **BẤT BIẾN**. Hiện tại:

| Loại kiện | Key hiện tại | Vấn đề khi sửa tay |
|---|---|---|
| 1 loại hàng | `` `${cid}-${no}` `` | Thêm dòng thứ 2 ⇒ đổi dạng khoá ⇒ **mất tick** |
| Nhiều loại hàng | `` `${cid}-${no}-${idx}` `` | Xoá dòng giữa ⇒ các dòng sau **dịch chỉ số** ⇒ **mất tick** |

Ba phương án:

| PA | Cách làm | Migration | Đánh giá |
|---|---|---|---|
| **A** ✅ **đã chọn** | Đổi sang `` `${cid}-${no}-${ntk}` `` (kiện 1 loại giữ nguyên dạng cũ) | ✅ Có — gộp vào migration v2 của `BUG-01` | Mọi thao tác về sau an toàn; `ntk` là khóa tự nhiên, không phụ thuộc thứ tự |
| **B** | Giữ khoá theo `idx`, **cấm** thêm/xoá dòng hàng trong kiện | ❌ Không | An toàn cho dữ liệu nhưng **không** giao được "sửa thành phần kiện" |
| **C** | Giữ khoá theo `idx`, di chuyển lại khoá mỗi lần đổi thứ tự | ❌ Không | Phức tạp, dễ sai, khó kiểm thử |

**Khuyến nghị: PA A.** Bắt buộc gộp với migration `BUG-01` (PK `(key, order_batch_id)`) để chỉ nâng cấp DB một lần. Lưu ý: migration phải **đọc `container_data.data` bằng JS** để ánh xạ khoá cũ → mới, nên không còn thuần SQL (xem `FEAT-10` §4.2).

### §5.5.3 Vật chất hoá seed → DB (AC-EDIT-22)

Khi batch chưa có dòng `container_data`, UI đang đọc `containersData` từ `src/data/seed.js`. Lần sửa kiện đầu tiên phải:

1. `INSERT` `container_data` với JSON của seed — **giữ nguyên `id`** `c1`/`c2`/`c3` để các dòng `pallet_status` đang tồn tại (khoá `c1-1`…) vẫn khớp.
2. Rồi mới áp dụng thay đổi của người dùng.
3. Về sau mọi lần đọc/ghi đi qua DB ⇒ dẹp `DEBT-02`/`ADR-06` một phần.

Batch mới sau `finishOrder` vẫn fallback seed (chưa đổi hành vi AC-CONT-07).

### §5.5.3b Hợp đồng xoá mã hàng (FEAT-10, giữ nguyên ở FEAT-11)

| Vấn đề | Xử lý |
|---|---|
| Cột mới / migration | **Không** — `removeItem` chỉ `DELETE` 1 dòng + cập nhật `total_target`, tất cả trong một transaction |
| Mã **đã có nhật ký** (`entries`) | **Chặn** (`ITEM_HAS_ENTRIES`) — bảo vệ INV-D5. Hướng dẫn giảm `target` thay vì xoá |
| Mã **đang có trong kiện** (`container_data`) | **Chặn** (`ITEM_IN_PALLETS`), báo số kiện còn chứa — bảo vệ INV-V2 |
| Batch không phải `active` | Chặn ở tầng UI + `store` luôn lấy `getActiveBatchId()` — bảo vệ INV-B2/V3 |
| Hoàn tác (undo) | **Không có** — xoá là không hoàn tác được |

> **FEAT-11 không đổi hợp đồng này.** Nó chỉ thêm một lối vào cùng hàm `removeItem`. Xem [`features/FEAT-11-delete-item-quick.md`](features/FEAT-11-delete-item-quick.md).

### §5.5.4 Nới bất biến `INV-D1`

`INV-D1` hiện yêu cầu `Σ qty mọi kiện = target` cho từng `ntk`. Khi người dùng tự sửa kiện/target, bất biến này **không còn đúng** theo nghĩa tuyệt đối. Đề xuất (Q7):

- `INV-D1` giữ nguyên giá trị **cho seed tĩnh** (dùng trong unit test §11.2).
- Với dữ liệu sửa tay: **hiển thị cảnh báo lệch**, không chặn.

### §5.5.5 Tính lại tổng

| Tổng | Công thức | Cập nhật khi |
|---|---|---|
| `order_batches.total_target` | `SUM(items.target)` của batch | thêm/sửa/xoá mã hàng, import items |
| `order_batches.pallets_total` | `COUNT(pallets)` của `container_data` | thêm/sửa/xoá kiện, import packing list |

Cả hai phải ghi **cùng transaction** với thay đổi gốc.

---

## §5.6 Dữ liệu dẫn xuất: tổng theo PO (FEAT-12)

> **Không lưu trong DB.** Tính lại từ `items` mỗi lần hiển thị bằng hàm thuần `poSummaries()` (`src/utils/poSummary.js`). Chi tiết: [`features/FEAT-12-po-summary.md`](features/FEAT-12-po-summary.md).

### §5.6.1 Quy tắc gom nhóm

| Trường hợp | Xử lý |
|---|---|
| `po` **không** chứa `+` | Cộng `target` / `produced` / `defect` vào nhóm tên `po` đó |
| `po` **có** `+` (mã thuộc nhiều PO) | **Không** cộng vào PO nào. Tất cả gom vào **một** nhóm `Nhiều PO`, nhãn `Nhiều PO (n mã)` |
| Thứ tự PO khác nhau (`A+B` so với `B+A`) | Cùng vào nhóm `Nhiều PO` — **không** tách thành 2 nhóm |

### §5.6.2 Trường dẫn xuất của mỗi nhóm

`target`, `produced`, `remaining = Σ max(target − produced, 0)`, `defect` (tính sẵn, chưa hiển thị), `itemCount`, `pct = target > 0 ? round(produced / target * 1000) / 10 : 0`

### §5.6.3 Chốt chặn: không cộng trùng (INV-D6)

Vì mã nhiều PO **không** được cộng vào từng PO, ta luôn có:

```
Σ(target của mọi dòng bảng PO) == Σ target của toàn bộ items
```

**Ví dụ seed hiện tại** (chuẩn kiểm thử): `2600168` = 0 · `2600189` = 1.980 · `Nhiều PO (5 mã)` = 6.050 → **tổng 8.030**, khớp `INV-D1`.

> Nếu sau này đổi quy tắc sang "cộng trọn `target` vào mọi PO của mã", tổng sẽ thành 14.080 ≠ 8.030 ⇒ **vi phạm INV-D6**.

---

## §10.1 Phân cấp thay đổi

| Cấp | Loại | Ví dụ | Yêu cầu |
|---|---|---|---|
| **0** | Văn bản/kiểu dáng | Sửa chữ, chỉnh khoảng cách | Checklist nhanh |
| **1** | Thêm mới | Thêm component, hàm query mới | Spec + checklist hồi quy |
| **2** | Thay đổi dữ liệu | Thêm bảng/cột/index | Cấp 1 + migration + kiểm thử nâng cấp |
| **3** | Sửa hành vi đã có | Đổi công thức, đổi flow | Chỉ đạo rõ chủ dự án |

> **FEAT-09 là ngoại lệ cần lưu ý:** thêm hàm mới (Cấp 1) nhưng đồng thời **chặn ghi** vào `entries` — hành vi của `addEntry`/`updateEntry` đang tồn tại thay đổi ⇒ cần chỉ đạo **Cấp 3**. Không có migration.

---

## §10.2 Quy trình migration

> **FEAT-10 đã cài đặt** cơ chế version bằng `PRAGMA user_version` trong `src/db/migrations.js`, gọi từ `getDb()` (`src/db/index.js`) **trước** mọi truy vấn. Cài mới và nâng cấp đều đi cùng một đường: `CREATE TABLE IF NOT EXISTS` (v1) → `PRAGMA user_version = 2` (v2). Cài mới: `pallet_status` rỗng nên v2 không làm gì. Nâng cấp: v2 đọc `pallet_status` cũ và `container_data` (nạp seed tĩnh nếu batch cũ chưa có) để ánh xạ khoá theo `ntk`.

**Bảng sao lưu (đường lùi):** trước khi `DROP TABLE pallet_status`, migration sao lưu nguyên bản cũ vào `pallet_status_bak_v1` (chỉ ghi lần đầu, không đè bản sao cũ). Không xoá sau khi thành công — giữ lại để đối chiếu.

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
