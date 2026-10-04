# FEAT-16 — Converter packing list `schema_version 1` → định dạng app nhận

> **TRẠNG THÁI: ĐÃ TRIỂN KHAI (2026-10-04)** — chủ dự án đã xác nhận cần import dữ liệu này.
> Cấp thay đổi: **Cấp 1** (thêm file mới) — **không sửa** hàm/schema hiện có trong `queries.js`.
> Lệnh: `npm run convert:packing` · Test: `npm run test:packing`, `npm run test:format`.
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-acceptance.md](../SPEC-acceptance.md) | [SPEC-test.md](../SPEC-test.md)

## 1. Bối cảnh & vấn đề

File `src/data/packing_data.json` (sinh bởi tool khác, `schema_version: 1`) **không import được**:
app chỉ nhận 2 định dạng cũ (AC-IMP-01/08):

| App cần | File mới có |
|---|---|
| key `總表`, dòng phẳng | `batches → shipments → containers → packages → items` (4 tầng) |
| `Column4` = mã | `item_code` |
| `Column6` = số lượng | `qty` / `total_qty` |
| `Column2` = **số kiện duy nhất toàn cục** | `package_no` (**đánh số lại từ 1 mỗi container**) |
| `Column1` = `"Pallet a-b"` | `pallet_range.from/to` |
| `Column10` = PO (bắt buộc **kiểu number**) | `po_no` (chuỗi) |

Kiểm chứng bằng harness chạy code thật (`expo-sqlite` giả): `detectFormat → 'packingList'`,
`importItemsFromJson → "Không tìm thấy mã hàng nào trong file JSON."`, `importContainerData → lỗi`,
**0 lệnh ghi DB** ⇒ fail-safe, không hỏng dữ liệu.

## 2. Quyết định: converter, **không** thêm parser vào app

| Tiêu chí | ✅ Converter (chọn) | ❌ Parser mới trong app |
|---|---|---|
| Rủi ro dữ liệu sai **im lặng** | Thấp — lỗi ⇒ báo, không ghi | Cao — `target`/số kiện sai ⇒ DB sai, khó phát hiện |
| Sửa code app | **0 dòng** | `queries.js` 🔒 + `detectFormat` + `store` ⇒ 2 nhánh import |
| Test | Offline `node scripts/…` | Cần máy thật + SQLite thật |
| Đường lui | Xoá script | Đã ghi dữ liệu kiểu mới ⇒ phải viết migration dọn |

**Đánh đổi đã biết:** nếu upstream đổi `schema_version`, phải sửa converter. Đây là lỗi **mờ**
(không phá dữ liệu đã lưu), chấp nhận được.

### 2.1 Ràng buộc phát hiện được: **GỘP thành MỘT file**, không phải một file mỗi PO

> ⚠️ **Đã đo, không suy đoán.** Bản DRAFT đầu tiên đề xuất "một file cho mỗi shipment (22 file)" để
> giữ đúng PO. **Đo bằng code import thật** (`expo-sqlite` giả, `queries.js` nguyên bản) cho thấy
> cách đó **mất 2/3 dữ liệu**:

| Bằng chứng | Hệ quả |
|---|---|
| `items` có PK `(ntk, order_batch_id)` ⇒ `INSERT OR REPLACE` | file sau ghi đè `target` của file trước cho cùng `ntk` ⇒ Σ còn **17.935 / 51.568** |
| `container_data` có PK `batch_id` (1 dòng/batch) | chỉ giữ container của **file cuối cùng** ⇒ mất 25/26 container |

⇒ Người dùng **phải** import **một lần, một file duy nhất** mới nạp trọn 26 container / 468 kiện.

**Còn giới hạn PO thì xử lý thế nào (không né)?**

`importItemsFromJson` đọc `Column10` của **dòng đầu** rồi gán cho **mọi** item
(`src/db/queries.js`: `po = String(col10)` trong vòng lặp) ⇒ file gộp sẽ gán **một** PO cho cả 64 mã.
Đây là **giới hạn sẵn có của app**, không phải lỗi converter, và **không có cách nào khác** mà không
sửa `queries.js` (🔒, ngoài phạm vi Cấp 1). Xử lý:

1. Converter chọn PO **đóng góp lượng lớn nhất** cho `Column10` (mọi mã mang nhãn PO đó).
2. Converter ghi **bản đồ PO đầy đủ theo từng mã** vào `manifest.json` (`items[].pos`) để đối chiếu.
3. CLI **cảnh báo rõ** số mã thuộc nhiều PO.
4. Nếu cần PO chính xác từng mã ⇒ tách `po` theo mã ở tầng nghiệp vụ (ngoài phạm vi bản này), **không** giả vờ converter đã làm được.

Bù lại, `target` (tổng theo mã) và cấu trúc 468 kiện là **đúng tuyệt đối** — đây mới là dữ liệu
dùng để theo dõi sản xuất.

## 3. Đặc tả chuyển đổi

```
data.batches[] → shipment[] → containers[] → packages[]
```

| Bước | Quy tắc |
|---|---|
| B1 | Duyệt `batches` → `shipments` theo thứ tự file. `po = shipment.po_no`; phải ép được sang **Number** (app yêu cầu `typeof col10 === 'number'`); không ép được ⇒ bỏ qua file đó + ghi `problem` |
| B2 | Duyệt `containers` theo thứ tự, **đánh số kiện toàn cục** `1..N` (KHÔNG dùng `package_no`) |
| B3 | Mỗi `package` → 1 kiện: `{ no, items: [{ntk: item_code, qty}], mixed: is_mixed }` |
| B4 | Row `總表`: **một dòng cho mỗi (kiện, mã)** — kiện trộn nhiều mã sinh nhiều dòng (app cộng dồn theo `Column4` ⇒ `target` = tổng qty của mã) |
| B5 | Row `總表`: `Column1` = `Pallet ${no}` (1 kiện ⇒ `Pallet 7-7`), `Column2` = số kiện toàn cục, `Column4` = mã, `Column6` = qty, `Column10` = PO dạng number |
| B6 | Row của container (mảng `Container1..N`): `Column1` = `Pallet ${from}-${to}` (khoảng kiện toàn cục của container) |
| B7 | Kiểm tra `Σ qty package == Σ qty items` trong từng package; lệch ⇒ `problem` |

### 3.1 Tự kiểm trước khi ghi (all-or-nothing)

| Kiểm tra | Mã `problem` |
|---|---|
| `packages.length == totals.packages` | `PKG_COUNT_MISMATCH` |
| `containers.length == totals.containers` | `CONT_COUNT_MISMATCH` |
| `Σ package.total_qty == totals.qty` | `QTY_MISMATCH` |
| `package_no` tăng dần, không trùng trong container | `PKG_NO_INVALID` |
| `pallet_range` khớp số package | `PALLET_RANGE_MISMATCH` |
| `item_code` khớp `/^[0-9A-Za-z]+$/` | `INVALID_NTK` |
| mỗi package có ≥1 item, `qty > 0` | `EMPTY_PACKAGE` |
| `Σ items.qty == package.total_qty` | `PACKAGE_QTY_MISMATCH` |
| số kiện toàn cục liên tục `1..N` | `Pallet_NO_GAP` |
| `po_no` ép được sang Number | `PO_NOT_NUMERIC` |

**Cấm** ghi file nếu còn `problem` loại **chặn** (`BLOCKING`). Vấn đề không chặn (shipment có
`ok: false`, `warnings` của file) ⇒ vẫn ghi nhưng **bắt buộc** nêu trong manifest + cảnh báo CLI.

## 4. Acceptance Criteria

