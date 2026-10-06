# FEAT-22 — Số hiệu nhà máy (`order_ref`) gắn với **PO × mã**, không phải chỉ mã

> Cấp 2 (thêm bảng) + Cấp 3 (đổi hành vi hiển thị) — chỉ đạo chủ dự án 2026-10-05.
> Liên quan: FEAT-17 (`nw_kg`/`gw_kg`/`volume_cbm`/`package_count`), FEAT-21 (thiết kế DB mới).

---

## 1. Bối cảnh & mục tiêu

Chủ dự án yêu cầu (2026-10-05):

1. Tìm chức năng render giao diện mã sản phẩm.
2. **Ẩn** `KL` / `TKL` / `Thể tích`; **hiển thị** `order_ref`.
3. Với mã sản phẩm có **nhiều `order_ref` khác nhau**, cần phương án nhập số lượng sản xuất
   cho từng `order_ref`.

Chức năng render (đã xác định): `src/components/ItemCard.js` — `metricParts()` ở L30 và khối
render ở L210-218; danh sách thẻ do `src/screens/ItemsScreen.js:162` dựng, dữ liệu từ
`fetchItemsWithStats` (`src/db/queries.js:56`) qua view `v_line_progress` (`src/db/schema.js:193`).

**Vấn đề gốc đo được trên `src/data/Dmac.json` (12 PO / 49 mã / 25.520 pcs):**

`order_ref` **không thuộc mã hàng** mà thuộc **cặp (PO × mã)**:

| Đơn vị đo | Số |
|---|---|
| `(item_code, ref_no)` — khoá của bảng `item_refs` hiện tại | **55** |
| `(po, item_code, ref_no)` — khoá đúng cho một thẻ | **82** |

15 cặp `(mã, ref)` xuất hiện ở **nhiều PO**. Ví dụ `1072017GF / D580279` nằm ở 6 PO (2919, 2920,
2923, 2928, 2929, 2930). Vì `item_refs` không có `po_id`, đọc theo mã sẽ gán ref của PO khác vào
thẻ: **7/76 thẻ sai**.

| Thẻ | `order_ref` đúng | Sẽ hiện nhầm nếu đọc theo mã |
|---|---|---|
| 2919 / `106385GF` | `D980159` | `+D980077` (của PO 2921) |
| 2921 / `106385GF` | `D980077` | `+D980159` (của PO 2919) |
| 2924, 2929 / `1072014GF` | `D580422` | `+D581032` |
| 2926 / `1072014GF` | `D581032` | `+D580422` |
| 2927, 2928 / `106263GF` | `D980294` | `+D981041` |

**Kết quả mong muốn (đo được):** mỗi thẻ hiển thị đúng `order_ref` của riêng PO × mã đó; `KL`/
`TKL`/`Thể tích` không còn hiện; dữ liệu nền để **tách nhập số lượng theo `order_ref`**.

---

## 2. Phạm vi

**Làm (đợt này):**
- Thêm bảng `order_line_refs (order_line_id, ref_no, target)` — số hiệu gắn với **dòng đơn hàng**.
- Nhập `packing_data.json` ⇒ ghi `order_line_refs`, `target` = tổng `qty` kiện của ref đó.
- Thẻ mã hàng hiện `order_ref` (1 hoặc nhiều, kèm số lượng của từng ref).
- Ẩn `KL` / `TKL` / `Thể tích`. Giữ `Kiện`.
- Nhật cột vào `queries.js` (hàm mới) + view `v_line_progress`.

**KHÔNG làm (non-goals — phương án C để đợt sau):**
- ❌ Tách thẻ theo `order_ref` (mỗi ref một thẻ, nhập số lượng riêng). **Đây là Cấp 3 riêng**,
  cần chủ dự án duyệt `FEAT-23`.
