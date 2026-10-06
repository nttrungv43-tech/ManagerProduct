# BUGFIX-23 — App không khởi động: `no such column: order_line_id`

> Lỗi gặp thật trên thiết bị, 2026-10-05, ngay sau FEAT-23.
> Liên quan: [`FEAT-21`](FEAT-21-db-redesign.md) (bỏ hết migration), [`BUGFIX-08`](BUGFIX-08-db-init-race.md) (cùng một lớp lỗi).

---

## 1. Triệu chứng

```
Error: Call to function 'NativeDatabase.execAsync' has been rejected.
→ Caused by: no such column: order_line_id
```

Lỗi ném ra ở `db.execAsync(...)` ngay lúc khởi động ⇒ **app không vào được màn hình chính**.

---

## 2. Nguyên nhân gốc

`CREATE_TABLES_SQL` gồm ~30 câu. `src/db/index.js` chạy **một** `execAsync` cho cả khối, và trong
đó có:

```sql
CREATE TABLE IF NOT EXISTS pallet_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pallet_id     INTEGER NOT NULL REFERENCES pallets(id) ON DELETE CASCADE,
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id) ON DELETE RESTRICT,
  ...
);
CREATE INDEX IF NOT EXISTS ix_plines_line ON pallet_lines(order_line_id);
```

File DB trên máy do **một build trung gian** tạo ra: nó có **đúng tên bảng** của thiết kế mới
(`order_batches`, `pos`, `order_lines`, `production_entries`, `pallets`, `pallet_lines`…) nhưng
`pallet_lines` **chưa có** cột `order_line_id`.

`isLegacyDb()` — hàm quyết định "xoá DB cũ hay không" — chỉ nhìn **tên bảng**:

```js
const hasOldOnly = ['items','item_po','pallet_status','container_data'].some(n => names.has(n));
const missingNew = !names.has('order_lines') || !names.has('pos');
```

⇒ DB đó **không** bị coi là legacy ⇒ **không** xoá ⇒ `CREATE TABLE IF NOT EXISTS` thành **no-op**
(đúng hành vi SQLite: bảng đã tồn tại thì không đụng vào) ⇒ `CREATE INDEX … (order_line_id)` nổ.

**Đây đúng là lớp lỗi BUG-08**: `user_version` khớp (hay tên bảng khớp) nhưng schema thật thì không.
FEAT-21 đã **bỏ hẳn** cơ chế `user_version` nhưng **chưa** thay bằng kiểm *quan sát đầy đủ* — chỉ
kiểm *tên bảng*. Đó là lỗ hổng còn lại.

---

## 3. Sửa

Ba phần, đều theo nguyên tắc sẵn có của dự án: **quan sát schema, không tin số phiên bản**;
**không mất dữ liệu nếu vá được**; **lỗi phải nêu đích danh bảng và cột**.

### 3.1 `REQUIRED_COLUMNS` — nguồn sự thật duy nhất về shape (`src/db/schema.js`)

Bảng `REQUIRED_COLUMNS` khai **tên bảng → danh sách cột bắt buộc**, phải khớp `CREATE_TABLES_SQL`.

### 3.2 `legacyReason()` thay `isLegacyDb()` (`src/db/index.js`)

Vẫn giữ nguyên hai quy tắc cũ, **thêm** quy tắc thứ ba: bảng có đúng tên nhưng thiếu cột bắt buộc
⇒ coi là DB của build khác. Trả về **lý do bằng chữ** để dòng log thành bằng chứng:

```
[db] Phát hiện DB không đúng thiết kế (schema của một build khác (pallet_lines thiếu order_line_id)) → đã xoá và tạo lại (FEAT-21).
```

