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

**`items`**: mã hàng theo từng batch. PK `(ntk, order_batch_id)`. Cột: `ntk`, `po`, `target`, `order_batch_id`,
và **4 cột bổ sung từ migration v3 (FEAT-17)** — xem §5.8.

**`item_po`**: số lượng **riêng của từng PO** (migration v4, FEAT-18). PK `(ntk, po, order_batch_id)`.
Cột: `ntk`, `po` (một PO đã `TRIM`, không chứa `+`), `qty` (nullable = chưa biết), `order_batch_id`.
Index: `idx_item_po_batch(order_batch_id, po)`. Chi tiết §5.6b.

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
| `po` | TEXT nullable | **FEAT-20** (migration v5). PO của nhật ký này. `NULL` = chưa gắn PO (mọi dữ liệu cũ) |

Index: `idx_entries_date(date)`, `idx_entries_ntk(ntk, order_batch_id)`, `idx_entries_batch(order_batch_id)`,
`idx_entries_ntk_po(ntk, order_batch_id, po)` (FEAT-20).

> **FEAT-20 — vì sao `po` không có FK và không được suy đoán:** `items.po` chỉ lưu **tập** PO nối bằng
> `+` (`'2922+2923'`), còn `items.target` là **tổng** ⇒ không thể biết mã đó chia bao nhiêu cho mỗi PO.
> PO của một nhật ký chỉ biết được khi **người dùng nhập**. Vì vậy:
> - Cột **nullable**, không `DEFAULT`, không backfill: nhật ký cũ giữ `NULL` (chưa gán) thay vì bịa PO.
> - Không khai báo FK vì `(ntk, po)` không phải khoá của `entries`; quan hệ đúng là `(ntk, po)` của
>   `item_po` (FEAT-18) và được kiểm bằng code (`ENTRY_PO_INVALID`) để báo lỗi rõ thay vì FK lạ.
> - Bất biến INV-D8: mỗi dòng nhật ký thuộc **nhiều nhất một** PO ⇒ `Σ` cột "Đã sản xuất" của bảng
>   "Tổng theo PO" **không bao giờ vượt** `Σ entries.qty`. Số chưa gắn PO được báo riêng, không gán
>   tự ý vào PO nào.

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

Mỗi batch có **0 hoặc 1** hàng. `finishOrder` không xóa. Import mới → `INSERT OR REPLACE`. Batch mới sau `finishOrder` → `'[]'` (trắng có chủ ý, **không** fallback seed — FEAT-14).

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
- "Hoàn tất" **không copy dữ liệu**: chỉ `UPDATE` → `archived`, `INSERT` batch mới **rỗng** (`total_target = 0`, `pallets_total = 0`, `container_data = '[]'`, không `items`) — `FEAT-14`.
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
3. Về sau mọi lần đọc/ghi đều đi qua DB ⇒ dẹp `DEBT-02`/`ADR-06` một phần.

> **FEAT-14 (v1.8):** `finishOrder` **không** tạo batch mới thiếu hàng `container_data` nữa — batch mới được ghi
> sẵn `container_data = '[]'`. Vì vậy fallback seed ở §5.5.3 **chỉ còn áp dụng cho lần chạy đầu**
> (`ensureActiveBatch`, `AC-APP-02`) và cho batch cũ tạo trước FEAT-14.

**Quy ước "trống có chủ ý" (`FEAT-14`):** `container_data.data = '[]'` = batch **không có container**
(đơn mới sau khi hoàn tất) — phân biệt với **chưa có hàng `container_data`** (mới fallback seed).
Nhờ đó `fetchContainerData` trả `[]` và UI hiện empty state; import packing list ghi đè bằng
`INSERT OR REPLACE`. Không cần cột/cờ mới ⇒ **không migration**.

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

> ⚠️ **Đã bị FEAT-18 cập nhật** (§5.6b): `items` **không** đủ dữ liệu để tách số lượng của từng PO khi
> mã thuộc nhiều PO. Từ migration v4, số lượng từng PO lấy từ bảng `item_po`. Phần này giữ lại để mô tả
> **hành vi cũ**, áp dụng cho mã chưa có dòng trong `item_po` (AC-PO-07).
>
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

