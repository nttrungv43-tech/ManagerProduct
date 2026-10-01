# Tasks — production-tracker

## FEAT-08: Import dữ liệu từ JSON

> Phạm vi: Cấp 1 (thêm mới, không đổi schema, không breaking changes).
> Hỗ trợ 2 format: (a) Entries (nhật ký sản xuất), (b) Packing list (items/targets từ PO JSON như PO23492.json)
> Tham chiếu: SPEC.md §0 (quy trình), §10.1 (phân cấp), §10.4 (Definition of Done)

### Bước 0: Kiểm chuẩn tiền đề (DONE) ✅
- [x] Đọc SPEC.md §0, 3, 4.2, 5, 6, 7, 8, 9, 10, 11
- [x] Đọc codebase: db/queries.js, db/index.js, db/schema.js, store/useAppStore.js, screens/*, components/*
- [x] Xác nhận `expo-document-picker` v57.0.1 — Included in Expo Go (không cần native build)
- [x] Xác nhận `expo-file-system` v57.0.x — Included in Expo Go
- [x] Phân tích `src/data/ PO23492.json` — packing list với 14 NTK, 4,900 pcs, PO 23492

### Bước 1: Viết spec tính năng ✅
- [x] Tạo `specs/features/FEAT-08-import-json.md` theo mẫu SPEC.md §13

### Bước 2: Cài đặt dependency ✅
- [x] `npx expo install expo-document-picker expo-file-system`

### Bước 3: Thêm query functions (db/queries.js — 🔒 thêm mới) ✅
- [x] `importEntriesFromJson(batchId, entries)`: bulk INSERT (transaction); bỏ qua nếu ntk không tồn tại hoặc `qty≤0 && defectQty≤0`; trả `{imported, skipped}`
- [x] `importItemsFromJson(batchId, jsonData)`: parse packing list; INSERT OR REPLACE items (ntk, po, target); cập nhật `total_target` batch; trả `{imported, totalItems}`

### Bước 4: Thêm store action (store/useAppStore.js — 🟡) ✅
- [x] Thêm state: `dataVersion: 0`, `importStatus: 'idle'`, `importResult: null`
- [x] Thêm action `importFromJson(jsonData)`: tự động detect format → gọi query tương ứng → refreshItems → tăng dataVersion
- [x] Tăng `dataVersion` trong addEntry, updateEntry, removeEntry, finishOrder (fix BUG-05)

### Bước 5: Thêm component (src/components/ImportJsonButton.js — 🟢 mới) ✅
- [x] `ImportJsonButton({ onImport, theme })`:
  - `DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true })`
  - `FileSystem.readAsStringAsync` với `fetch` fallback (fix lỗi "Không thể đọc nội dung file")
  - `detectFormat()` tự động phân biệt entries vs packingList
  - Alert xác nhận (INV-U1), Alert kết quả (imported/skipped/totalItems)
  - Loading indicator khi đang xử lý

### Bước 6: Tích hợp UI (screens/ItemsScreen.js — 🟡) ✅
- [x] Import + render `ImportJsonButton` dưới header, trên SummaryCards
- [x] Pass `importFromJson` từ store

### Bưỏc 7: Cập nhật HistoryScreen (BUG-05) ✅
- [x] Thêm `dataVersion` vào useEffect dependency array

### Bước 8: Cập nhật SPEC.md ✅
- [x] §6.2: thêm `importItemsFromJson`, `importEntriesFromJson`
- [x] §6.3: thêm state + action `importFromJson`
- [x] §6.4: thêm `ImportJsonButton` props
- [x] §7.5: thêm AC-IMP-01..09
- [x] §7.3: AC-HIST-07 → ✅
- [x] §9: BUG-05 → ✅
- [x] §12.1/12.2: Registry + Backlog cập nhật
- [x] §15: Changelog thêm dòng v1.1

### Bước 9: Lint + Typecheck + Expo ✅
- [x] `npx expo lint` — 0 lỗi mới (2 errors + 4 warnings đều pre-existing)
- [x] `npx tsc --noEmit` — 1 lỗi pre-existing (`app-tabs.web.tsx`)
- [x] `npx expo start -c` — khởi động OK, không lỗi mới

### Bước 10: Verify logic (unit test bằng node) ✅
- [x] Packing list parser: PO23492.json → 14 NTK, 4,900 pcs ✅
- [x] Format detection: PO23492 → packingList, sample-import → entries, array → entries, invalid → unknown ✅

### Bước 11: Checklist hồi quy (§11.1) — cần chạy trên thiết bị
- [ ] RC-01: Cài mới, mở app
- [ ] RC-02: Nhập 1 entry thủ công
- [ ] RC-IMP-01: Pick file JSON entries → nhập → số liệu cập nhật
- [ ] RC-IMP-02: Pick PO23492.json → import items → total_target cập nhật
- [ ] RC-IMP-03: JSON lỗi → Alert, không ghi DB
- [ ] RC-IMP-04: Nhập xong → sang Lịch sử → dữ liệu cập nhật
- [ ] RC-IMP-05: Pick PO23492.json → import items + container data → ContainersScreen hiện 51 kiện, 3 container
- [ ] RC-IMP-06: Sau import packing list → tick kiện → finishOrder → batch archived giữ container_data, batch mới fallback seed
- [ ] RC-15: Hoàn tất đơn hàng
- [ ] RC-20: Tắt app, mở lại

---

## FEAT-08 Phase 2: Import container/pallet structure

> Phạm vi: Cấp 2 (thêm bảng `container_data`). Không sửa bảng/hàm hiện có, chỉ **thêm** mới và **mở rộng** (optional param có default).
> Mục tiêu: Packing list JSON (PO23492.json) import được cả cấu trúc container/pallet, hiển thị trên tab Container, thay thế `containersData` seed.

### Bước 12.1: Thêm bảng `container_data` (schema.js — 🔒 thêm mới)
- [x] Thêm `CREATE TABLE IF NOT EXISTS container_data` (batch_id PK, data TEXT, created_at) vào `CREATE_TABLES_SQL`

### Bước 12.2: Thêm query functions (queries.js — 🔒 thêm mới)
- [x] `importContainerData(batchId, jsonData)`: parse packing list → lưu JSON vào `container_data`; cập nhật `pallets_total` batch
- [x] `fetchContainerData(batchId)`: trả về containers array hoặc null
- [x] `countPalletsDoneWithData(palletDoneMap, containers?)`: dùng `containers` nếu có, fallback `containersData`
- [x] Cập nhật `finishOrder`: thêm optional param `containers?` → dùng `countPalletsDoneWithData` + cập nhật `pallets_total` batch mới

### Bước 12.3: Cập nhật store (useAppStore.js — 🟡)
- [x] Thêm state `containerData: null`
- [x] `init()`: gọi `q.fetchContainerData` để nạp container data
- [x] `importFromJson`: packing list → gọi `importItemsFromJson` + `importContainerData` + cập nhật state
- [x] `finishOrder()`: truyền `state.containerData` → `q.finishOrder`, reset `containerData: null`

### Bước 12.4: Cập nhật ContainersScreen (🟡)
- [x] Dùng `containerData` từ store (fallback `containersData`)
- [x] Dùng `countPalletsDoneWithData` thay `countPalletsDone`
- [x] Filter chips + render containers dùng `containerData || containersData`

### Bước 12.5: Cập nhật ImportJsonButton (🟢)
- [x] Thông báo packing list cập nhật: "Nhập N mã hàng + M container/kiện từ packing list"

### Bước 12.6: Lint + Typecheck + Regression
- [x] `npx expo lint` — 0 lỗi mới
- [x] `npx tsc --noEmit` — 1 lỗi pre-existing (`app-tabs.web.tsx`), 0 lỗi mới
- [x] `npx expo start -c` — khởi động OK
- [x] Node script: parse PO23492.json → 3 containers, 51 pallets, 14 NTK
- [x] Test logic: `countPalletsDoneWithData` — fallback seed (26), imported (51), tick đúng ✅

---

## Chia SPEC.md thành module (SPECS)

> Mục tiêu: Split SPEC.md (708 dòng) thành 8 file module trong `specs/` để AI agent dễ tra cứu.

### Checklist

- [x] Tạo `specs/SPEC-rules.md` (§0.1-0.3, §4.2, §8, §10.1, §10.4)
- [x] Tạo `specs/SPEC-api.md` (§6.1-6.5)
- [x] Tạo `specs/SPEC-acceptance.md` (§7.1-7.5)
- [x] Tạo `specs/SPEC-data.md` (§5.1-5.3, §10.1-10.2)
- [x] Tạo `specs/SPEC-test.md` (§11.1-11.2)
- [x] Tạo `specs/SPEC-reference.md` (§1, §2, §3, §4.1, §9, §12, §13.2, §14)
- [x] Tạo `specs/SPEC-changelog.md` (§15)
- [x] Tạo `specs/SPEC-template.md` (§13)
- [x] Chuyển SPEC.md (root) thành trang chủ/index
- [x] Cập nhật AGENTS.md trỏ tới module files

---

## FEAT-01: Form sửa nhật ký (Edit entry form)

> Phạm vi: Cấp 1 (thêm UI, không đổi schema hay signature).
> Nút "Sửa" đã có ở `EntryLogRow`; `editingId` state + `onUpdateEntry` props đã sẵn sàng. Chỉ cần thêm form inline.
> Tham chiếu: `SPEC-acceptance.md` §7.1 (AC-ITEM-11), `SPEC-api.md` §6 (updateEntry), `SPEC-data.md` §5.1 (entries table)

### Bước 13.1: Cập nhật spec (CHƯA SỬA CODE)
- [x] Cập nhật AC-ITEM-11 trong `SPEC-acceptance.md`: 🟡 → ✅ với chi tiết hành vi (form inline, validate, confirm, BUG-04 fix)
- [x] Cập nhật `SPEC-data.md`: ghi chú `updateEntry` đã hỗ trợ sửa entry (không cần migration)
- [x] Cập nhật `SPEC-api.md`: `ItemCard.onUpdateEntry` props đã tồn tại, chỉ cần dùng
- [x] Cập nhật `SPEC-reference.md` §12.2 backlog: FEAT-01 → "Đã cài đặt"

### Bước 13.2: Thêm edit form trong ItemCard (src/components/ItemCard.js — 🔒 thêm UI)
- [x] Khi `editingId === entry.id`: render inline form cùng layout với "Thêm" (qty, line picker, defectQty, defect type chips)
- [x] Pre-fill từ entry: `qty = entry.qty`, `line = entry.line`, `defectQty = entry.defect_qty`, `defectTypes` từ `entry.defect_types` (parse comma-string → object)
- [x] BUG-04 fix: chỉ gửi `defectTypes` khi `defectQty > 0` (defect_types join('') nếu defectQty=0)
- [x] Validate theo AC-ITEM-05: `qty ≤ 0 && defectQty ≤ 0` → không lưu
- [x] Save: Alert.confirm (INV-U1) → `onUpdateEntry(editingId, {date, qty, line, defectQty, defectTypes})` → `setEditingId(null)` → `loadEntries()`
- [x] Cancel: `setEditingId(null)`, discard changes

### Bước 13.3: Kiểm tra EntryLogRow (src/components/EntryLogRow.js — 🟢, đã có nút)
- [x] Nút "Sửa" đã có `onEdit` — không cần thay đổi
- [x] Nút "Xoá" đã có `onDelete` + Alert xác nhận — không thay đổi

### Bước 13.4: Verify data flow
- [x] ItemsScreen.js: đã truyền `onUpdateEntry={updateEntry}` ✓ (line 60)
- [x] Store `updateEntry`: gọi `q.updateEntry`, refresh, tăng `dataVersion` ✓
- [x] Query `updateEntry`: `UPDATE entries SET date, qty, line, defect_qty, defect_types WHERE id=?` ✓

### Bước 13.5: Breaking changes check
- [x] Không thêm bảng/cột (schema không đổi)
- [x] Không đổi signature hàm queries.js/store
- [x] `onUpdateEntry` props ItemCard đã tồn tại → chỉ dùng, không thêm
- [x] Form inline chỉ xuất hiện khi `editingId` set → không ảnh hưởng UI hiện tại
- [x] INV-B2: chỉ sửa entry của batch active (EntryLogRow fetch theo batchId)

### Bước 13.6: Lint + Typecheck + Regression
- [x] `npx expo lint` — 0 lỗi mới
- [x] `npx tsc --noEmit` — 0 lỗi mới
- [x] `npx expo start -c` — khởi động OK
- [ ] RC-02: Thêm entry mới → sửa entry → số liệu cập nhật đúng
- [ ] RC-IMP-04: Sửa entry → sang Lịch sử → data cập nhật (dataVersion)
- [ ] AC-ITEM-05 verify: qty=0 && defectQty=0 → không lưu

---

## FEAT-09: Kiểm tra hạn mức đơn đặt hàng + validate dữ liệu số

> Phạm vi: Cấp 1 (thêm hàm mới) + Cấp 3 (chặn ghi vào `entries`). **Không migration, không đổi chữ ký.**
> Spec: `specs/features/FEAT-09-validate-qty-limit.md`. Quyết định áp dụng: Q1–Q5 theo mặc định đề xuất trong spec §6.1.
> - Q1 `defect_qty` **không** tính vào hạn mức · Q2 `target=0` → **không** giới hạn · Q3 so sánh bằng `SUM(qty)` · Q4 cho phép sửa giảm · Q5 **không** có cờ ghi đè.

### Bước 14.1: Logic thuần (🟢 file mới)
- [x] `src/utils/validateQty.js`: `parseQty` (chuẩn hoá phân tách nghìn, từ chối số thực/âm/ký hiệu khoa học)
- [x] `checkQtyLimit` (`hasLimit=false` → luôn ok; `incomingQty≤0` → ok; trả `remaining`/`overBy`)
- [x] `formatQtyError` + nhãn tiếng Việt (`INVALID_QTY_TITLE`, `OVER_TARGET_TITLE`)

### Bước 14.2: Tầng DB (🔒 chỉ thêm, không đổi chữ ký)
- [x] `getItemTargetUsage(batchId, ntk, excludeEntryId?)` — trừ dòng đang sửa
- [x] `addEntry` / `updateEntry` kiểm tra trước khi ghi, trả `{ok, error?}`
- [x] `importEntriesFromJson` kiểm tra **tích luỹ** trong transaction, thêm `skippedOver`
- [x] Dùng `Map` cho danh sách hạn mức (tránh `ntk` trùng key `Object.prototype`)

### Bước 14.3: Store + UI
- [x] `useAppStore.addEntry` / `updateEntry` trả `{ok, error?}`, **không** tăng `dataVersion` khi bị chặn
- [x] `ItemCard.readNumber` — ô trống ⇒ 0 (giữ AC-ITEM-05), giá trị rác ⇒ `Alert` lỗi
- [x] `handleAdd` / `handleEditSave` — vượt hạn mức ⇒ `Alert`, **giữ nguyên** ô nhập / mở form sửa
- [x] `ImportJsonButton` — Alert kết quả có dòng "Vượt đơn đặt hàng: N mục bị bỏ qua"

### Bước 14.4: Test
- [x] `scripts/test-validateQty.mjs` — 44 ca, chạy bằng `npm test`
- [x] `npx expo lint` — 0 lỗi
- [x] `npx tsc --noEmit` — 0 lỗi mới (`app-tabs.web.tsx` là lỗi có sẵn từ trước)
- [x] `npx expo export --platform ios` — bundle 1187 modules, 0 lỗi

### Bước 14.5: Hồi quy thủ công (cần chạy trên máy — chưa làm)
- [ ] RC-23: mã `106160` nhập `900` → Còn lại `100`
- [ ] RC-24: nhập `200` → Alert chặn, ô nhập còn nguyên `200`
- [ ] RC-25: sửa thành `100` → Đã làm `1000`, `100%`
- [ ] RC-26: nhập `1` → Alert chặn
- [ ] RC-27: sửa dòng `900` → `1200` → Alert chặn, form sửa vẫn mở
- [ ] RC-28: sửa dòng `900` → `800` → cho phép
- [ ] RC-29: nhập `abc`, `-5`, `1.5` → Alert lỗi giá trị số
- [ ] RC-30: import JSON vượt hạn mức → Alert có dòng đếm mục bị bỏ qua
- [ ] RC-31: tắt/mở app → dữ liệu nguyên vẹn
- [ ] RC cũ: RC-01..06, RC-11, RC-12, RC-20, RC-22

---

## FEAT-10: Thêm / sửa / xoá sản phẩm, số lượng và kiện (pallet)

> **TRẠNG THÁI: ĐÃ CÀI ĐẶT (v1.5).** Spec: `specs/features/FEAT-10-edit-items-pallets.md`
> Các quyết định Q1–Q8 áp dụng theo **khuyến nghị mặc định** trong spec §6.1: Q1 = PA A (khoá theo `ntk`) · Q2 chặn · Q3 chặn · Q4 cấm đổi `no` · Q5 cảnh báo ghi đè · Q6 chọn PO có sẵn · Q7 không đồng bộ `target` · Q8 không thêm cột `source`.
> Phạm vi: **Cấp 2** (thay đổi dữ liệu, có thể cần migration) + **Cấp 3** (sửa hành vi `pallet_status`/`isPalletDone`).
> ⚠️ **Bắt buộc trả lời Q1 trước khi làm Bước 15.3.** Q1 = định dạng khoá pallet; quyết định này chi phối cả phần kiện.
> Phụ thuộc: FEAT-08 phase 2 (`container_data`), FEAT-09 (`items.target` là hạn mức, `parseQty` để tái dùng).

### Bước 15.0: Chốt quyết định (BLOCKER — làm trước mọi thứ)
- [ ] **Q1** ⭐ Khoá pallet: giữ `${cid}-${no}-${idx}` (INV-D4) hay đổi `${cid}-${no}-${ntk}`? *(khuyến nghị: đổi sang `ntk`)*
- [ ] Q2 Cho phép sửa `target` xuống dưới số đã sản xuất? *(khuyến nghị: không — chặn)*
- [ ] Q3 Xoá mã hàng đã có nhật ký? *(khuyến nghị: chặn)*
- [ ] Q4 Cho đổi số hiệu kiện `no`? *(khuyến nghị: cấm ở v1)*
- [ ] Q5 Import lại packing list sau khi sửa kiện tay? *(khuyến nghị: cảnh báo + xác nhận ghi đè)*
- [ ] Q6 Thêm mã hàng: chọn PO có sẵn hay tự nhập? *(khuyến nghị: chọn có sẵn)*
- [ ] Q7 Sửa số lượng trong kiện có tự cập nhật `items.target`? *(khuyến nghị: không — nới `INV-D1` thành cảnh báo)*
- [ ] Q8 Cần phân biệt mã "thêm tay" với "từ import"? *(khuyến nghị: không ở v1)*
- [ ] Cấp 3 đã được chủ dự án chấp thuận? (sửa hành vi `pallet_status`/`isPalletDone`)

### Bước 15.1: Cập nhật spec (chưa sửa code)
- [x] Sửa `specs/features/FEAT-10-edit-items-pallets.md` §6.1 theo câu trả lời Q1–Q8
- [x] Bỏ nhãn DRAFT trong `FEAT-10-*.md`; cập nhật AC-EDIT-17/18 nếu Q1 = phương án B/C
- [x] Chốt `INV-D1` (giữ cho seed tĩnh) và `INV-D4` (định dạng khoá mới) trong `SPEC-rules.md` §8
- [x] Điền Q1 vào `SPEC-data.md` §5.5.2 và `SPEC-api.md` §6.2.2
- [x] Thêm migration vào `SPEC-data.md` §10.2 nếu Q1 = PA A
- [x] Bỏ nhãn DRAFT ở `SPEC-acceptance.md` §7.6, `SPEC-changelog.md`

### Bước 15.2: Helper thuần + unit test (🟢 file mới, làm trước UI)
- [x] Tạo `src/utils/palletKey.js` (🟢): `palletKey()`, `remapPalletStatus()`, `recalcPalletTotals()`
- [x] Bổ sung vào `scripts/test-validateQty.mjs` (hoặc tách `scripts/test-palletKey.mjs`): khoá 1 loại / nhiều loại, remap khi xoá dòng giữa, remap khi 1 loại → nhiều loại
- [x] `npm test` đạt

### Bước 15.3: Migration `pallet_status` (🔒 — chỉ khi Q1 = PA A)
- [x] Tạo `src/db/migrations.js` (🟢) với `MIGRATIONS` + `runMigrations(db)` theo `SPEC-data.md` §10.2
- [x] Migration v2: PK `(key, order_batch_id)` (**BUG-01**) + chuyển khoá sang `ntk` (đọc `container_data.data` bằng JS để ánh xạ khoá)
- [x] Giữ bảng cũ thành `pallet_status_bak_v1` trước khi `DROP` (đường lùi; chỉ ghi lần đầu, không đè bản sao cũ)
- [x] Gọi `runMigrations` trong `getDb()` (`src/db/index.js`) trước khi truy vấn
- [x] Sửa `setPalletStatus` → `ON CONFLICT(key, order_batch_id)`; sửa `isPalletDone` dùng khoá mới
- [ ] ⛔ **Chưa chạy được** RC-46 trên bản sao DB thật — cần máy/emulator thật, không có trong môi trường code-only. **Phải chạy trước khi phát hành.**

### Bước 15.4: Query layer — sản phẩm (🔒 chỉ thêm hàm)
- [x] `recalcBatchTarget(batchId)`
- [x] `addItem(batchId, {ntk, po, target})` — validate `ntk` `[0-9A-Za-z]+`, `target` qua `parseQty`, chặn trùng
- [x] `updateItem(batchId, ntk, {po, target})` — chặn `target < SUM(entries.qty)`
- [x] `removeItem(batchId, ntk)` — chặn nếu có `entries`; chặn nếu `ntk` còn trong `container_data` (INV-V2)
- [x] Mọi hàm ghi `total_target` trong **cùng transaction**

### Bước 15.5: Query layer — kiện (🔒 chỉ thêm hàm)
- [x] `materializeContainers(batchId)` — nạp seed vào DB giữ nguyên `id` `c1`/`c2`/`c3`
- [x] `getContainerDataForWrite(batchId)` — parse JSON, lỗi ⇒ ném, **không** ghi nửa
- [x] `addPallet(batchId, containerId, {no, items})` + tính lại `pallets_total`
- [x] `updatePallet(batchId, containerId, palletNo, {items})` — remap `pallet_status` trong cùng transaction (INV-P1)
- [x] `removePallet(batchId, containerId, palletNo)` — xoá JSON + `DELETE pallet_status` + tính lại `pallets_total`
- [x] Tất cả thao tác kiện nằm trong **một** `withTransactionAsync`

### Bước 15.6: Store (🔒 chỉ thêm action)
- [x] `addItem` / `updateItem` / `removeItem` → `{ok, error?}`; thành công thì `refreshItems()` + `dataVersion++`
- [x] `addPallet` / `updatePallet` / `removePallet` → nạp lại `containerData` + `palletDoneMap` + `dataVersion++`
- [x] **Không** thêm state toàn cục mới; form mở/đóng là state cục bộ

### Bước 15.7: UI — sản phẩm (🟡)
- [x] Tạo `src/components/ItemEditSheet.js` (🟢): thêm/sửa/xoá, `ntk`, `po` (chọn từ `pos`), `target` (dùng `parseQty`)
- [x] `ItemsScreen`: nút "＋ Thêm mã hàng" (AC-EDIT-01)
- [x] `ItemCard`: nút Sửa / Xoá (AC-EDIT-08), Alert xác nhận xoá (INV-U1)
- [x] Cảnh báo "không thuộc PO đang lọc" (AC-EDIT-11)
- [x] Ẩn nút sửa/xoá trên thẻ lưu trữ (AC-EDIT-13, INV-B2)

### Bước 15.8: UI — kiện (🟡)
- [x] Tạo `src/components/PalletEditSheet.js` (🟢): `no` (cấm đổi ở v1), các dòng `{ntk, qty}`, `ntk` chỉ chọn từ `items`
- [x] `ContainersScreen`: nút "＋ Thêm kiện" trong từng container (AC-EDIT-14)
- [x] `PalletRow`: nút Sửa / Xoá (AC-EDIT-19), Alert nêu số pcs mất
- [x] Cảnh báo kiện chứa `ntk` không có trong `items` (AC-EDIT-23)

### Bước 15.9: Tương tác với import (🟡)
- [x] `ImportJsonButton`: nếu batch đã có `container_data` **do sửa tay** → cảnh báo ghi đè (AC-EDIT-25)
- [x] `importItemsFromJson`: **đã phân tích, không cần đổi code** — `INSERT OR REPLACE` chỉ chạm các `ntk` có trong file; mã hàng thêm tay không nằm trong packing list được giữ nguyên cùng `total_target`

### Bước 15.10: Verify
- [x] `npm test` — 0 lỗi
- [x] `npx expo lint` — 0 lỗi
- [x] `npx tsc --noEmit` — 0 lỗi mới
- [x] `npx expo export --platform ios` — bundle sạch
- [ ] Hồi quy thủ công: **RC-07..10, RC-14..18** (Container — rủi ro cao nhất), RC-01..06 (Mã hàng), RC-11/12 (Lịch sử), RC-20
- [ ] RC mới: **RC-32..46**

### Bước 15.11: Breaking changes cần thông báo
- [x] Ghi rõ trong `SPEC-changelog.md` + `SPEC-api.md` phần "hành vi đổi"
- [x] Cập nhật `ADR-06`/`DEBT-02` nếu seed đã được vật chất hoá

---

## Các task tiếp theo
- **FEAT-11** (DRAFT, chờ duyệt spec) — xem cuối file
- FEAT-02: Lọc lịch sử theo ngày/tháng/năm
- BUG-02/03: sửa lỗi mục 9 (BUG-01 đã fix trong migration v2 của FEAT-10)

---

# FEAT-11 — Nút xoá mã hàng trực tiếp trên thẻ (tab Mã hàng)

> **TRẠNG THÁI: ĐÃ CÀI ĐẶT (v1.5).** Spec: `specs/features/FEAT-11-delete-item-quick.md`
> Cấp thay đổi **1 (UI-only)** — không schema, không migration, không đổi chữ ký hàm.
> Bối cảnh: xoá mã đã có đầy đủ ở FEAT-10 nhưng phải qua 4 chạm; FEAT-11 rút xuống 2 chạm.
> Đã chốt (chủ dự án): thêm nút Xoá trực tiếp trên thẻ. **Không** làm xoá hàng loạt, **không** làm undo.

## Bước 16.1 — Duyệt spec
- [x] Chủ dự án duyệt mục 1–5 của `FEAT-11-delete-item-quick.md`
- [x] Xác nhận giữ nguyên nút xoá trong `ItemEditSheet` (không bỏ)
- [x] Xác nhận nhãn nút: `✕ Xoá mã hàng` (màu `theme.bad`)

## Bước 16.2 — Tách helper dùng chung (🟢)
- [x] Tạo `src/utils/deleteItem.js`: `ITEM_ERROR_MESSAGES`, `itemErrorMessage(code)`, `confirmDeleteItem({item, onDelete})`
- [x] `confirmDeleteItem` dùng `Alert.alert('Xác nhận', \`Xoá mã {ntk}?\`, [Huỷ, Xoá])`
- [x] Thành công → im lặng; `{ok:false}` → `Alert.alert('Không xoá được', itemErrorMessage(error))`
- [x] Sửa `ItemEditSheet.js` dùng helper → xoá `itemErrorMessage` + `Alert` trùng lặp (giữ nguyên props & UI)
- [x] AC-EDIT-33/34: thẻ và sheet dùng **cùng** nguồn thông báo

## Bước 16.3 — Nút xoá trên thẻ (🟡)
- [x] `ItemCard.js`: thêm prop **tuỳ chọn** `onDeleteItem` (không phá chữ ký cũ)
- [x] Render nút `✕ Xoá mã hàng` cạnh nút `✎ Sửa`, màu `theme.bad`, cùng cỡ chữ 12.5
- [ ] Bọc trong `{onDeleteItem && (...)}` → không truyền thì **không** hiện (AC-EDIT-35)
- [x] `onPress` gọi `confirmDeleteItem({ item, onDelete: onDeleteItem })` — **không** gọi thẳng `removeItem` (INV-U1)

## Bước 16.4 — Nối vào màn hình
- [x] `ItemsScreen.js`: truyền `onDeleteItem={removeItem}` cho mọi `ItemCard`
- [x] Chỉ truyền khi batch `active` → batch `archived` không hiện nút (AC-EDIT-32, INV-B2/V3)
- [x] Không thêm state toàn cục mới

## Bước 16.5 — Bổ sung bất biến
- [x] `INV-V3` đã có trong `specs/SPEC-rules.md` §8 — rà lại cho khớp

## Bước 16.6 — Kiểm thử tự động
- [x] Tạo `scripts/test-deleteItem.mjs`: `itemErrorMessage()` đúng chuỗi cho 4 mã lỗi, mã lạ ⇒ thông báo chung
- [x] `package.json`: thêm `"test:delete": "node --no-warnings scripts/test-deleteItem.mjs"`
- [x] Sửa `npm test` chạy thêm script mới
- [x] `npm test` — 0 lỗi (72 ca cũ + ca mới, **không được hỏng ca cũ**)

## Bước 16.7 — Kiểm tra chất lượng
- [x] `npx expo lint` — 0 lỗi
- [x] `npx tsc --noEmit` — 0 lỗi mới (lỗi có sẵn ở `app-tabs.web.tsx:27` được phép tồn tại)
- [x] `npx expo export --platform ios` — bundle sạch

## Bước 16.8 — Hồi quy (bắt buộc)
- [ ] ⛔ **Chưa chạy được** — Chạy lại toàn bộ **AC-EDIT-01..36** (không được phá AC nào của FEAT-10) _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — Chạy lại `AC-ITEM-11/17/18/19` (lọc PO, hạn mức) _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — RC-01, RC-02, RC-IMP-02, RC-IMP-05, RC-15, RC-20 _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-47**: nút `✕ Xoá mã hàng` hiện trên mọi thẻ _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-48**: bấm ✕ → Alert đúng tên mã → **Huỷ** → không đổi gì _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-49**: bấm ✕ → **Xoá** → mã biến mất, tổng giảm đúng, tắt/mở app vẫn mất _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-50**: mã đã có nhật ký → chặn `ITEM_HAS_ENTRIES` _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-51**: mã đang có trong kiện → chặn, hiện số kiện _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-52**: xoá khi đang lọc PO → danh sách không lệch _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-53**: nút xoá trong sheet vẫn chạy, thông báo giống hệt thẻ _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-54**: xoá rồi `finishOrder` → batch `archived` giữ dữ liệu đã xoá, batch mới sinh từ seed _(cần máy/emulator thật)_

## Bước 16.9 — Đóng gói & tài liệu
- [x] Bỏ nhãn DRAFT trong `FEAT-11-delete-item-quick.md`; đánh dấu ✅ AC-EDIT-26..36
- [x] Cập nhật `SPEC-changelog.md`, `SPEC-reference.md` §12 Registry, `SPEC.md`
- [x] Ghi rõ: **không có breaking change** (Cấp 1, không migration, không đổi chữ ký)
- [ ] Đánh dấu ✅ toàn bộ checklist mục 16.1–16.9 ở trên

---

# FEAT-12 — Bảng tổng số lượng theo từng đơn hàng PO

> **TRẠNG THÁI: ĐÃ CÀI ĐẶT (v1.5).** Spec: `specs/features/FEAT-12-po-summary.md`
> Cấp thay đổi **1 (UI-only + hàm thuần)** — không schema, không migration, không đổi chữ ký.
> Yêu cầu: hiển thị **tổng số lượng**, **đã sản xuất** và **còn lại** của **từng đơn hàng PO**.
> Đã chốt (chủ dự án): bảng đặt **dưới `SummaryCards`**; mã thuộc **nhiều PO** gom vào
> nhóm `Nhiều PO` riêng (không cộng vào từng PO) ⇒ Σ dòng luôn khớp tổng toàn đơn.

## Bước 17.1 — Duyệt spec
- [x] Chủ dự án duyệt mục 1–5 của `FEAT-12-po-summary.md`
- [x] Xác nhận dòng PO không có mã riêng vẫn hiện `0 / 0 / 0` (AC-ITEM-24) — hoặc yêu cầu ẩn
- [x] Xác nhận bảng **không** đổi theo bộ lọc (AC-ITEM-25)
- [x] Xác nhận không thêm cột Hàng lỗi vào bảng PO (non-goal)

## Bước 17.2 — Hàm thuần `poSummaries()` (🟢)
- [x] Tạo `src/utils/poSummary.js`: `MULTI_PO_LABEL`, `poRowLabel(group)`, `poSummaries(items)`
- [x] `po` không có `+` ⇒ cộng vào nhóm tên `po`
- [x] `po` có `+` ⇒ **không** cộng vào PO nào, gom vào nhóm `Nhiều PO`, `isMulti: true`
- [x] `A+B` và `B+A` phải vào **cùng** một nhóm `Nhiều PO`
- [x] Trường mỗi nhóm: `target, produced, remaining = Σ max(target − produced, 0), defect, itemCount, pct`
- [x] Sắp xếp `target` giảm dần, bằng nhau thì `label` tăng dần (AC-ITEM-26)
- [x] Chống lỗi: `produced`/`defect` ép `|| 0`; `target = 0` ⇒ `pct = 0`, **không** chia (AC-ITEM-28)
- [x] Không đụng `summaryTotals` / `allPOs` / `filteredItems`

## Bước 17.3 — Component bảng (🟢)
- [x] Tạo `src/components/PoSummaryTable.js`, props `{summaries, theme}`
- [x] Tiêu đề `Tổng theo PO`; cột `PO` · `Tổng` · `Đã sản xuất` · `Còn lại`
- [x] Nhãn dòng nhiều PO: `Nhiều PO (n mã)` qua `poRowLabel()`
- [x] Số dùng `toLocaleString()` như `SummaryCards`
- [x] `summaries` rỗng ⇒ hiện `Chưa có mã hàng.` (AC-ITEM-27)
- [x] Chỉ dùng token `theme`, không hard-code màu (AC-ITEM-29)

## Bước 17.4 — Gắn vào màn hình (🟡)
- [x] `ItemsScreen.js`: `const poRows = useMemo(() => poSummaries(items), [items])`
- [x] Render `<PoSummaryTable summaries={poRows} theme={theme} />` **ngay dưới** `<SummaryCards>` (AC-ITEM-20)
- [x] **Không** sửa `SummaryCards.js` — 4 ô tổng toàn cục giữ nguyên (AC-ITEM-01)
- [x] `useMemo` phụ thuộc `items` ⇒ tự cập nhật sau nhật ký / thêm / sửa / xoá mã (AC-ITEM-27)

## Bước 17.5 — Bổ sung bất biến
- [x] `INV-D6` đã có trong `specs/SPEC-rules.md` §8 — rà lại cho khớp

## Bước 17.6 — Kiểm thử tự động
- [x] Tạo `scripts/test-poSummary.mjs`
- [x] Ca 1: gom nhóm cơ bản; Ca 2: quy tắc nhiều PO (`A+B` không cộng vào A hay B)
- [x] Ca 3: 2 mã cùng nhiều PO ⇒ vẫn **một** nhóm; Ca 4: `A+B` vs `B+A` ⇒ cùng nhóm
- [x] Ca 5: `remaining` âm ⇒ 0; Ca 6: `target = 0` ⇒ `pct = 0` không crash; Ca 7: mảng rỗng ⇒ `[]`
- [x] Ca 8: sắp xếp giảm dần, bằng nhau thì tên tăng dần
- [x] Ca 9: **Σ dòng == tổng toàn cục** dùng đúng bộ số seed: 0 + 1.980 + 6.050 = **8.030** (AC-ITEM-23)
- [x] `package.json`: thêm `"test:po": "node --no-warnings scripts/test-poSummary.mjs"` + vào `npm test`
- [x] `npm test` — 0 lỗi, **không được hỏng ca cũ** (114 ca)

## Bước 17.7 — Kiểm tra chất lượng
- [x] `npx expo lint` — 0 lỗi
- [x] `npx tsc --noEmit` — 0 lỗi mới (lỗi có sẵn ở `app-tabs.web.tsx:27` được phép tồn tại)
- [x] `npx expo export --platform ios` — bundle sạch

## Bước 17.8 — Hồi quy (bắt buộc)
- [ ] ⛔ **Chưa chạy được** — Chạy lại **AC-ITEM-01..19** (đặc biệt AC-ITEM-01 tổng toàn cục, AC-ITEM-13 chip PO) _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — Chạy lại **AC-EDIT-01..36** (không được phá FEAT-10/11) _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — RC-01, RC-02, RC-IMP-02, RC-IMP-05, RC-15, RC-20 _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-55**: bảng dưới 4 ô, 3 dòng `2600168`=0 / `2600189`=1.980 / `Nhiều PO (5 mã)`=6.050, tổng khớp 8.030 _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-56**: nhập 300 pcs cho mã của `2600189` ⇒ Đã SX = 300, Còn lại = 1.680, cập nhật ngay _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-57**: lọc PO `2600189` ⇒ bảng **không đổi**, danh sách thẻ còn 3 mã _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-58**: thêm mã thuộc PO `2600168` ⇒ dòng `2600168` có số riêng, `Nhiều PO` không đổi _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-59**: thêm mã `po = '2600168+2600189'` ⇒ `Nhiều PO` thành **6 mã**, 2 dòng PO không đổi _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-60**: sửa số lượng mã (FEAT-10) ⇒ bảng cập nhật ngay _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-61**: xoá mã (FEAT-11) ⇒ bảng cập nhật ngay; nhóm rỗng thì về 0 _(cần máy/emulator thật)_
- [ ] ⛔ **Chưa chạy được** — **RC-62**: `finishOrder` ⇒ batch mới về đúng số seed; batch `archived` không bị sửa (INV-B2) _(cần máy/emulator thật)_

## Bước 17.9 — Đóng gói & tài liệu
- [x] Bỏ nhãn DRAFT trong `FEAT-12-po-summary.md`; đánh dấu ✅ AC-ITEM-20..29
- [x] Cập nhật `SPEC-changelog.md`, `SPEC-reference.md`, `SPEC.md`
- [x] Ghi rõ: **không có breaking change** (Cấp 1, dữ liệu dẫn xuất, không migration, không đổi chữ ký)
- [ ] Đánh dấu ✅ toàn bộ checklist mục 17.1–17.9 ở trên