> ⚠️ **Hai lần sửa trong một ngày, cùng một lớp lỗi — ghi lại vì rất dễ lặp lại.**
>
> **Vòng 1 (sai, không bắt được lỗi):** `legacyReason()` lấy danh sách bảng từ câu query **đã lọc**
> `WHERE name IN ('items','item_po',…)` rồi dùng danh sách đó cho **cả** vòng kiểm cột. Nhưng
> `pallet_lines`/`production_entries` **không** nẳm trong danh sách lọc ⇒ `if (!names.has(table)) continue`
> bỏ qua chúng ⇒ **vòng kiểm cột không bao giờ chạy** ⇒ app vẫn nổ `no such column: order_line_id`.
>
> **Vòng 2 (đúng):** hỏi **hai** lần — `known` (đã lọc, cho hai quy tắc legacy cũ) và `all` (không lọc,
> cho vòng kiểm cột).
>
> **Vì sao vòng 1 lọt mà test vẫn xanh:** stub `expo-sqlite` trả về **mọi** bảng cho mọi truy vấn
> `sqlite_master`, **khôn trọng `WHERE name IN (…)`** ⇒ `legacyReason()` "thấy" được `pallet_lines`
> ⇒ nhánh kiểm cột chạy đúng ⇒ **xanh giả**. Giả lập thiếu chính xác làm cho lỗi lọt vào test.
> Stub đã sửa để tôn trọng `name IN (…)`; kể từ đó, bỏ kiểm cột thì `intermediate-build` **đỏ** và
> báo lại **đúng** `no such column: order_line_id`.

### 3.3 `repairMissingColumns()` — vá cột an toàn, **không** xoá dữ liệu

`ADDABLE_COLUMN_DECLS` liệt kê các cột **nullable** hoặc **`NOT NULL` có DEFAULT hằng** — thêm
bằng `ALTER TABLE … ADD COLUMN` mà không cần giá trị cho dòng cũ. Thiếu cột loại này thì **vá**,
không xoá cả DB (xoá là mất dữ liệu nhập tay, không có lý do gì phải vậy).

Cột `NOT NULL` **không** default (`order_line_id`, `qty`, `date`…) **không** vá được: `ADD COLUMN`
kiểu đó hỏng khi bảng đã có dòng, và **đoán giá trị thay người dùng thì tệ hơn** là báo lỗi rõ ⇒
loại này rơi vào `legacyReason()` và được dựng lại.

Lỗi khi vá hỏng được bọc lại để **nêu tên bảng và cột**:

```
Không bổ sung được cột order_lines.nw_kg (còn thiếu, cần REAL): database is locked
```

### 3.4 `verifyShape()` — xác minh **bằng quan sát**

Sau khi tạo schema, đọc lại `PRAGMA table_info` cho từng bảng rồi mới tin là xong (cùng nguyên tắc
`ensureItemMetricColumns` cũ của BUGFIX-08). Nếu vẫn thiếu thì nêu **tên bảng và tên cột** và chỉ
đường thoát:

```
Schema DB không đúng sau khi khởi tạo: order_lines thiếu cột nw_kg, gw_kg. File DB này do một
build khác tạo ra — hãy xoá file DB của app rồi mở lại để nó dựng mới.
```

---

## 4. Acceptance Criteria

| ID | Trạng thái | Mô tả |
|---|---|---|
| **AC-DB-11** | ✅ | DB có đúng tên bảng nhưng `pallet_lines` thiếu `order_line_id` ⇒ `getDb()` **không** ném, app khởi động được |
| **AC-DB-12** | ✅ | Thiếu **cột nullable** ⇒ tự `ALTER TABLE … ADD COLUMN`, **không** xoá file DB, và có dòng log nêu cột đã bổ sung |
| **AC-DB-13** | ✅ | Vá hỏng ⇒ lỗi **nêu đích danh bảng + cột + nguyên nhân**, không phải lỗi SQL mơ hồ |
| **AC-DB-14** | ✅ | Thiếu cột `NOT NULL` không default ⇒ xoá dựng lại (không đoán giá trị thay người dùng) |
| **AC-DB-15** | ✅ | `REQUIRED_COLUMNS` khớp `CREATE_TABLES_SQL`; không cột `NOT NULL` không default nào nằm trong danh sách vá tự động — có **guard** trong `test-schemaV2.mjs` §11 |

---