## §5.6b Bảng `item_po` — số lượng **riêng của từng PO** (FEAT-18)

> Chi tiết: [`features/FEAT-18-po-per-code.md`](features/FEAT-18-po-per-code.md).
> **Cái này đã thay đổi §5.6.1/§5.6.3** — từ FEAT-18, "tổng theo PO" **không còn chỉ dẫn xuất
> từ `items`**: mã thuộc nhiều PO đã có số lượng riêng cho từng PO.

### §5.6b.1 Vấn đề `items` không giải được

`items.po` chỉ lưu **tập** PO nối bằng `+` (`'2924+2929'`), còn `items.target` là **tổng** của
cả tập. Không có đường để biết `2924` chiếm bao nhiêu trong tổng đó. Hậu quả đo được trên
`src/data/Dmac.json`: PO `2924` và `2929` không còn mã nào thuộc riêng ⇒ cột `Tổng` của bảng PO
bằng **0** dù đơn có 64 mã / 51.568 pcs.

### §5.6b.2 Schema

```sql
CREATE TABLE IF NOT EXISTS item_po (
  ntk TEXT NOT NULL,
  po TEXT NOT NULL,
  qty INTEGER,
  order_batch_id INTEGER NOT NULL,
  PRIMARY KEY (ntk, po, order_batch_id)
);
CREATE INDEX IF NOT EXISTS idx_item_po_batch ON item_po(order_batch_id, po);
```

| Cột | Ràng buộc | Ý nghĩa |
|---|---|---|
| `ntk` | `NOT NULL`, PK | mã hàng |
| `po` | `NOT NULL`, PK | **một** PO, đã `TRIM()`, **không** chứa `+` |
| `qty` | nullable | số lượng **của riêng PO này**; `NULL` = chưa biết (mã đa PO chưa tách được) |
| `order_batch_id` | `NOT NULL`, PK | thuộc đơn nào — cùng mã ở 2 đơn là 2 bộ dòng độc lập |

> PK gồm `order_batch_id` vì `items` cũng khoá theo `(ntk, order_batch_id)`: một mã có thể xuất
> hiện ở nhiều đơn với số lượng khác nhau. Index `(order_batch_id, po)` phục vụ truy vấn
> "tổng theo PO" của một đơn.

### §5.6b.3 Migration v4 — loại **bổ sung**

`db/schema.js` 🔒 **không** sửa: cài mới chạy v1 → v2 → v3 → v4 nên cùng đường với nâng cấp.

Backfill chỉ làm được với mã thuộc **một** PO (`qty = target` chính xác):

```sql
INSERT OR IGNORE INTO item_po (ntk, po, qty, order_batch_id)
SELECT ntk, TRIM(po), target, order_batch_id
FROM items
WHERE po IS NOT NULL AND TRIM(po) <> '' AND INSTR(po, '+') = 0
```

| Trường hợp | Kết quả backfill | Lý do |
|---|---|---|
| `po = '2923'` | 1 dòng, `qty = target` | suy ra chính xác |
| `po = ' 2922 '` | 1 dòng, `po = '2922'` | `TRIM()` chuẩn hoá khoảng trắng thừa |
| `po = '2924+2929'` | **không** có dòng | không tách được ⇒ UI rơi về hành vi cũ (AC-PO-07) |
| `po = ''` hoặc `NULL` | **không** có dòng | không phải PO hợp lệ |

`CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE` ⇒ chạy lại v4 bao nhiêu lần cũng không lỗi, không
nhân bản dòng. Đã kiểm bằng **SQLite thật** (`scripts/test-migrations.mjs`).

### §5.6b.4 Bất biến mới (thay thế cách hiểu cũ ở §5.6.3)

```
Σ(qty của mọi dòng item_po của 1 batch) == Σ target của items của batch đó
```

Tức PO nào **không** có dòng nào thì `Tổng` của PO đó bằng `0` — **không** phải `NULL`, và bảng PO
vẫn cộng đúng tổng toàn đơn. Đây là hệ quả bắt buộc, không phải lỗi (giống AC-DEL-09).