| ID | Hành vi |
|---|---|
| AC-CONV-01 | `convertPackingDataV1(data)` là **hàm thuần** (không `fs`, không `react-native`, không network) ⇒ test được bằng `node` |
| AC-CONV-02 | Xuất **MỘT file legacy duy nhất** `packing_legacy.json` (`總表` + `Container1..N`) chứa **toàn bộ** 22 shipment; kèm `manifest.json`. Import 1 lần ⇒ nạp đủ 64 mã / 51.568 pcs / 26 container / 468 kiện (§2.1) |
| AC-CONV-03 | Kiện được **đánh số toàn cục** `1..N` theo thứ tự container, **không** dùng `package_no` |
| AC-CONV-04 | Kiện nhiều mã (`is_mixed`) sinh **nhiều dòng** `總表` cùng `Column2` ⇒ app cộng dồn ra `target` đúng |
| AC-CONV-05 | `Column1` của row container đúng dạng `Pallet {from}-{to}` (kể cả container 1 kiện) |
| AC-CONV-06 | `Column10` là **number**; shipment có `po_no` không ép được ⇒ **bỏ qua file** + ghi `problem`, không ghi file rác |
| AC-CONV-07 | Có `problem` chặn ⇒ **không ghi file nào**, trả `{ok:false, problems}` |
| AC-CONV-08 | Shipment `ok === false` hoặc có `warnings` ⇒ vẫn ghi nhưng **bắt buộc** ghi `needsReview` trong manifest + cảnh báo ra CLI |
| AC-CONV-09 | CLI in tổng kết quả (số file, container, kiện, mã, tổng qty) và **đối chiếu** với `shipment_list`; sai khác ⇒ cảnh báo |
| AC-CONV-10 | Không file nào ghi ra đĩa nếu kiểm tra thất bại (kiểm tra **trước**, ghi **sau**) |
| AC-FMT-01 | `detectFormat` siết: `packingList` chỉ khi có `總表` **hoặc** có dòng `Column4`; không thành `unknown` ⇒ báo lỗi sớm kèm gợi ý dùng converter |
| AC-FMT-02 | `detectFormat`/`estimateImportCount` chuyển ra `src/utils/importFormat.js` (hàm thuần) ⇒ test được; `ImportJsonButton` chỉ import lại, **không** copy logic |
| AC-FMT-03 | Hành vi cũ của nhánh `entries` và packing list hợp lệ **không đổi** (hồi quy RC import) |
| AC-FMT-04 | `estimateImportCount` đếm **mã duy nhất** (`Set`), không đếm số dòng ⇒ `Alert` nói *"Nhập N mã hàng"* khớp đúng `res.imported` (kiện trộn mã sinh nhiều dòng cho cùng 1 mã) |
| AC-FMT-05 | `ImportJsonButton` **không** chứa logic định dạng nào — chỉ import từ `@/utils/importFormat`; giữ nguyên phần đọc file qua `new File(uri).text()` (BUGFIX-07) |

## 5. Kế hoạch file

| File | Mức | Hành động |
|---|---|---|
| `src/utils/packingV1.js` | 🟢 mới | `convertPackingDataV1(data)` + hằng/helper thuần |
| `src/utils/importFormat.js` | 🟢 mới | `detectFormat`, `detectFormatError`, `estimateImportCount`, `looksLikePackingV1` (chuyển ra từ component) |
| `scripts/convert-packing-data.mjs` | 🟢 mới | CLI: đọc file → ghi thư mục output + `manifest.json` |
| `scripts/test-packingV1.mjs` | 🟢 mới | unit test converter |
| `scripts/test-importFormat.mjs` | 🟢 mới | unit test nhận diện định dạng |
| `src/components/ImportJsonButton.js` | 🟢 | import hàm thuần, siết `detectFormat` (AC-FMT-01/02) |
| `package.json` | 🟢 | `test:packing`, `test:format`, `convert:packing` |
| `specs/*`, `SPEC.md`, `AGENTS.md`, `tasks.md` | 🟢 | AC, data mapping, RC, changelog, registry |

## 6. Kế hoạch kiểm thử

- `scripts/test-packingV1.mjs`: dữ liệu tổng hợp (đủ case: 1 kiện, container 1 kiện, kiện trộn mã,
  PO không ép được, đếm kiện lệch, khoảng kiện lệch, `qty` lệch, rỗng, `packages` trùng số, gap số kiện)
  **+** chạy trên `src/data/packing_data.json` thật và đối chiếu `shipment_list`.
- `scripts/test-importFormat.mjs`: entries / packing list hợp lệ / `總表` / mảng lồng nhau / file vô
  dụng ⇒ `unknown`.
- Hồi quy: `npm test` (không hỏng ca cũ) · `npx expo lint` · `npx tsc --noEmit` · `npx expo export`.
- `RC-100..RC-104`: import 1 file `PO*.json` sinh ra trên máy thật.

## 7. Tiêu chí xong

- [ ] §10.4 `SPEC-rules.md` đầy đủ
- [ ] `npm test` — số ca mới đạt, **không hỏng** ca cũ
- [ ] Lint/typecheck/export sạch (0 lỗi mới)
- [ ] `RC-100..104` (máy thật)