- ❌ Cho sửa `target` của ref.
- ❌ Bỏ bảng `item_refs` (vẫn giữ: `test-schemaV2` chốt 55 dòng, và nó là dữ liệu "mã này có mấy
  số hiệu" ở tầng mã).

**Cấp thay đổi: 2** (thêm bảng — có migration) **+ 3** (đổi hành vi hiển thị, đã được chủ dự án
chỉ đạo).

---

## 3. Acceptance Criteria

| ID | Given / When / Then |
|---|---|
| **AC-REF-01** | Given đơn đã nhập `Dmac.json`, When mở tab Mã hàng, Then **82** dòng `order_line_refs`; `Σ target` của mọi ref = **25.520** = `Σ order_lines.target` |
| **AC-REF-02** | Given thẻ `PO 2919 / 106385GF`, When nhìn thẻ, Then chỉ hiện `D980159` — **không** có `D980077` |
| **AC-REF-03** | Given thẻ `PO 2921 / 106385GF`, When nhìn thẻ, Then chỉ hiện `D980077` |
| **AC-REF-04** | Given 5 mã có nhiều ref trong **cùng một PO** (vd `PO 2919 / 1063048GF`), When nhìn thẻ, Then hiện **3** ref kèm số lượng: `D980470: 477`, `D980973: 159`, `D980781: 80` — tổng đúng `716` |
| **AC-REF-05** | Given thẻ không có `order_ref` (mã thêm tay), When nhìn thẻ, Then dòng ref **ẩn hoàn toàn**, không hiện `0`/`—` (**INV-I1**) |
| **AC-REF-06** | Given bất kỳ thẻ nào, When nhìn thẻ, Then **không** còn chữ `KL` / `TKL` / `Thể tích`; vẫn còn `Kiện` |
| **AC-REF-07** | Given `nw_kg`/`gw_kg`/`volume_cbm` có giá trị trong DB, When đọc `SELECT` bất kỳ, Then dữ liệu **còn nguyên** — chỉ ẩn ở UI (**INV-I2**, chỉ đọc) |
| **AC-REF-08** | Given DB đã có dữ liệu nhập tay trước FEAT-22 (chưa có bảng `order_line_refs`), When mở app, Then bảng được tạo, app khởi động bình thường, không mất dữ liệu nào |
| **AC-REF-09** | Given đã nhập `Dmac.json`, When nhập lại **lần 2** cùng file, Then `order_line_refs` không nhân bản, vẫn 82 dòng |
| **AC-REF-10** | Given mọi dòng `order_line_refs`, When kiểm `Σ target` theo `order_line_id`, Then **bằng** `order_lines.target` của dòng đó (trừ dòng không có kiện ⇒ không có dòng ref) |
| **AC-REF-11** | Given 1 ref, When nhìn thẻ, Then hiện `Số hiệu: D980159`; Given nhiều ref, Then hiện `Số hiệu: 3 số` + từng dòng ref kèm số lượng |
| **AC-REF-12** | Given bất kỳ thao tác ghi nào, When chạy, Then `Σ order_line_refs.target` **không bao giờ vượt** `Σ order_lines.target` của cùng batch |

---

## 4. Ảnh hưởng dữ liệu

**Schema — `SCHEMA_VERSION` 1 → 2.** Thêm **một** bảng, **không** `ALTER`/`DROP` bảng nào:

```sql
CREATE TABLE IF NOT EXISTS order_line_refs (
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  ref_no        TEXT    NOT NULL,
  target        INTEGER NOT NULL DEFAULT 0 CHECK (target >= 0),
  PRIMARY KEY (order_line_id, ref_no)
);
CREATE INDEX ix_olrefs_ref ON order_line_refs(ref_no);
```

**Không `ADD COLUMN`** ⇒ `src/db/index.js` không cần cơ chế `ALTER` (thiết kế mới bỏ hẳn
`runMigrations` vì chỉ có 1 schema). `CREATE TABLE IF NOT EXISTS` chạy mỗi lần mở app nên bảng
được tạo trên DB cũ mà **không cần xoá dữ liệu**. Đây là điểm khác biệt quan trọng so với FEAT-18:
thêm bảng an toàn, thêm cột thì phải viết lại cơ chế `ALTER` mà FEAT-21 đã bỏ có chủ đích.

**Cột vào `v_line_progress`:**
```sql
(SELECT GROUP_CONCAT(ref_no, ',') FROM (
   SELECT ref_no FROM order_line_refs r WHERE r.order_line_id = l.id ORDER BY ref_no
)) AS ref_nos
```
`GROUP_CONCAT` có `ORDER BY` lồng để thứ tự **ổn định** — không phụ thuộc thứ tự quét bảng.

**Ảnh hưởng dữ liệu cũ:** DB có dữ liệu nhập tay trước FEAT-22 sẽ có `order_line_refs` **rỗng**.
Thẻ đó hiện dòng ref theo **INV-I1** (ẩn), kèm gợi ý *"nhập lại file nguồn (packing_data.json) để có
số hiệu"* — đúng cách FEAT-19 đã làm. **Không** tự bịa ref cho dữ liệu cũ.

**Không phá:** `order_lines.target` **không đổi** (vẫn là tổng của mọi PO, `INV-D6`/`INV-D7` giữ
nguyên) ⇒ `INV-V1` (`SUM entries ≤ target`) không đụng. `item_refs` **giữ nguyên** 55 dòng.

---

## 5. Kế hoạch file

| File | Mức | Hành động | Lý do |
|---|---|---|---|
| `src/db/schema.js` | 🔒 | **thêm** bảng `order_line_refs`, `SCHEMA_VERSION = 2`, thêm `ref_nos` vào `v_line_progress` | Cấp 2, đã được chủ dự án duyệt đợt này |
| `src/utils/packingV2Import.js` | 🟢 | `buildLinePlan` trả thêm `lineRefs` (PO × mã × ref + `target` từ kiện) | Hàm thuần, kiểm được bằng `node` thuần |
| `src/db/queries.js` | 🔒 | **thêm** `fetchLineRefsForBatch()`; `importPackingV1` ghi bảng mới; `fetchItemsWithStats` trả `ref_nos` | Chỉ **thêm** hàm + trả **thêm** khoá |
| `src/components/ItemCard.js` | 🟡 | `metricParts` bỏ 3 nhãn; thêm `refParts` + render dòng `order_ref` | Đã là phần 1 của yêu cầu |
| `src/utils/refFormat.js` | 🟢 | **tạo mới** — định dạng `order_ref` (hàm thuần) | Tách logic hiển thị khỏi component để test được |
| `scripts/test-refFormat.mjs` | 🟢 | **tạo mới** | Unit test hàm thuần |
| `scripts/test-schemaV2.mjs` | 🟢 | thêm khối kiểm `order_line_refs` trên `Dmac.json` thật | Số đo từ file thật |
| `specs/*` | 🟢 | cập nhật AC / data / test / changelog | `SPEC-rules` §0.1 bước 7 |

**Không sửa:** `src/db/index.js` (không cần `ALTER`), `store/useAppStore.js` 🔒 (dữ liệu tới từ
`items` qua `refreshItems` — không cần action mới), `screens/*`, `src/app/**`.

---

## 6. Thiết kế

**Luồng:** `Dmac.json` → `buildImportPlanV2` → `importPackingV1` ghi `order_line_refs` →
`v_line_progress` gom `ref_nos` → `fetchItemsWithStats` trả `ref_nos` + `refTargets` →
`ItemCard` render bằng `refFormat.js`.

**Hàm mới (`queries.js` — chữ ký cũ giữ nguyên):**
```js
fetchLineRefsForBatch(batchId) // → [{ order_line_id, ref_no, target }]
```
`fetchItemsWithStats` **chỉ thêm** 2 khoá `ref_nos` (string) và `refTargets` (object) — không
xoá khoá nào.

**Văn bản UI (tiếng Việt, giữ `INV-U2`):**
- 1 ref: `Số hiệu: D980159`
- Nhiều ref: `Số hiệu: 3 số` rồi mỗi ref một dòng `D980470 — 477 pcs`
- Không có: ẩn hoàn toàn (không hiện `0`/`—`)

**Phương án C (đợt sau, FEAT-23) — nền đã chuẩn bị:** bảng này cho phép tách thẻ theo ref vì
`Σ target` mỗi ref đã là số thật. Sẽ trình riêng, không làm trong đợt này.

---

## 7. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| `INV-D6`/`INV-D7` (`Σ` bảng PO == tổng đơn) | `order_lines.target` **không đổi**; bảng mới chỉ đọc cho UI |
| `INV-V1` (`SUM entries ≤ target`) | Không đụng `production_entries`; hạn mức vẫn theo dòng đơn hàng |
| `INV-I2` (4 cột chỉ đọc) | Chỉ ẩn ở UI, **không** xoá cột, **không** sửa logic ghi |
| `INV-I1` (`NULL` = không có dữ liệu, ẩn) | Không có ref ⇒ ẩn dòng, không hiện `0` |
| `AC-SPLIT-06` (4 trường FEAT-17 chỉ ở thẻ tách đầu) | Cấu trúc tách thẻ đã bỏ từ FEAT-21; AC này thuộc bản cũ, cập nhật trong `SPEC-acceptance.md` |
| Nhân bản khi nhập lại file | `DELETE FROM order_line_refs` (theo `order_batch_id` qua `order_lines`) **trước** khi ghi, trong cùng transaction |
| `Σ target` lệch | Test chốt `Σ = 25.520` và so từng dòng với `order_lines.target` |
| `GROUP_CONCAT` không ổn định thứ tự | Subquery có `ORDER BY ref_no` |

---

## 8. Kế hoạch kiểm thử

**RC phải chạy lại:** RC-01..06 (thẻ mã), RC-23..31 (hạn mức), RC-110..114 (import + 4 trường),
RC-128..131 (thẻ tách), RC-22 (nâng cấp DB).

**RC mới:**

| ID | Bước | Mong đợi |
|---|---|---|
| RC-140 | Mở app sau khi nâng cấp từ DB đã có dữ liệu | App vào được; bảng `order_line_refs` tồn tại; dữ liệu cũ nguyên vẹn (AC-REF-08) |
| RC-141 | Nhập `Dmac.json`, mở tab Mã hàng | `PO 2919 / 106385GF` hiện **chỉ** `D980159` (AC-REF-02) |
| RC-142 | Nhìn `PO 2921 / 106385GF` | Chỉ `D980077` (AC-REF-03) |
| RC-143 | Nhìn `PO 2919 / 1063048GF` | 3 ref kèm `477` / `159` / `80`, tổng `716` (AC-REF-04) |
| RC-144 | Nhìn thẻ bất kỳ | Không còn `KL` / `TKL` / `Thể tích`; còn `Kiện` (AC-REF-06) |
| RC-145 | Mã thêm tay (`＋ Thêm mã hàng`) | Không có dòng số hiệu (AC-REF-05) |
| RC-146 | Nhập lại cùng file lần 2 | Vẫn 82 dòng ref, không nhân bản (AC-REF-09) |
| RC-147 | `SELECT SUM(target) FROM order_line_refs` | `25.520` (AC-REF-01) |
| RC-148 | Nhập số lượng, sửa, xoá nhật ký | Hạn mức `SUM ≤ target` như cũ, không lỗi (INV-V1) |
| RC-149 | Hoàn tất đơn → tab Mã hàng | Đơn mới trắng; ref rỗng ⇒ ẩn (AC-REF-05) |

---

## 9. Tiêu chí xong

- [ ] Mục 10.4 `SPEC-rules.md`: có spec, không vi phạm 10 quy tắc vàng, không sửa 🔒 ngoài phạm vi
      được duyệt, đúng chiều phụ thuộc, có migration + kiểm thử nâng cấp, app khởi động sạch, có
      checklist hồi quy, spec đã cập nhật