## §5.7 Dữ liệu: xoá mã hàng theo PO (FEAT-13)

> Chi tiết: [`features/FEAT-13-delete-items-by-po.md`](features/FEAT-13-delete-items-by-po.md).

### §5.7.1 Không cần bảng/cột/index mới

| Đối tượng | Schema? | Cách thực hiện |
|---|---|---|
| `items` | ❌ | `DELETE ... WHERE order_batch_id = ? AND ntk IN (?,…)` trên PK `(ntk, order_batch_id)` sẵn có |
| `order_batches.total_target` | ❌ | `recalcBatchTargetInTx()` — **cùng transaction** (giống §5.5.5) |
| `entries` | ❌ | **không** đụng — mã có nhật ký bị chặn xoá ⇒ không cần `DELETE entries` (INV-D5) |
| `container_data`, `pallet_status` | ❌ | **không** đụng — mã còn trong kiện bị chặn xoá ⇒ **không cần** remap khoá pallet (INV-P1 không liên quan) |

⇒ **Không migration.** Dữ liệu cũ không bị ảnh hưởng: mọi thao tác xoá đều kiểm tra trước.

### §5.7.2 Quy tắc lọc mã theo PO

- Khớp PO khi `splitPo(items.po)` **chứa** PO đang chọn — giống hệt `allPOs()`/`filteredItems()` (AC-ITEM-13).
- **Không** lọc bằng SQL `LIKE '%PO%'`: `+` là ký tự đại diện của `LIKE` ⇒ dễ khớp sai.
- PO truyền vào phải là **một PO đơn lẻ**; chuỗi có `+` trả `INVALID_PO`.

### §5.7.3 Tính lại tổng

| Tổng | Công thức | Ghi khi |
|---|---|---|
| `order_batches.total_target` | `SUM(items.target)` của batch | trong **cùng transaction** với `DELETE` |

Nhờ vậy `Σ` bảng `Tổng theo PO` (INV-D6) và ô `Kế hoạch` (AC-ITEM-01) luôn khớp sau mỗi lần xoá.

---

## §5.8 Dữ liệu mỗi mã hàng từ packing list `schema_version 1` (FEAT-17)

> Chi tiết: [`features/FEAT-17-import-packing-v1.md`](features/FEAT-17-import-packing-v1.md).

Nguồn `shipments[].item_summary[]` có 4 trường mà định dạng phẳng (`總表`) **không** mang được.
Định dạng mới được import **trực tiếp**, nên lưu 4 trường này vào `items`:

| Cột | Kiểu | Nguồn | Quy tắc |
|---|---|---|---|
| `nw_kg` | REAL NULL | `item_summary[].nw_kg` | Σ theo mã, làm tròn **1** chữ số thập phân |
| `gw_kg` | REAL NULL | `item_summary[].gw_kg` | Σ theo mã, làm tròn **1** chữ số thập phân |
| `volume_cbm` | REAL NULL | `item_summary[].volume_cbm` | Σ theo mã, làm tròn **2** chữ số thập phân |
| `package_count` | INTEGER NULL | `item_summary[].package_count` | Σ theo mã |

### §5.8.1 Ràng buộc

| ID | Ràng buộc |
|---|---|
| **INV-I1** | `NULL` = **không có dữ liệu** (mã thêm tay, hoặc import định dạng cũ). UI **ẩn** dòng thông tin — **không** hiển thị `0` |
| **INV-I2** | 4 cột này là **chỉ đọc** — nguồn sự thật là packing list. `addItem`/`updateItem`/`ItemEditSheet` **không** sửa chúng |
| **INV-I3** | Σ của mỗi cột mới phải khớp `Σ item_summary` của nguồn cho mã đó (đã kiểm chứng nguồn: 174/174 dòng khớp với tổng từ `packages[].items[]`) |
| **INV-I4** | Import định dạng mới là **all-or-nothing**: có `problem` chặn ⇒ **0** lệnh ghi DB |

### §5.8.2 Migration v3

