# FEAT-17 — Nhập thẳng `packing_data.json` (schema_version 1) + hiển thị thông tin mỗi mã hàng

> **TRẠNG THÁI: ĐÃ TRIỂN KHAI (2026-10-04)** — AC-NEW-01..12 đạt qua E2E với `queries.js` nguyên bản.
> Cấp thay đổi: **Cấp 2** (thêm 4 cột `items` + migration v3) **+ Cấp 3** (import nhận thêm định dạng mới).
> Chủ dự án đã chỉ đạo (2026-10-04): *"Import dữ liệu dựa trên cấu trúc JSON trong `src/data/packing_data.json`, và render thêm nội dung có trong dữ liệu của mỗi mã hàng"*.
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-acceptance.md](../SPEC-acceptance.md) | [SPEC-test.md](../SPEC-test.md)

---

## 1. Bối cảnh & vấn đề

FEAT-16 đã chọn phương án "converter ngoài app" và **đo được** một hệ quả xấu:

| Hạn chế đo được | Ảnh hưởng |
|---|---|
| `importItemsFromJson` đọc `Column10` của **dòng đầu** rồi gán cho **mọi** mã (`queries.js:951`) | 64 mã mang nhãn PO `23635`; PO thật nằm rải rác 22 shipment (45/64 mã thuộc **nhiều** PO) |
| Người dùng phải chạy lệnh ở máy tính, copy file lên Google Drive, rồi nhập | thêm 1 bước thủ công cho mỗi lần dữ liệu mới |

Nguồn `packing_data.json` **giàu hơn hẳn** định dạng phẳng — mỗi mã hàng có 4 trường bị bỏ qua hoàn toàn:

| Trường ở `shipments[].item_summary[]` | Ý nghĩa | Hiện tại |
|---|---|---|
| `nw_kg` | khối lượng tịnh (1 chữ số thập phân) | ❌ vứt |
| `gw_kg` | khối lượng tổng (1 chữ số thập phân) | ❌ vứt |
| `volume_cbm` | thể tích (2 chữ số thập phân) | ❌ vứt |
| `package_count` | số kiện chứa mã này | ❌ vứt |

Đã kiểm chứng trên dữ liệu thật: **174/174** dòng `item_summary` khớp **tuyệt đối** với tổng cộng từ
`containers[].packages[].items[]` (theo `qty`/`nw_kg`/`gw_kg`) ⇒ `item_summary` là nguồn đáng tin,
không cần tự cộng lại. `package_count` là số nguyên; không có giá trị `null` trong dữ liệu hiện tại.

**Mục tiêu:** app đọc **trực tiếp** `packing_data.json`, nạp đủ 22 shipment trong **một** lần import,
lưu 4 trường mới theo từng mã hàng và **render** chúng.

---

## 2. Phạm vi

- **Làm:** (a) thêm đường import `packing_v1` (nhận diện + parse + ghi atomically); (b) migration v3 thêm 4 cột
  `items.nw_kg / gw_kg / volume_cbm / package_count`; (c) render 1 dòng thông tin trên `ItemCard`;
  (d) **PO chính xác từng mã** (`A+B` cho mã thuộc nhiều PO) — hết giới hạn nêu ở FEAT-16 §2.1.
- **KHÔNG làm:** không sửa/xoá converter FEAT-16 (`npm run convert:packing` vẫn chạy, vẫn hữu ích để đối chiếu);
  không đổi `addItem`/`updateItem`/`ItemEditSheet` (4 trường mới **chỉ đọc**, không sửa tay);
  không đụng `entries`, `pallet_status`, key pallet (`INV-D4`), `finishOrder`; không render trong Lịch sử/Đơn lưu trữ.
- **Cấp thay đổi:** **Cấp 2** (cột mới + migration) **+ Cấp 3** (hành vi import đổi: nay file mới được nạp thật
  thay vì báo lỗi). Đã có chủ dự án chỉ đạo bằng văn bản.

---

## 3. Data Model

### 3.1 Migration v3 — bổ sung, không phá (Cấp 2)

```js
// src/db/migrations.js — thêm vào MIGRATIONS, SAU v2 (không sửa v1/v2)
{
  version: 3,
  up: async (db) => {
    await db.execAsync(`ALTER TABLE items ADD COLUMN nw_kg REAL DEFAULT NULL`);
    await db.execAsync(`ALTER TABLE items ADD COLUMN gw_kg REAL DEFAULT NULL`);
    await db.execAsync(`ALTER TABLE items ADD COLUMN volume_cbm REAL DEFAULT NULL`);
    await db.execAsync(`ALTER TABLE items ADD COLUMN package_count INTEGER DEFAULT NULL`);
  },
}
```