## 5. Kiểm thử

**E2E** (`scripts/test-dbInit.mjs`, `expo-sqlite` giả — **2 → 5 kịch bản**):

| Kịch bản | Kiểm |
|---|---|
| `intermediate-build` | DB của build trung gian thiếu `order_line_id` ⇒ app khởi động, có xoá dựng lại, view tạo lại |
| `missing-nullable-column` | `order_lines` thiếu 4 cột đo FEAT-17 ⇒ vá đủ 4, **không** xoá DB, có log |
| `verify-reports-missing` | `ALTER` hỏng ⇒ lỗi nêu `order_lines` + `nw_kg` + `database is locked` |

Stub `expo-sqlite` được mở rộng để **ném đúng lỗi SQLite**: `CREATE INDEX … ON <bảng>(<cột>…)` ném
`no such column` khi bảng thiếu cột, và `CREATE TABLE IF NOT EXISTS` trên bảng đã có là **no-op**.

**Test có tác dụng — đã kiểm:** bỏ kiểm cột khỏi `legacyReason()` thì `intermediate-build` **đỏ** và
báo lại **đúng** `no such column: order_line_id` (0/2 assert đạt); bật lại thì xanh.

**Guard** (`scripts/test-schemaV2.mjs` §11, 6 ca): `REQUIRED_COLUMNS` khớp `CREATE_TABLES_SQL` theo
cả hai chiều, `ADDABLE_COLUMN_DECLS` không chứa cột không tồn tại, và chỉ được vá cột nullable /
`NOT NULL` có DEFAULT.

**Kiểm chứng trên SQLite THẬT** (`node:sqlite`, không dùng stub) — vì stub vừa từng báo xanh giá:

| Tình huống | Kết quả |
|---|---|
| Chạy thẳng `CREATE_TABLES_SQL` lên DB của build trung gian | nổ `no such column: order_line_id` — **tái hiện đúng lỗi thiết bị** |
| Cài mới (chưa có bảng nào) | shape đúng, view đọc được |
| DB thiếu cả cột nullable **lẫn** `order_line_id` | phát hiện `pallet_lines thiếu order_line_id` → dựng lại → shape đúng |
| DB đúng tên bảng nhưng thiếu 8 cột nullable | vá đủ 8, **không** xoá, shape đúng |

Đồng thời đo trên SQLite thật: `CREATE VIEW` **không** kiểm cột (chấp nhận view tham chiếu cột
không tồn tại), `CREATE TABLE IF NOT EXISTS` trên bảng đã có là no-op, còn `CREATE INDEX … ON
<bảng>(<cột>)` **mới** là chỗ nổ `no such column`. Đó là lý do lỗi xuất hiện ở `execAsync` dù các
câu trước đều "thành công".

---

## 6. Ảnh hưởng dữ liệu

DB của build trung gian **không dùng được** với app hiện tại (view cần `order_line_id` ngay từ đầu)
⇒ việc dựng lại **không mất dữ liệu nhập tay nào đang dùng được**. Phần dữ liệu nhập lại được từ
file nguồn.

Cột nullable bị thiếu thì **vá**, không xoá ⇒ không mất gì.

---

## 7. Cấp thay đổi

**Cấp 2** — sửa tầng khởi tạo DB (`src/db/index.js` 🔒, `src/db/schema.js` 🔒). Không đổi tên bảng,
tên cột, khoá; không `DROP`/`REWRITE` dữ liệu; **không** thêm `user_version` mới; chữ ký `getDb()`
**không đổi**.

---

## 8. Tiêu chí xong

- [x] AC-DB-11..15
- [x] `expo lint` sạch · `tsc --noEmit` chỉ còn lỗi có sẵn ở `app-tabs.web.tsx`
- [x] `npm test` 539 unit + 5 kịch bản E2E, 0 fail
- [x] Test tái hiện **đúng** lỗi thiết bị khi bỏ fix (đã kiểm)
- [ ] Xác nhận trên máy thật: app mở được, nhập lại file nguồn, dữ liệu hiển thị đúng