```js
// src/db/migrations.js — thêm SAU v2. Không sửa migration v1/v2 đã phát hành (nguyên tắc #2).
{
  version: 3,
  up: async (db) => {
    // BUGFIX-08: `ADD COLUMN` không idempotent (chạy lại ⇒ "duplicate column name"), và
    // `ALTER` không nằm trong transaction nên app bị tắt giữa lúc chạy có thể thêm được một
    // phần cột. `ensureItemMetricColumns` đọc `PRAGMA table_info(items)` và chỉ thêm còn thiếu.
    const result = await ensureItemMetricColumns(db);
    // Vá chưa xong ⇒ **không** đóng dấu `user_version = 3` (số phiên bản phải phản ánh
    // schema thật — nếu không, v3 sẽ không bao giờ chạy lại ⇒ `no such column` vĩnh viễn).
    if (!result.ok) throw new Error(`… còn thiếu: ${result.missing.join(', ')}`);
  },
}
```

| Tiêu chí | Kết luận |
|---|---|
| Loại migration | **Bổ sung** — không `DROP`, không `ALTER` phá huỷ, không đổi PK/index, không cần bảng tạm |
| `db/schema.js` 🔒 | **không** sửa `CREATE_TABLES_SQL`: cài mới chạy v1 → v2 → v3 nên cùng đường với nâng cấp |
| DB cũ (`user_version = 2`) | 4 cột mới = `NULL`; mọi dữ liệu cũ nguyên vẹn; app cũ vẫn mở được (chỉ không thấy trường mới) |
| Có breaking change DB? | **Không** |

> **⚠️ `user_version` là ý định, không phải sự thật (BUGFIX-08).** Nếu DB bị đóng dấu `user_version = 3`
> trong khi `ALTER TABLE` chưa từng có hiệu lực (app bị tắt giữa lúc chạy), thì `runMigrations` bỏ qua v3
> **vĩnh viễn** (`3 > 3` là sai) và mọi `SELECT` tới cột mới đều hỏng. Vì vậy `getDb()` gọi thêm
> **schema guard** `ensureItemMetricColumns()` (`src/utils/schemaColumns.js`) **sau** `runMigrations`:
> đọc `PRAGMA table_info(items)`, thêm cột còn thiếu, rồi **đọc lại** `PRAGMA` để xác minh bằng quan sát.
> Guard **không** đọc `user_version`, idempotent, và chỉ `ADD COLUMN` — không đụng dữ liệu.

---

## §5.9 Số hiệu nhà máy (`order_ref`) theo **PO × mã** (FEAT-22)

> Chi tiết: [`features/FEAT-22-order-ref-per-po.md`](features/FEAT-22-order-ref-per-po.md).
> §5.1 và §5.8 mô tả schema **cũ** (FEAT-21 đã viết lại `src/db/schema.js` sang 9 bảng quan hệ mà
> chưa cập nhật lại file spec này). Mục này theo schema **hiện hành**.

### §5.9.1 Vấn đề: `item_refs` không biết ref nào của PO nào

`order_ref` (`packages[].items[].order_ref`) **không thuộc mã hàng** mà thuộc **cặp (PO × mã)**.
Đo trên `src/data/Dmac.json`:

| Đơn vị | Số |
|---|---|
| `(item_code, ref_no)` — khoá của `item_refs` | **55** |
| `(po, item_code, ref_no)` — khoá đúng cho một thẻ | **82** |

15 cặp `(mã, ref)` dùng ở **nhiều PO** (`1072017GF / D580279` ở 6 PO). Nên đọc `item_refs` theo mã sẽ
gắn ref của PO khác vào thẻ: **7/76 thẻ sai**.

### §5.9.2 Schema

```sql
CREATE TABLE IF NOT EXISTS order_line_refs (
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  ref_no        TEXT    NOT NULL,
  target        INTEGER NOT NULL DEFAULT 0 CHECK (target >= 0),
  PRIMARY KEY (order_line_id, ref_no)
);
CREATE INDEX IF NOT EXISTS ix_olrefs_ref ON order_line_refs(ref_no);
```