**Quyết định quan trọng — KHÔNG sửa `CREATE_TABLES_SQL` (`db/schema.js` 🔒):**
migration v1 đã phát hành (nguyên tắc #2). Cài mới chạy v1 → v2 → v3, nên `ALTER TABLE` áp dụng cho
**cả** DB mới lẫn DB cũ bằng cùng một đường. Không đụng file 🔒, không tạo hai hình thức schema.

| Tiêu chí | Kết quả |
|---|---|
| `ADD COLUMN` có `DEFAULT NULL` | an toàn tuyệt đối, không cần bảng tạm, không `DROP`/`REWRITE` |
| Không đổi PK `(ntk, order_batch_id)`, không index mới | `INSERT OR REPLACE` cũ, `INV-V1/V2/V4`, `pallet_key` không đổi |
| Dữ liệu cũ | 4 cột mới = `NULL` ⇒ vẫn xem được như cũ |
| Cài mới | v1 tạo bảng, v3 thêm cột ⇒ **cùng kết quả** |

### 3.2 Bảng `items` sau v3

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `ntk` | TEXT | PK 1 |
| `po` | TEXT | `A` hoặc `A+B` (mã thuộc nhiều PO) — `INV-D6` gom nhóm "Nhiều PO" |
| `target` | INTEGER | Σ `qty` của mã trên mọi shipment |
| `order_batch_id` | INTEGER | PK 2 |
| **`nw_kg`** | REAL NULL | Σ `item_summary[].nw_kg` — **mới** |
| **`gw_kg`** | REAL NULL | Σ `item_summary[].gw_kg` — **m��i** |
| **`volume_cbm`** | REAL NULL | Σ `item_summary[].volume_cbm` — **mới** |
| **`package_count`** | INTEGER NULL | Σ `item_summary[].package_count` — **mới** |

`NULL` = "không có dữ liệu" (mã thêm tay, hoặc import định dạng cũ) ⇒ UI **ẩn** dòng thông tin, không hiện `0`.

---

## 4. Business Logic — quy tắc chuyển đổi `packing_v1` → app

Nguồn: `batches[].shipments[] → containers[] → packages[] → items[]` và `shipments[].item_summary[]`.

| Bước | Quy tắc |
|---|---|
| **V1** | Nhận diện `packing_v1` (`schema_version` là số **hoặc** có mảng `batches`/`shipment_list`) — `looksLikePackingV1()` đã có sẵn trong `utils/importFormat.js` |
| **V2** | Thu thập shipment: `collectShipments()` (đọc được cả `batches[].shipments` lẫn `shipment_list` phẳng) |
| **V3** | **Kiện đánh số TOÀN CỤC `1..N`** theo thứ tự shipment → container (không dùng `package_no`, vì nó đánh số lại từ 1 mỗi container). Đây là lý do FEAT-16 phải gộp file |
| **V4** | `containers[].id` = `container_no` (đã kiểm chứng **26/26 duy nhất**); `label` = `Container ${index}`; `po` = PO của container |
| **V5** | `pallets[] = packages[]` ⇒ `{ no, items: [{ntk, qty}] }` — **đúng cấu trúc `containersData`** ⇒ mọi logic kiện/tick sẵn có dùng được, khoá `${cid}-${no}` / `${cid}-${no}-${ntk}` giữ nguyên (`INV-D4`) |
| **V6** | `items` từ `shipments[].item_summary[]`: `target = Σ qty`; `nw_kg/gw_kg/volume_cbm/package_count = Σ` tương ứng; `po = pos.join('+')` nếu mã thuộc nhiều shipment |
| **V7** | Kiện có `items.length > 1` (nguồn `is_mixed`) ⇒ dùng khoá nhiều loại; không cần cờ riêng — `palletKey()` đã suy ra từ số mã |
| **V8** | Kiểm tra trước khi ghi (all-or-nothing, kế thừa `problem` của FEAT-16): PO không ép được, `item_code` sai regex, kiện rỗng, `qty ≤ 0`, số kiện lệch `totals`, dải kiện lệch, kiện trùng số, `Σ items ≠ package.total_qty` ⇒ **không** ghi gì |
| **V9** | Một `withTransactionAsync` duy nhất: upsert `items` → `INSERT OR REPLACE container_data` → `UPDATE total_target` → `UPDATE pallets_total` (đúng tinh thần `INV-B3`) |

**Không dùng lại `parsePackingListContainers`/`importItemsFromJson`:** chúng đọc `Column*` — định dạng phẳng.
Sửa chúng thành hiểu cả hai định dạng sẽ làm một hàm 2 nhánh khó test; hàm mới giữ nguyên hành vi cũ (`AC-FMT-03`).

---

## 5. Acceptance Criteria

| ID | Hành vi |
|---|---|
| AC-NEW-01 | Chọn `src/data/packing_data.json` (định dạng mới) trong `📥 Nhập JSON` ⇒ **nạp thật**, không còn báo *"định dạng MỚI … hãy chạy npm run convert:packing"* |
| AC-NEW-02 | Kết quả: **64 mã**, `Σ target = 51.568`, **26 container**, **468 kiện**, kiện đánh số liên tục `1..468` — khớp `shipment_list` |
| AC-NEW-03 | 4 trường mới lưu đúng: `nw_kg`, `gw_kg`, `volume_cbm`, `package_count` (Σ theo mã, làm tròn `nw/gw` 1 chữ số, `cbm` 2 chữ số) |
| AC-NEW-04 | `po` **chính xác từng mã**: mã chỉ 1 shipment ⇒ `po_no`; mã nhiều shipment ⇒ `2919+2930`. Bảng tổng theo PO gom mã này vào nhóm `Nhiều PO` (`INV-D6`) |
| AC-NEW-05 | `ItemCard` hiện thêm 1 dòng: `KL … · TKL … · … m³ · … kiện`; **chỉ** hiện khi có ít nhất 1 trường ≠ `NULL` |
| AC-NEW-06 | Mã thêm tay / import định dạng cũ ⇒ 4 cột `NULL` ⇒ **không** hiện dòng, **không** hiện số `0` giả |
| AC-NEW-07 | Có `problem` chặn ⇒ `Alert` tiếng Việt liệt kê lý do, **0 lệnh ghi DB** (fail-safe, `INV-B2`/`INV-B3` tinh thần) |
| AC-NEW-08 | Nhập 2 lần cùng file ⇒ không nhân bản mã/kiện (PK giữ nguyên) |
| AC-NEW-09 | Định dạng **cũ** (`總表` + `entries`) nhập như trước, **không** đổi hành vi (`AC-FMT-03`, `AC-IMP-08`, `AC-IMP-13`) |
| AC-NEW-10 | Migration v3: DB cũ mở lên được, dữ liệu cũ nguyên vẹn, 4 cột mới = `NULL`; cài mới có cùng schema |
| AC-NEW-11 | Không sửa tay được 4 trường mới (`ItemEditSheet` giữ nguyên) — nguồn sự thật là packing list |
| AC-NEW-12 | Tab Container hiển thị đúng 468 kiện / 26 container; tick kiện hoạt động như cũ |

---

## 6. API (chỉ **thêm**, không đổi chữ ký)

| Hàm | Thay đổi |
|---|---|
| `q.importPackingV1(batchId, jsonData)` | **MỚI** — `{imported, totalItems, containers, pallets, shipments, poCount}` |
| `q.fetchItemsWithStats(batchId)` | **mở rộng kết quả**: thêm `nw_kg, gw_kg, volume_cbm, package_count` vào mảng trả về (chữ ký `(batchId)` **không đổi**; caller cũ destructuring vẫn chạy) |
| `store.importFromJson(jsonData)` | **thêm nhánh** `packing_v1`; `importStatus`/`importResult` giữ nguyên ⇒ không breaking |
| `q.importItemsFromJson`, `q.importContainerData` | **không đổi** (phục vụ định dạng cũ) |

---

## 7. Kế hoạch file

| File | Mức | Hành động |
|---|---|---|
| `src/db/migrations.js` | 🔒 | **thêm** `version: 3`; không sửa v1/v2 |
| `src/utils/packingV1Import.js` | 🟢 mới | `buildImportPlanV1(data)` — hàm thuần: `items[]`, `containers[]`, `problems[]`, `stats` |
| `src/db/queries.js` | 🔒 | **thêm** `importPackingV1`; `fetchItemsWithStats` thêm 4 cột vào `SELECT` |
| `src/store/useAppStore.js` | 🔒 | **thêm** nhánh `packing_v1` trong `importFromJson` |
| `src/utils/importFormat.js` | 🟢 | `packing_v1` thành định dạng **được hỗ trợ**; `estimateImportCount` theo mã của định dạng mới |
| `src/components/ImportJsonButton.js` | 🟢 | bỏ chặn `packingListV1`; hiện số mã + cảnh báo PO nhiều shipment |
| `src/components/ItemCard.js` | 🟡 | thêm dòng thông tin (chỉ khi có dữ liệu) |
| `scripts/test-packingV1Import.mjs` + `package.json` | 🟢 | unit test hàm thuần + `test:packingImport` |
| `specs/*`, `SPEC.md`, `AGENTS.md`, `tasks.md` | 🟢 | data model, API, AC, invariant, RC, changelog, registry |

**Không sửa:** `db/schema.js` 🔒, `src/data/seed.js` 🔒, `ItemEditSheet`/`PalletRow` 🟡, `store` state/action cũ, route `src/app/**` 🔒.

---

## 8. Breaking change

| Hạng mục | Kết luận |
|---|---|
| **Database** | ❌ **Không breaking.** Chỉ `ADD COLUMN … DEFAULT NULL`; không `DROP`/`ALTER` phá huỷ, không đổi PK/index, không xoá dữ liệu. App cũ mở DB có cột thừa vẫn chạy (chỉ **không** thấy 4 trường mới) |
| **API `queries.js`/`store`** | ❌ **Không breaking.** Không đổi chữ ký; chỉ **thêm** hàm. `fetchItemsWithStats` trả về **thêm khoá** ⇒ tương thích ngược |
| **Hành vi** | ⚠️ **Có, có chủ ý (Cấp 3):** file `packing_v1` trước đây báo lỗi, nay nạp thật. Đây chính là yêu cầu của chủ dự án |
| **Rủi ro ngầm** | `INSERT OR REPLACE` ⇒ import mới **ghi đè** `target` và xoá 4 trường của mã cũ nếu mã không có trong file (giống hành vi `AC-IMP-08` sẵn có — giữ nguyên để không tạo 2 tiêu chuẩn) |

---

## 9. Kế hoạch kiểm thử

- `scripts/test-packingV1Import.mjs`: 1 file/shipment nhiều shipment; mã trùng PO và đa PO; kiện trộn mã;
  10 loại `problem`; all-or-nothing; đối chiếu với `shipment_list`; **file thật** ⇒ 64 mã / 51.568 / 26 / 468;
  khớp `item_summary` 174/174.
- Hồi quy: `npm test` (không hỏng ca cũ) · `npx expo lint` · `npx tsc --noEmit` · `npx expo export`.
- Migration: mở app trên DB cũ (`user_version = 2`) ⇒ v3 chạy, dữ liệu nguyên vẹn.
- RC-110..RC-117 (máy thật) — xem `SPEC-test.md`.

## 10. Tiêu chí xong

- [x] `SPEC-rules.md` §10.4: có spec (Cấp 2 + Cấp 3), AC kiểm chứng được, **không** sửa file 🔒 ngoài phạm vi
      (`db/schema.js` **không** đụng; `queries.js`/`store` chỉ **thêm**), không migration đã phát hành bị sửa
- [x] `npm test` — **550 ca đạt** (44+28+42+56+65+19+41+115+46+94), **không hỏng** ca cũ
- [x] `npx expo lint` 0 lỗi · `npx tsc --noEmit` 0 lỗi mới (`app-tabs.web.tsx:27` có sẵn) · `npx expo export` sạch
- [x] Migration v3: kiểm tra bằng code thật — đúng **4** `ALTER TABLE … ADD COLUMN … DEFAULT NULL`,
      **không** `DROP`/`CREATE TABLE`/`RENAME`; v1 và v2 còn nguyên
- [ ] RC-110..117 (máy thật)

### 10.1 Kết quả đo sau khi triển khai

E2E chạy `queries.js` nguyên bản với `expo-sqlite` giả, nạp `src/data/packing_data.json`:

| Chỉ số | Kết quả | Đối chiếu |
|---|---|---|
| `imported` | **64** mã | ✅ khớp `shipment_list` |
| Σ `target` | **51.568** | ✅ khớp |
| container / kiện | **26 / 468** | ✅ khớp, kiện liên tục `1..468`, id container duy nhất |
| shipment | **22** | ✅ |
| 4 trường mới | 64/64 mã có đủ `nw_kg`, `gw_kg`, `volume_cbm`, `package_count` | ✅ INV-I3 (174/174 dòng nguồn) |
| PO chính xác từng mã | **45/64** mã nhiều PO, dạng `23635+2928` | ✅ hết giới hạn FEAT-16 §2.1 |
| File hỏng | ném lỗi tiếng Việt, **0** lệnh ghi DB | ✅ INV-I4 |
| Định dạng cũ | `importItemsFromJson`/`importContainerData` cho kết quả **y hệt** trước đây, SQL không đổi | ✅ AC-IMP-18 |