`SCHEMA_VERSION` 1 → 2. **Không** `ALTER`/`DROP` bảng nào ⇒ `db/index.js` **không** cần cơ chế
`ALTER` (FEAT-21 đã bỏ hẳn `runMigrations`). `CREATE TABLE IF NOT EXISTS` chạy ở **mọi** lần mở app
nên DB đã có dữ liệu nhận tay sẽ có bảng mới mà **không mất gì**.

`item_refs` **giữ nguyên** (55 dòng) — nó vẫn trả lời "mã này có mấy số hiệu" ở tầng mã, chỉ **không
dùng để hiển thị thẻ**.

### §5.9.3 Quy tắc

| ID | Quy tắc |
|---|---|
| **INV-R1** | `Σ target` của mọi ref của một dòng đơn hàng **bằng** `order_lines.target` của dòng đó. Đo trên `Dmac.json`: khớp **76/76**, tổng **25.520** ⇒ tách hạn mức theo ref là dữ liệu thật |
| **INV-R2** | `target` của ref = tổng `qty` của các kiện mang ref đó (`packages[].items[].qty`), **không** chia đều |
| **INV-R3** | Số hiệu là **chỉ đọc** (cùng `INV-I2`): `addItem`/`updateItem`/`ItemEditSheet` không sửa |
| **INV-R4** | Không có ref ⇒ view trả `NULL` ⇒ UI **ẩn** (cùng `INV-I1`). DB cũ chưa nhập lại file nguồn rơi vào trường hợp này — **không** bịa ref |

### §5.9.4 Cột `refs` của view `v_line_progress`

Gộp `ref_no` và `target` vào **một** chuỗi `"ref:target"` rồi `GROUP_CONCAT`:

```sql
(SELECT GROUP_CONCAT(r.ref_no || ':' || r.target) FROM order_line_refs r
   WHERE r.order_line_id = l.id) AS refs
```

> **Vì sao MỘT chuỗi chứ không phải hai cột `ref_nos` + `ref_targets`:** `GROUP_CONCAT` không bảo đảm
> thứ tự, mà `ORDER BY` trong subquery là hành vi **không được tài liệu hoá** của SQLite. Đo thật:
> bản hai subquery cho ra thứ tự **khác nhau** ⇒ `zip` cặp lệch ⇒ ref mang số của ref khác. Gộp một
> chuỗi thì việc ghép cặp là **bản chất của dữ liệu**. Sắp xếp lại ở JS (`utils/refFormat.normalizeRefs`)
> nên tầng SQL không cần bảo đảm thứ tự.

> **FEAT-23 đã bổ sung `ORDER BY`** trong subquery để thứ tự **tất định ở tầng SQL** (đo trên
> `node:sqlite` 3.47.2 là ổn định), và `normalizeRefs`/`normalizeRefProgress` **vẫn** sắp lại lần
> nữa cho chắc — không phụ thuộc hành vi của SQLite.

---

## §5.10 Nhật ký sản xuất gắn **theo số hiệu** (FEAT-23)

> Chi tiết: [`features/FEAT-23-entry-qty-by-ref.md`](features/FEAT-23-entry-qty-by-ref.md).
> Nối tiếp §5.9: `order_line_refs` cho biết **kế hoạch** từng ref; mục này lưu **đã làm** từng ref.

### §5.10.1 Schema

```sql
CREATE TABLE IF NOT EXISTS production_entry_refs (
  entry_id      INTEGER NOT NULL REFERENCES production_entries(id) ON DELETE CASCADE,
  order_line_id INTEGER NOT NULL,
  ref_no        TEXT    NOT NULL,
  FOREIGN KEY (order_line_id, ref_no) REFERENCES order_line_refs(order_line_id, ref_no),
  PRIMARY KEY (entry_id)
);
CREATE INDEX IF NOT EXISTS ix_per_line_ref ON production_entry_refs(order_line_id, ref_no);
```

`SCHEMA_VERSION` 2 → 3. **Không** `ALTER` bảng nào (cùng lý do §5.9.2).

**Vì sao `order_line_id` lặp lại** (suy ra được từ `entry_id` nếu tra 1 bước): để **FK tổng hợp**
`(order_line_id, ref_no)` chặn "gắn nhầm ref của PO khác" **ở tầng DB**, thay vì để JS phải nhớ
kiểm. `order_line_refs` có PK `(order_line_id, ref_no)` nên FK này tham chiếu được (SQLite yêu cầu
cột đích có unique index, PK là unique index).

### §5.10.2 Quy tắc

| ID | Quy tắc |
|---|---|
| **INV-R5** | Với mọi `(order_line_id, ref_no)`: `Σ qty` của các nhật ký gắn ref đó **≤** `order_line_refs.target`. Kiểm ở `queries.js` (`checkRefTarget`), **không** chỉ ở UI — cùng cách `INV-V1` |
| **INV-R6** | `Σ qty` của mọi ref của một dòng đơn hàng **≤** `order_lines.target` của dòng đó. Hệ quả của `INV-R1` + `INV-R5` |
| **INV-R7** | Một mục nhật ký gắn **nhiều nhất một** ref (`PRIMARY KEY (entry_id)`). Nhật ký **không** gắn ref là hợp lệ (không có dòng trong bảng phụ) |
| **INV-R8** | `Σ` mọi nhật ký (có ref hay không) **vẫn** là `produced` của thẻ cha. FEAT-23 **không** tạo số liệu song song — chỉ **gắn nhãn** cho những số đã có |

### §5.10.3 Cột `ref_progress` + `unattributed_produced` của view `v_line_progress`

`ref_progress` gộp `"ref:đã_làm:kế_hoạch"` vào **một** chuỗi (cùng lý do §5.9.4);
`unattributed_produced` = `Σ qty` của các nhật ký **không** gắn ref của dòng đó.

> **Vì sao cần `unattributed_produced`:** nếu chỉ hiện tổng các ref thì `Σ` sẽ lệch với `Đã làm` ở
> thẻ cha mà **không có lý do**. Không gán tự ý nhật ký không ref vào ref nào, và không hiện `0` giả
> (`AC-RF-08`).
>
> Cột này là `0` (không phải `NULL`) khi không có nhật ký nào chưa gắn ref, để UI chỉ cần so `> 0`.

---

## §10.1 Phân cấp thay đổi

| Cấp | Loại | Ví dụ | Yêu cầu |
| **0** | Văn bản/kiểu dáng | Sửa chữ, chỉnh khoảng cách | Checklist nhanh |
| **1** | Thêm mới | Thêm component, hàm query mới | Spec + checklist hồi quy |
| **2** | Thay đổi dữ liệu | Thêm bảng/cột/index | Cấp 1 + migration + kiểm thử nâng cấp |
| **3** | Sửa hành vi đã có | Đổi công thức, đổi flow | Chỉ đạo rõ chủ dự án |

> **FEAT-09 là ngoại lệ cần lưu ý:** thêm hàm mới (Cấp 1) nhưng đồng thời **chặn ghi** vào `entries` — hành vi của `addEntry`/`updateEntry` đang tồn tại thay đổi ⇒ cần chỉ đạo **Cấp 3**. Không có migration.

---

## §10.2 Quy trình migration

> **FEAT-10 đã cài đặt** cơ chế version bằng `PRAGMA user_version` trong `src/db/migrations.js`, gọi từ `getDb()` (`src/db/index.js`) **trước** mọi truy vấn. Cài mới và nâng cấp đều đi cùng một đường: `CREATE TABLE IF NOT EXISTS` (v1) → `PRAGMA user_version = 2` (v2). Cài mới: `pallet_status` rỗng nên v2 không làm gì. Nâng cấp: v2 đọc `pallet_status` cũ và `container_data` (nạp seed tĩnh nếu batch cũ chưa có) để ánh xạ khoá theo `ntk`.

> **v3 (FEAT-17):** bổ sung 4 cột `items` bằng `ALTER TABLE … ADD COLUMN … DEFAULT NULL` — xem §5.8.2.
> Cài mới cũng qua v3, nên **không** sửa `CREATE_TABLES_SQL` (`db/schema.js` 🔒).
> **BUGFIX-08:** thêm **schema guard** chạy **sau** `runMigrations` để xác minh schema thật bằng
> `PRAGMA table_info` và vá phần thiếu — **không** tin `user_version` (xem cảnh báo §5.8.2).

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
