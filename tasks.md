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

---

# FEAT-13 — Xoá mã hàng: xoá 1 mã, xoá nhiều mã, xoá toàn bộ mã của một PO

> **TRẠNG THÁI: ĐÃ CÀI ĐẶT (v1.6).** Spec: `specs/features/FEAT-13-delete-items-by-po.md`
> Cấp thay đổi **1 (chỉ thêm)** — không bảng/cột mới, **không migration**, không đổi chữ ký hàm hiện có.
> Phụ thuộc: FEAT-10 (`removeItem`, `recalcBatchTarget`), FEAT-11 (`utils/deleteItem.js` — nguồn thông báo xoá),
> FEAT-12 (`allPOs`, `PoSummaryTable`). Nguyên tắc giữ nguyên: **một nguồn thông báo duy nhất**.
> Rủi ro chính đã xử lý: mã **thuộc nhiều PO** (`po` có `+`), mã **đã có nhật ký**, mã **đang nằm trong kiện**,
> và việc PO bị xoá hết ⇒ mất chip lọc PO + dòng bảng PO.

## Bước 18.0 — Chốt quyết định ✅ (áp dụng khuyến nghị mặc định)
- [x] **Q1** Mã **thuộc nhiều PO** (`po = 'A+B'`) khi xoá theo PO A ⇒ **KHÔNG xoá** — bỏ qua, báo riêng "n mã thuộc nhiều PO", để PO còn giữ mã
- [x] **Q2** Mã **đã có nhật ký** / **đang trong kiện** ⇒ **chặn toàn bộ**, không xoá dòng nào, báo đủ danh sách mã bị chặn + lý do
- [x] **Q3** Chế độ **ghi đè** ⇒ **KHÔNG** ở v1 (phá `INV-D5`, là Cấp 3 — cần chỉ đạo riêng nếu muốn)
- [x] **Q4** Phạm vi ⇒ chỉ **xoá toàn bộ mã của 1 PO** đã chọn; "xoá mã đang lọc" để backlog
- [x] **Q5** PO đang lọc bị xoá hết mã ⇒ **tự chuyển chip lọc về "Tất cả PO"**
- [x] **Q6** PO mất hết mã ⇒ chip lọc PO và dòng bảng PO **biến mất** (dẫn xuất từ `items` — đã ghi rõ ở AC-DEL-09)

## Bước 18.1 — Viết spec tính năng ✅
- [x] Tạo `specs/features/FEAT-13-delete-items-by-po.md`: bối cảnh, mục tiêu, **non-goal**, Q1–Q6 + câu trả lời, AC, ảnh hưởng breaking, kế hoạch test
- [x] Non-goal ghi rõ: không undo · không xoá mã nhiều PO ở v1 · không chế độ ghi đè nhật ký · không xoá theo bộ lọc tìm kiếm

## Bước 18.2 — Cập nhật spec module ✅
- [x] `specs/SPEC-acceptance.md`: thêm **§7.7** với `AC-DEL-01..AC-DEL-12` (đều ✅)
- [x] `specs/SPEC-api.md`: thêm **§6.2.1d** (`utils/deleteItemsByPo.js`) và **§6.2.3** (`previewItemsByPo`, `removeItemsByPo`); cập nhật **§6.3** (action store) và **§6.4** (props `PoDeleteSheet`)
- [x] `specs/SPEC-data.md`: thêm **§5.7** — không bảng/cột/index mới, `total_target` tính lại cùng transaction, không đụng `entries`/`container_data`/`pallet_status`
- [x] `specs/SPEC-rules.md` §8: thêm **INV-V4** (chỉ batch `active`; all-or-nothing; không xoá mã nhiều PO; `total_target` khớp `Σ items.target`)
- [x] `specs/SPEC-test.md`: thêm **RC-63..RC-72** + ca unit test FEAT-13
- [x] `specs/SPEC-reference.md`: FEAT-13 vào §12.1 + §12.2, bản đồ file, DEBT-03; `SPEC-changelog.md` thêm dòng **v1.6**; `SPEC.md` (phiên bản 1.6 + Registry)

## Bước 18.3 — Logic thuần ✅ (`src/utils/deleteItemsByPo.js`, làm trước UI)
- [x] Mã lỗi riêng: `INVALID_PO`, `PO_NO_ITEMS`, `PO_HAS_ENTRIES`, `PO_ITEMS_IN_PALLETS` (không trùng `ITEM_*`)
- [x] `splitPo(po)` — tách theo `+`, trim, bỏ rỗng, **cùng cách** với `allPOs()`/`filteredItems()`
- [x] `isMultiPoItem(po)`, `selectItemsByPo(items, po, { excludeMulti = true })` → `{ matched, multi, totalTarget, itemCount }`
- [x] `poFilterNeedsReset(activeFilter, items)` cho Q5
- [x] `bulkDeleteConfirmMessage(po, preview)` — tên PO + số mã + tổng pcs (**phân tách nghìn kiểu VN**, không phụ thuộc `toLocaleString`) + "không thể hoàn tác"
- [x] `formatBulkDeleteError(error)` — dịch từng mã bị chặn qua `itemErrorMessage()`; > 3 mã ⇒ gom `… và N mã khác.`
- [x] `confirmDeleteItemsByPo({ po, preview, onDelete, alert, onBusy, onSuccess })` — không import `react-native`, nhận `alert` từ caller (tránh lỗi `Alert` class)
- [x] Tái dùng `itemErrorMessage()` + `DELETE_*` của `deleteItem.js` — **không** copy bảng dịch lỗi
- [x] Export thêm `GENERIC_ERROR` từ `deleteItem.js` (bổ sung, không đổi hành vi) để hai module không lặp chuỗi

## Bước 18.4 — Query layer ✅ (`src/db/queries.js` — 🔒 chỉ **thêm** hàm)
- [x] `normalizePo(po)` — PO phải là **một PO đơn lẻ**, chuỗi có `+` ⇒ `INVALID_PO`
- [x] `collectPoDeletePlan()` (nội bộ) — dùng **chung** cho preview và xoá ⇒ preview không thể lệch kết quả thật
- [x] `previewItemsByPo(batchId, po)` → `{ok, po, matched, multi, totalTarget, itemCount, blocked, canDelete}`; chỉ đọc, dùng `fetchContainersView` (không vật chất hoá seed)
- [x] `removeItemsByPo(batchId, po)` → `{ok:true, po, removed, removedTarget, skippedMulti}` hoặc `{ok:false, error}`
- [x] **Một** `withTransactionAsync`: `DELETE … WHERE order_batch_id = ? AND ntk IN (?,…)` → `recalcBatchTargetInTx` (INV-V4)
- [x] `IN (…)` dựng từ `map(() => '?')` — không nội suy chuỗi; lọc PO bằng **JS** (không `LIKE '%PO%'`)
- [x] Kiểm tra **tất cả** mã trước khi `DELETE`: có nhật ký / còn trong kiện ⇒ trả lỗi, **không** xoá dòng nào
- [x] **Không** sửa `removeItem()` — giữ nguyên chữ ký + hành vi

## Bước 18.5 — Store ✅ (`src/store/useAppStore.js` — 🔒 chỉ **thêm** action)
- [x] `previewDeleteByPo(po)` → `q.previewItemsByPo(batchId, po)`
- [x] `removeItemsByPo(po)` → `q.removeItemsByPo(batchId, po)`; thành công thì `refreshItems()` + `dataVersion++`
- [x] **Không** thêm state toàn cục mới; **không** đổi tên state/action hiện có

## Bước 18.6 — Component ✅ (`src/components/PoDeleteSheet.js`)
- [x] Props `{ pos, selectedPo, preview, loading, busy, onSelectPo, onClose, onConfirm, theme }` — chỉ render, không truy vấn
- [x] Picker chọn PO + preview: `Xoá {n} mã · giảm {t} pcs`, danh sách mã, cảnh báo mã nhiều PO, cảnh báo mã bị chặn
- [x] Rỗng ⇒ `Không có mã hàng nào thuộc PO này.` và **khoá** nút `Xoá cả PO`
- [x] Nút `Xoá cả PO` màu `theme.bad`; nhãn `Huỷ` lấy từ `deleteItem.js` (không lệch với xoá 1 mã)
- [x] Chỉ dùng token `theme` (ngoại lệ `#fff` trên nền `bad`)

## Bước 18.7 — Gắn vào màn hình ✅ (`src/screens/ItemsScreen.js`)
- [x] Nút `🗑 Xoá theo PO` cạnh `＋ Thêm mã hàng`, **chỉ** hiện khi `state.batchId` có giá trị (INV-V3)
- [x] Mở sheet (mặc định chọn PO đang lọc, không thì PO đầu tiên) → `previewDeleteByPo` → truyền `preview`
- [x] `onConfirm` → `confirmDeleteItemsByPo` → thành công đóng sheet; PO đang lọc hết mã ⇒ `setFilter('all')` (Q5)
- [x] Thêm lại `View` vào import react-native (dùng cho hàng nút, không phải refactor ngoài phạm vi)

## Bước 18.8 — Kiểm thử tự động ✅
- [x] Tạo `scripts/test-deleteItemsByPo.mjs` — 10 nhóm, **65 ca**
- [x] `package.json`: thêm `"test:deletePo"` + vào `npm test`
- [x] `npm test` — **235 ca đạt** (44 + 28 + 42 + 56 + 65), **không hỏng ca cũ**

## Bước 18.9 — Chất lượng ✅
- [x] `npm test` — 0 lỗi
- [x] `npx expo lint` — 0 lỗi (đã sửa 1 lỗi mới: thiếu import `View`)
- [x] `npx tsc --noEmit` — 0 lỗi mới (lỗi có sẵn ở `app-tabs.web.tsx:27` được phép tồn tại)
- [x] `npx expo export --platform ios` — bundle sạch

## Bước 18.10 — Hồi quy (bắt buộc) ⛔ chưa chạy được
> Môi trường code-only không có máy/emulator thật ⇒ **phải chạy trước khi phát hành**.

- [ ] ⛔ RC-63: chọn PO có 3 mã sạch → preview đúng số mã + tổng target _(máy thật)_
- [ ] ⛔ RC-64: bấm Xoá → **Huỷ** ⇒ không đổi gì, `dataVersion` không tăng _(máy thật)_
- [ ] ⛔ RC-65: xác nhận → mã biến mất, `Kế hoạch` giảm đúng bằng `Σ target`, bảng PO cập nhật _(máy thật)_
- [ ] ⛔ RC-66: PO có mã **đã có nhật ký** ⇒ Alert chặn, không mất mã nào _(máy thật)_
- [ ] ⛔ RC-67: PO có mã **đang trong kiện** ⇒ Alert nêu số kiện, dữ liệu nguyên vẹn _(máy thật)_
- [ ] ⛔ RC-68: PO chứa mã **nhiều PO** ⇒ mã đó **không** bị xoá, có dòng "Bỏ qua n mã" _(máy thật)_
- [ ] ⛔ RC-69: xoá xong PO đang lọc ⇒ chip về "Tất cả PO", không kẹt màn hình trống _(máy thật)_
- [ ] ⛔ RC-70: PO hết mã biến mất khỏi chip + bảng PO; PO khác không đổi _(máy thật)_
- [ ] ⛔ RC-71: tắt app, mở lại ⇒ mã đã xoá vẫn mất, `total_target` khớp `Σ items.target` _(máy thật)_
- [ ] ⛔ RC-72: `finishOrder` sau khi xoá ⇒ batch `archived` giữ dữ liệu đã xoá, batch mới sinh từ seed _(máy thật)_
- [ ] ⛔ Hồi quy cũ: **AC-EDIT-01..36** (đặc biệt 08/09/10/27/33/34), **AC-ITEM-01/13/20/23/24/25/26/27**, RC-01..06, RC-20 _(máy thật)_

## Bước 18.11 — Kiểm tra breaking changes ✅
- [x] Không thêm bảng/cột/index ⇒ **không migration**, không rủi ro mất dữ liệu
- [x] Không đổi chữ ký `removeItem`, `addItem`, `updateItem`, `removeEntry` (`queries.js` L190-226 giữ nguyên)
- [x] Không đổi tên state/action hiện có trong store ⇒ caller cũ chạy đúng
- [x] Nhãn/thông báo dùng chung `utils/deleteItem.js` ⇒ AC-EDIT-33/34 không lệch
- [x] Ghi rõ trong `SPEC-changelog.md`: điểm **dễ nhầm** là `AC-ITEM-13/23/24` (PO biến mất khi hết mã) và `AC-EDIT-09/10` (chặn xoá) — thay đổi hành vi **dẫn xuất**, không phải breaking API

## Bước 18.12 — Đóng gói & tài liệu ✅
- [x] Bỏ nhãn DRAFT trong `FEAT-13-*.md`; đánh dấu ✅ `AC-DEL-01..12`
- [x] Cập nhật `SPEC-changelog.md`, `SPEC-reference.md` §12.1/§12.2, `SPEC.md` (Registry + phiên bản 1.6)
- [x] Ghi rõ: **không có breaking change** (Cấp 1, không migration, không đổi chữ ký). Nếu sau này bật Q3 (ghi đè) thì lên **Cấp 3** và cần chỉ đạo riêng

---

# BUGFIX-02/03 — Sửa "Hoàn tất đơn hàng": transaction, chống gọi song song, ngày cục bộ

> **TRẠNG THÁI: ĐÃ CÀI ĐẶT (v1.7).** Spec: `specs/features/BUGFIX-02-03-finish-order.md`
> Chủ dự án đã chỉ đạo (2026-10-02): *"hãy tiến hành sửa chữa tất cả"* — gồm cả phần **Cấp 3** (`BUG-03`).
> Cấp thay đổi: **Cấp 3** (sửa hành vi `finishOrder`/`ensureActiveBatch`) + **Cấp 1** (khoá nút).
> Không schema, **không migration**, không đổi chữ ký `finishOrder(containers)`, không xoá dữ liệu.

## Bước 19.0 — Rà soát & xác nhận danh sách lỗi ✅
- [x] **BUG-03** `finishOrder` không transaction (11 câu lệnh rời rạc) ⇒ tắt app giữa chừng mất `INV-B1`, có thể mất một phần `items`
- [x] Không chống **gọi song song** ⇒ 2 lần bấm "Xác nhận" tạo 2 batch `active`; `getActiveBatchId` (`LIMIT 1`) trả batch cũ nhất ⇒ nhập nhật ký nhầm batch
- [x] **BUG-02** `toISOString()` (giờ UTC) ở **6** chỗ ⇒ lệch ngày 00:00–06:59 giờ VN
- [x] `INSERT INTO items` không an toàn + tổng cộng tay trong JS
- [x] `UPDATE … WHERE id=?` không kèm `AND status='active'`

## Bước 19.1 — `src/utils/date.js` 🟢 mới (BUG-02)
- [x] `todayLocal(now = new Date())` — `YYYY-MM-DD` theo giờ cục bộ, **không** dùng `getUTC*`
- [x] `isDateString(value)` — chặn `2026-13-01`, `2026-02-31`, thiếu/thừa phần
- [x] Thay **6** chỗ: `queries.js` (`writeContainerDataInTx`, `materializeContainers`, `finishOrder`, `importContainerData`), `migrations.js`, `ItemCard.js`
- [x] **Quy tắc vàng mới #2b** trong `SPEC-rules.md` §0.2 + `INV-D2` cập nhật
- [x] `scripts/test-date.mjs` — 19 ca; thêm `test:date` vào `npm test`

## Bước 19.2 — `finishOrder` an toàn (BUG-03) 🔒 sửa thân hàm, giữ chữ ký
- [x] Bọc **toàn bộ phần ghi** trong **một** `withTransactionAsync` (INV-B3)
- [x] `UPDATE … WHERE id=? AND status='active'`; `changes === 0` ⇒ ném lỗi ⇒ rollback
- [x] Tạo batch mới: `INSERT OR IGNORE INTO items` (an toàn PK `(ntk, order_batch_id)`)
- [x] `recalcBatchTargetInTx(newBatchId)` thay cho cộng tay trong JS (INV-D6)
- [x] `finished_date` dùng `todayLocal()`
- [x] Đọc `batchId` qua `getActiveBatchId()`; không có batch ⇒ ném lỗi rõ ràng

## Bước 19.3 — Chống gọi song song (INV-B1)
- [x] Store: thêm state `finishing`; `finishOrder()` lần 2 ⇒ `{ok:false, error:{code:'BUSY'}}`
- [x] Store: bọc `try/finally` để `finishing` luôn về `false` kể cả khi lỗi
- [x] Store: **thêm** giá trị trả về `{ok, batchId}` (tên/tham số không đổi ⇒ caller cũ chạy đúng)
- [x] `ContainersScreen`: khoá nút + nhãn `⏳ Đang hoàn tất…`
- [x] `ContainersScreen.runFinish` bắt lỗi ⇒ `Alert` tiếng Việt + `init()` khi đơn đã bị hoàn tất trước đó

## Bước 19.4 — Tự phục hồi `INV-B1` (`db/index.js` 🟡)
- [x] `ensureActiveBatch` lấy **mọi** batch active, `ORDER BY id DESC`
- [x] Nếu > 1: giữ batch **mới nhất**, archive các batch còn lại (`finished_date = COALESCE(finished_date, today)`) — **không** xoá dữ liệu
- [x] Tạo batch đầu tiên: bọc transaction + `INSERT OR IGNORE` + tổng lấy từ `SUM(items.target)`
- [x] `getActiveBatchId`: thêm `ORDER BY id DESC LIMIT 1` cho xác định

## Bước 19.5 — Kiểm thử & chất lượng ✅
- [x] `npm test` — **254 ca đạt** (44 + 28 + 42 + 56 + 65 + 19), không hỏng ca cũ
- [x] `npx expo lint` — 0 lỗi (đã xoá cache ESLint bị bẩn ở `.expo/cache/eslint/`)
- [x] `npx tsc --noEmit` — 0 lỗi mới (`app-tabs.web.tsx:27` là lỗi có sẵn)
- [x] `npx expo export --platform ios` — bundle sạch

## Bước 19.6 — Spec ✅
- [x] `specs/features/BUGFIX-02-03-finish-order.md` (bỏ DRAFT)
- [x] `SPEC-acceptance.md` §7.8 `AC-FIN-01..09` + ghi chú BUGFIX ở §7.2
- [x] `SPEC-api.md` §6.1 (`ensureActiveBatch`), §6.2 (`finishOrder`), §6.2.1e (`date.js`), §6.3 (`finishing`)
- [x] `SPEC-rules.md` §0.2 quy tắc #2b, `INV-B1`/`INV-B3`/`INV-D2`
- [x] `SPEC-test.md` RC-73..78 + ca unit test `todayLocal`/`isDateString`
- [x] `SPEC-reference.md` §9 BUG-02/03 → ✅, bản đồ file, DEBT-03, §12.2
- [x] `SPEC-changelog.md` v1.7; `SPEC.md` phiên bản 1.7 + Registry; `AGENTS.md` thêm `test:date` + ghi chú cache ESLint

## Bước 19.7 — Hồi quy (bắt buộc) ⛔ chưa chạy được
> Cần máy/emulator thật — môi trường code-only không kiểm được UI + SQLite thật.

- [ ] ⛔ **RC-14/15/16/17/18** — hoàn tất đơn: batch archived, dữ liệu giữ nguyên, tick mới không ghi đè batch cũ _(máy thật)_
- [ ] ⛔ **RC-19** — nhập lúc **00:00–06:59 giờ VN** ⇒ ngày ghi đúng ngày địa phương _(máy thật)_
- [ ] ⛔ **RC-20** — tắt app, mở lại ⇒ dữ liệu còn nguyên _(máy thật)_
- [ ] ⛔ **RC-73** — tắt app ngay khi đang hoàn tất ⇒ mở lại đúng 1 batch active, batch mới **trắng** (`total_target = 0`, `container_data = '[]'`) _(máy thật)_
- [ ] ⛔ **RC-74** — bấm "Xác nhận" 2 lần liên tiếp ⇒ nút khoá, chỉ tạo 1 batch mới _(máy thật)_
- [ ] ⛔ **RC-75** — hoàn tất lúc 00:00–06:59 VN ⇒ `finished_date` đúng ngày _(máy thật)_
- [ ] ⛔ **RC-76** — hoàn tất lỗi ⇒ Alert, batch cũ vẫn `active`, dữ liệu nguyên vẹn _(máy thật)_
- [ ] ⛔ **RC-77** — DB có sẵn 2 batch active ⇒ giữ batch mới nhất, batch kia vào lưu trữ _(cần tạo dữ liệu trước)_
- [ ] ⛔ **RC-78** — hoàn tất xong ⇒ Lịch sử không đổi, nhóm mới nhất theo ngày đúng _(máy thật)_
- [ ] ⛔ Hồi quy cũ: RC-01..06, RC-11/12, RC-72, AC-APP-02/03 _(máy thật)_

---

# FEAT-14 — Đơn mới sau khi hoàn tất luôn **trắng** (không nạp seed)

> **TRẠNG THÁI: ĐÃ CÀI ĐẶT (v1.8).** Spec: `specs/features/FEAT-14-empty-new-order.md`
> Quyết định chủ dự án (2026-10-02): **"Luôn tạo đơn mới trắng."**
> Cấp thay đổi: **Cấp 3** (đổi `AC-CONT-07b`, `AC-IMP-12`) + **Cấp 1** (empty state).
> Không schema, **không migration**, không xoá dữ liệu, không đổi chữ ký `finishOrder(containers)`.
> Đóng nợ `DEBT-02` (một phần) và thu hẹp `FEAT-07`.

## Bước 20.1 — `finishOrder` tạo batch mới rỗng 🔒 `db/queries.js`
- [x] Bỏ vòng lặp `INSERT OR IGNORE INTO items` với `seedItems` + `recalcBatchTargetInTx(newBatchId)`
- [x] `INSERT order_batches` với `total_target = 0`, `pallets_total = 0`
- [x] `INSERT OR REPLACE INTO container_data (batch_id, '[]', today)` ⇒ đánh dấu "không có container"
- [x] Giữ nguyên phần archive batch cũ (BUGFIX-03), `seedItems` import còn dùng cho `ensureActiveBatch`

## Bước 20.2 — Store & UI 🟡
- [x] `store.finishOrder`: `containerData: []` thay cho `null`
- [x] `ContainersScreen`: empty state `Chưa có container trong đơn hàng này.` + ẩn chip lọc PO khi rỗng
- [x] `ItemsScreen`: phân biệt "đơn rỗng" với "lọc không ra kết quả" (AC-ITEM-30)

## Bước 20.3 — Kiểm thử & chất lượng ✅
- [x] `npm test` — **254 ca đạt** (không thêm test: không có hàm thuần mới)
- [x] `npx expo lint` — 0 lỗi
- [x] `npx tsc --noEmit` — 0 lỗi mới (`app-tabs.web.tsx:27` là lỗi có sẵn)
- [x] `npx expo export --platform ios` — bundle sạch

## Bước 20.4 — Spec ✅
- [x] `specs/features/FEAT-14-empty-new-order.md` (bỏ DRAFT)
- [x] `SPEC-acceptance.md`: sửa `AC-CONT-07b`, `AC-APP-02`, `AC-IMP-12` 🟡→✅; thêm `AC-CONT-09/10`, `AC-ITEM-30`, `AC-IMP-14`
- [x] `SPEC-data.md` §5.3 + §5.5.3 (quy ước `container_data = '[]'`)
- [x] `SPEC-api.md` §6.1 (`fetchContainerData`), §6.2 (`finishOrder`), §6.3 (state), §6.4 (`ContainersScreen`)
- [x] `SPEC-rules.md` `INV-D1`; `SPEC-test.md` RC-15/72/73 + RC-79..83
- [x] `SPEC-reference.md` `ADR-06`/`DEBT-02`/`FEAT-07`/§12.1; `SPEC-changelog.md` v1.8; `SPEC.md` phiên bản 1.8; `tasks.md` Bước 20

## Bước 20.5 — Hồi quy (bắt buộc) ⛔ chưa chạy được
> Cần máy/emulator thật — môi trường code-only không kiểm được UI + SQLite thật.

- [ ] ⛔ **RC-79** — hoàn tất đơn ⇒ tab Mã hàng trắng, 4 ô = 0, `Chưa có mã hàng.` _(máy thật)_
- [ ] ⛔ **RC-80** — hoàn tất đơn ⇒ tab Container hiện empty state, **không** 26 kiện mẫu _(máy thật)_
- [ ] ⛔ **RC-81** — đơn trắng ⇒ tắt app/mở lại vẫn trắng, thống kê `0/0` không crash _(máy thật)_
- [ ] ⛔ **RC-82** — đơn trắng ⇒ `Nhập JSON` packing list thật, cả hai tab có dữ liệu _(máy thật)_
- [ ] ⛔ **RC-83** — cài mới, mở lần đầu ⇒ vẫn có seed 8.030 / 3 container _(máy thật)_
- [ ] ⛔ Hồi quy cũ bị ảnh hưởng: RC-01, RC-14..18, RC-20, RC-72/73 _(máy thật)_

---

# FEAT-15 — Xoá đơn hàng lưu trữ & ẩn/hiện nội dung đơn lưu trữ

> **TRẠNG THÁI: ĐÃ CÀI ĐẶT (v1.9).** Spec: `specs/features/FEAT-15-delete-hide-archive.md`
> Chủ dự án đã trả lời Q1–Q7 ngày 2026-10-02: **chỉ XOÁ HẲN** + xoá kèm `entries` (có cảnh báo)
> + phạm vi **cả A và B**. ⇒ **không thêm cột, KHÔNG migration**, không đổi chữ ký hàm nào.
> Cấp thay đổi: **Cấp 3** (`INV-B2`, hành vi `AC-HIST-02`) + **Cấp 1** (UI).

## Bước 21.0 — Chốt yêu cầu ✅
- [x] **Q1** ⇒ **Chỉ xoá hẳn** (bỏ trạng thái ẩn mềm ⇒ không `is_hidden`, không migration v3)
- [x] **Q2** ⇒ Xoá luôn `entries` + `Alert` cảnh báo "Lịch sử sẽ giảm" (`INV-D5`, `INV-B4`)
- [x] **Q3** ⇒ Chỉ xoá **1** đơn mỗi lần
- [x] **Q4** ⇒ Chặn batch `active` (`BATCH_ACTIVE`), giữ `INV-B1`
- [x] **Q5** ⇒ Không lưu trạng thái thu gọn (state cục bộ)
- [x] **Q6** ⇒ Phạm vi **cả A (xoá đơn lưu trữ) và B (thu gọn/hiện nội dung)**
- [x] **Q7** ⇒ Không còn khái niệm "đơn ẩn" ⇒ câu hỏi không áp dụng; xoá hẳn ⇒ Lịch sử giảm (`AC-HIST-08`)
- [x] Chủ dự án chỉ đạo rõ (Cấp 3 — `SPEC-rules.md` §10.1)

## Bước 21.1 — Sửa spec Cấp 3 ✅ (trước khi code)
- [x] `specs/features/FEAT-15-delete-hide-archive.md` (bỏ DRAFT, ghi quyết định Q1–Q7)
- [x] `SPEC-acceptance.md` §7.9 `AC-ARCH-01..08` + `AC-HIST-08`; sửa `AC-CONT-08`
- [x] `SPEC-data.md` — bỏ phương án 2 cột; thêm bảng "dữ liệu bị xoá khi xoá hẳn"
- [x] `SPEC-api.md` §6.6 (`previewArchiveDelete`, `deleteArchive`, `utils/archiveDelete.js`, store)
- [x] `SPEC-rules.md`: sửa `INV-B2` (cho phép xoá hẳn có kiểm soát, vẫn cấm sửa), thêm `INV-B4`, cập nhật `§0.3`
- [x] `SPEC-test.md` RC-90..98; `SPEC-reference.md` bản đồ file + DEBT-03; `SPEC-changelog.md` v1.9; `SPEC.md` 1.9 + registry; `AGENTS.md` thêm `test:archive`

## Bước 21.2 — Migration 🔁 **KHÔNG CẦN**
- [x] ~~`MIGRATIONS[2]` (v3) thêm `is_hidden`/`hidden_at`~~ ⇒ **huỷ**: chủ dự án chọn *chỉ xoá hẳn*
- [x] `schema.js` **không** đổi; `PRAGMA user_version` giữ nguyên **2**; không đụng `pallet_status_bak_v1`

## Bước 21.3 — `db/queries.js` 🔒 (hàm mới)
- [x] `previewArchiveDelete(batchId)` — chỉ đọc, trả ngày/sản lượng/số mã/số nhật ký/số kiện; chỉ nhắm `status='archived'`
- [x] `deleteArchive(batchId)` — **một** `withTransactionAsync`: guard `archived`, chặn `active` (`BATCH_ACTIVE`), xoá `entries` → `items` → `pallet_status` → `container_data` → `order_batches`, lỗi ⇒ rollback
- [x] Trả `{ok, deleted:{entries,items,pallets}}` | `{ok:false, error:{code}}`; mã `INVALID_BATCH_ID` · `BATCH_ACTIVE` · `ARCHIVE_NOT_FOUND` · `DB_ERROR`
- [x] `fetchArchives()` / `fetchArchiveItems()` **không đổi**

## Bước 21.4 — `store/useAppStore.js` 🔒 (chỉ thêm)
- [x] State `archivesBusy` (khoá nút, lần gọi thứ hai trả `BUSY`)
- [x] Action `refreshArchives()` và `deleteArchive(batchId)` ⇒ `refreshArchives()` + `dataVersion++` (Lịch sử tự cập nhật)

## Bước 21.5 — UI 🟡/🟢
- [x] `src/utils/archiveDelete.js` (🟢 mới): `archiveDeleteConfirmMessage`, `archiveDeleteErrorMessage`, `archiveDeleteErrorCode`, `confirmDeleteArchive` — nguồn duy nhất cho thông điệp
- [x] `ArchiveCard`: nút `🗑` **tách khỏi** vùng chạm mở nội dung; `expanded`/`onToggle` do cha điều khiển; nạp chi tiết 1 lần/thẻ
- [x] `ContainersScreen`: thanh công cụ `👁 Ẩn/Hiện nội dung`; `runDeleteArchive` dựng `Alert` 2 nút từ `previewArchiveDelete`; chạm mũi tên khi đang thu gọn tất cả ⇒ mở đúng thẻ đó
- [x] Không còn đơn lưu trữ ⇒ mục lưu trữ biến mất (AC-ARCH-08); giữ nguyên nhãn `Hoàn tất ngày …`

## Bước 21.6 — Kiểm thử & chất lượng ✅
- [x] `scripts/test-archiveDelete.mjs` — **41 ca** (thông điệp xác nhận, cảnh báo INV-B4, dịch lỗi, cấu trúc `Alert`, `onBusy`)
- [x] `package.json` — thêm `test:archive` vào `npm test`
- [x] `npm test` — **295 ca đạt** (44 + 28 + 42 + 56 + 65 + 19 + 41), không hỏng ca cũ
- [x] `npx expo lint` — 0 lỗi
- [x] `npx tsc --noEmit` — 0 lỗi mới (`app-tabs.web.tsx:27` là lỗi có sẵn)
- [x] `npx expo export --platform ios` — bundle sạch

## Bước 21.7 — Hồi quy (bắt buộc) ⛔ chưa chạy được
> Cần máy/emulator thật — môi trường code-only không kiểm được UI + SQLite thật.

- [ ] ⛔ **RC-90** — xoá hẳn 1 đơn lưu trữ ⇒ thẻ biến mất, **Lịch sử giảm** đúng số nhật ký đã xoá _(máy thật)_
- [ ] ⛔ **RC-91** — sau khi xoá, không còn dữ liệu đơn đó ở bất kỳ đâu _(máy thật)_
- [ ] ⛔ **RC-92** — đơn lưu trữ có mã trùng tên đơn khác ⇒ xoá đơn này, đơn còn lại không ảnh hưởng _(máy thật)_
- [ ] ⛔ **RC-93** — bấm `🗑` rồi `Huỷ` ⇒ không đổi gì _(máy thật)_
- [ ] ⛔ **RC-94** — `👁 Ẩn nội dung` rồi `👁 Hiện nội dung` ⇒ mọi thẻ cùng trạng thái _(máy thật)_
- [ ] ⛔ **RC-95** — đang thu gọn tất cả thì chạm `▾` trên một thẻ ⇒ mở đúng thẻ đó _(máy thật)_
- [ ] ⛔ **RC-96** — xoá hẳn xong, tắt app mở lại ⇒ đơn đã xoá không quay lại _(máy thật)_
- [ ] ⛔ **RC-97** — xoá hẳn lúc đang mở nội dung thẻ ⇒ không crash _(máy thật)_
- [ ] ⛔ **RC-98** — bấm `🗑` 2 lần nhanh / tắt app giữa lúc xoá ⇒ khoá nút + rollback _(máy thật)_
- [ ] ⛔ Hồi quy bị ảnh hưởng: `AC-CONT-07/08`, `AC-HIST-01..03/07`, `AC-APP-02/03`, `INV-B1` _(máy thật)_

## BUGFIX-07: Nhập JSON — `readAsStringAsync` đã bị xoá khỏi `expo-file-system`

> Phạm vi: **Cấp 1** (thay lệnh gọi thư viện để sửa lỗi; không đổi schema, không migration, không breaking).
> Spec: `specs/features/BUGFIX-07-file-system-read.md` · Registry: `SPEC-reference.md` §12 **BUG-07** (🔴 P0)

### Bước 22.1 — Chẩn đoán ✅
- [x] Log `Method readAsStringAsync imported from "expo-file-system" is deprecated` **không** phải cảnh báo vô hại
- [x] `node_modules/expo-file-system/src/legacyWarnings.ts` L32-39 ⇒ hàm ở gói gốc **`throw`**, không đọc được file
- [x] Đường cứu cũ rơi vào `fetch(asset.uri)` với URI `file://` ⇒ OkHttp (Android) không đọc được ⇒ **Nhập JSON hỏng trên Android**
- [x] `grep -rn "expo-file-system" src` ⇒ chỉ 1 chỗ (`ImportJsonButton.js`)
- [x] API thay thế: `new File(uri).text()` (export từ gói gốc; khai báo `internal/NativeFileSystem.types.ts` L169)

### Bước 22.2 — Sửa code 🟢
- [x] `src/components/ImportJsonButton.js`: `import * as FileSystem` → `import { File }` (AC-FS-01)
- [x] Đọc nội dung qua `new File(asset.uri).text()`; giữ `fetch` làm **lưới an toàn cuối cùng** (AC-FS-02/06)
- [x] Giữ nguyên `copyToCacheDirectory: true` — bản sao cục bộ là điều kiện để `File` đọc được
- [x] Không đụng `detectFormat`, props, chuỗi `Alert`, `queries.js`, store (AC-FS-04/05)

### Bước 22.3 — Kiểm thử & chất lượng ✅
- [x] `grep -rn "readAsStringAsync" src` ⇒ rỗng (chỉ còn nhắc trong comment giải thích)
- [x] `npm test` — **295 ca đạt** (44+28+42+56+65+19+41), không hỏng ca cũ
- [x] `npx expo lint` — 0 lỗi
- [x] `npx tsc --noEmit` — 0 lỗi mới (`app-tabs.web.tsx:27` là lỗi có sẵn)
- [x] `SPEC.md` v1.9 → 1.10 · `SPEC-changelog.md` · `SPEC-test.md` RC-105/106

### Bước 22.4 — Hồi quy (bắt buộc) ⛔ chưa chạy được
> Cần máy/emulator thật — môi trường code-only không kiểm được UI + đọc file thật.

- [ ] ⛔ **RC-105** — bấm `📥 Nhập JSON` trên **Android** ⇒ không còn log deprecated, nạp được file _(máy thật)_
- [ ] ⛔ **RC-106** — file hợp lệ / sai cú pháp / rỗng ⇒ `Alert` đúng số lượng, file lỗi báo tiếng Việt, không ghi DB _(máy thật)_

## FEAT-16: Converter `packing_data.json` → file app import được

> Phạm vi: **Cấp 1** (thêm file mới; **không** sửa `queries.js`/`store`, không schema, không migration).
> Spec: `specs/features/FEAT-16-convert-packing-data-v1.md` · Changelog v1.11

### Bước 23.1 — Chẩn đoán ✅
- [x] Repro **nguyên văn logic** `queries.js:925-967` trên `src/data/packing_data.json`:
      không có `總表`/`entries` ⇒ app lấy nhầm key mảng đầu tiên là **`shipment_list`** (22 dòng) ⇒ 0 dòng có `Column4` ⇒ **"Không tìm thấy mã hàng nào trong file JSON."**
- [x] Kết luận: app chỉ đọc định dạng **phẳng** `總表` + `Column1..Column10`; file nguồn là định dạng **mới** lồng 4 tầng
- [x] Chọn **converter ngoài app** thay vì thêm parser vào `queries.js` (🔒)

### Bước 23.2 — Đo để chốt kiến trúc ✅
- [x] **22 file (1 file/shipment) ⇒ MẤT DỮ LIỆU**: `items` PK `(ntk, order_batch_id)` khiến file sau ghi đè `target` (Σ còn **17.935/51.568**); `container_data` PK `batch_id` chỉ giữ container của file cuối ⇒ **phải gộp MỘT file** (§2.1)
- [x] **1 file gộp** + `queries.js` nguyên bản (`expo-sqlite` giả): `imported 64` · Σ target **51.568** ✅ · `containers 26` ✅ · `pallets 468` ✅ · kiện liên tục `1..468` ✅

### Bước 23.3 — Cài đặt 🟢
- [x] `src/utils/packingV1.js` — hàm thuần; kiện đánh số **toàn cục** `1..N`; all-or-nothing (`problem` chặn ⇒ không ghi file)
- [x] `scripts/convert-packing-data.mjs` — `npm run convert:packing` ⇒ `src/data/packing_legacy/packing_legacy.json` + `manifest.json`
- [x] `src/utils/importFormat.js` — `detectFormat` **siết** (AC-FMT-01), `detectFormatError` báo kèm lệnh cần chạy, `estimateImportCount` đếm **mã duy nhất** (AC-FMT-04)
- [x] `ImportJsonButton.js` — dùng `@/utils/importFormat`, bỏ toàn bộ logic định dạng cũ
- [x] `package.json`: `convert:packing`, `test:packing`, `test:format` (+ 2 test vào `npm test`) · `AGENTS.md` ghi lệnh

### Bước 23.4 — Kiểm thử & chất lượng ✅
- [x] `scripts/test-packingV1.mjs` — **115 ca** (gộp, kiện trộn mã, 10 loại `problem`, đối chiếu, mô phỏng 2 hàm app, file thật)
- [x] `scripts/test-importFormat.mjs` — **46 ca** (hồi quy entries/packing list, định dạng mới, bộ lọc khớp `queries.js`)
- [x] `npm test` — **456 ca đạt** (44+28+42+56+65+19+41+115+46)
- [x] `npx expo lint` — 0 lỗi · `npx tsc --noEmit` — 0 lỗi mới (`app-tabs.web.tsx:27` có sẵn)
- [x] Sinh `src/data/packing_legacy/packing_legacy.json` (72 KB) — **file để nhập vào app**

### Bước 23.5 — Hồi quy (bắt buộc) ⛔ chưa chạy được
- [ ] ⛔ **RC-100** — nhập `packing_legacy.json` vào đơn trắng ⇒ 64 mã, Σ 51.568 _(máy thật)_
- [ ] ⛔ **RC-101** — tab Container ⇒ 26 container, 468 kiện, dải `Pallet a-b` đúng _(máy thật)_
- [ ] ⛔ **RC-102** — nhập lại lần 2 cùng file ⇒ không nhân bản mã/kiện _(máy thật)_
- [ ] ⛔ **RC-103** — nhập file GỐC `packing_data.json` ⇒ `Alert` hướng dẫn `npm run convert:packing`, **không** ghi DB _(máy thật)_
- [ ] ⛔ **RC-104** — nhập `entries` cũ ⇒ hành vi như trước _(máy thật)_
- [ ] ⛔ **RC-105/106** — BUGFIX-07: nạp được file trên Android, log sạch _(máy thật)_

## FEAT-17: Nhập thẳng `packing_data.json` + hiển thị thông tin mỗi mã hàng

> Phạm vi: **Cấp 2** (4 cột `items` + migration v3) **+ Cấp 3** (import nhận thêm định dạng mới).
> Spec: `specs/features/FEAT-17-import-packing-v1.md` · Changelog v1.13 · **Không breaking change**

### Bước 24.1 — Khảo sát dữ liệu ✅
- [x] `item_summary[]` có 6 trường; 4 trường bị định dạng phẳng **vứt**: `nw_kg`, `gw_kg`, `volume_cbm`, `package_count`
- [x] Đối chiếu nguồn: **174/174** dòng `item_summary` khớp tổng từ `packages[].items[]` ⇒ tin cậy `item_summary`
- [x] 22 shipment / 26 container (`container_no` duy nhất) / 468 kiện / 64 mã; 45/64 mã thuộc nhiều PO
- [x] `nw/gw` 1 chữ số thập phân · `cbm` 2 chữ số · `package_count` nguyên; không có `null`

### Bước 24.2 — Data model ✅
- [x] Migration **v3** (`migrations.js`): 4 `ALTER TABLE items ADD COLUMN … DEFAULT NULL`; **không** sửa v1/v2
- [x] **Không** sửa `CREATE_TABLES_SQL` (`schema.js` 🔒) — cài mới đi chung v1→v2→v3
- [x] `SPEC-data.md` §5.1 + **§5.8** (§5.8.1 ràng buộc, §5.8.2 migration), §10.2

### Bước 24.3 — Business logic ✅
- [x] `src/utils/packingV1Import.js` 🟢 mới — `buildImportPlanV1` (thuần), `planShipment`, `formatImportProblems`, 16 mã `problem`
- [x] Kiện đánh số **toàn cục** `1..N`; `containers[].id = container_no` (trùng ⇒ `#index`) ⇒ `pallet_key` (`INV-D4`) giữ nguyên
- [x] `po = poList.join('+')` **có sắp xếp** ⇒ ổn định giữa các lần chạy (xoá theo PO / bảng tổng PO so khớp chuỗi này)
- [x] Đối chiếu `item_summary` ↔ kiện: lệch ⇒ **chặn** (`ITEM_SUMMARY_MISSING/ORPHAN/QTY_MISMATCH`) để `target` không lệch với kiện thật (`INV-I3`)

### Bước 24.4 — API / store / UI ✅
- [x] `queries.importPackingV1(batchId, jsonData)` 🔒 **thêm** — 1 transaction cho items + `total_target` + `container_data` + `pallets_total`
- [x] `fetchItemsWithStats` thêm 4 cột vào `SELECT` (chữ ký **không đổi**)
- [x] `store.importFromJson` 🔒 **thêm** nhánh `packing_v1` (**trước** nhánh `總表`, vì file này cũng có mảng top-level)
- [x] `utils/importFormat.js`: `packing_v1` thành định dạng **được hỗ trợ**; `countPackingV1Items` (đếm mã duy nhất)
- [x] `ImportJsonButton`: bỏ chặn, thêm cảnh báo ghi đè + báo `shipments`/`multiPoItems`
- [x] `ItemCard` 🟡: dòng `KL / TKL / Thể tích / Kiện`, **ẩn** khi cột `NULL` (`INV-I1`)

### Bước 24.5 — Kiểm thử & chất lượng ✅
- [x] `scripts/test-packingV1Import.mjs` — **94 ca**; `test-importFormat.mjs` cập nhật theo hành vi FEAT-17 (46 ca)
- [x] `npm test` — **550 ca đạt** (44+28+42+56+65+19+41+115+46+94)
- [x] `npx expo lint` 0 lỗi · `npx tsc --noEmit` 0 lỗi mới (`app-tabs.web.tsx:27` có sẵn) · `npx expo export` sạch
- [x] E2E với `queries.js` nguyên bản: 64 mã · Σ 51.568 · 26 container · 468 kiện liên tục · 22 shipment
- [x] E2E migration v3: đúng 4 `ALTER … DEFAULT NULL`, **không** DROP/CREATE/RENAME; v1+v2 nguyên vẹn
- [x] E2E file hỏng: `Alert` tiếng Việt, **0** lệnh ghi DB (`INV-I4`)
- [x] E2E định dạng cũ: kết quả y hệt trước, SQL `items` không đổi (`AC-IMP-18`)

### Bước 24.6 — Hồi quy (bắt buộc) ⛔ chưa chạy được
- [ ] ⛔ **RC-110** — nạp `packing_data.json` vào đơn trắng: 64 mã · Σ 51.568 · PO đúng từng mã _(máy thật)_
- [ ] ⛔ **RC-111** — tab Container: 26 container · 468 kiện · tick kiện hoạt động _(máy thật)_
- [ ] ⛔ **RC-112** — `ItemCard` hiện đúng `KL / TKL / m³ / Kiện` _(máy thật)_
- [ ] ⛔ **RC-113** — mã thêm tay ⇒ **không** hiện dòng thông tin _(máy thật)_
- [ ] ⛔ **RC-114** — nạp 2 lần cùng file ⇒ không nhân bản mã/kiện, `total_target` không nhân đôi _(máy thật)_
- [ ] ⛔ **RC-115** — nạp lại định dạng cũ ⇒ hành vi như trước _(máy thật)_
- [ ] ⛔ **RC-116** — file `packing_v1` lỗi ⇒ `Alert` liệt kê lý do, DB không đổi _(máy thật)_
- [ ] ⛔ **RC-117** — mở app trên DB cũ (`user_version = 2`) ⇒ v3 chạy, dữ liệu cũ nguyên vẹn _(máy thật)_

## BUGFIX-08: App không khởi động — `no such column: nw_kg`

> Phạm vi: **Cấp 3** (sửa lỗi tầng khởi tạo DB). Không breaking change.
> Spec: `specs/features/BUGFIX-08-db-init-race.md` · Changelog v1.14 · Registry `SPEC-reference.md` **BUG-08** 🔴 P0

### Bước 25.1 — Chẩn đoán ✅
- [x] Lỗi: `no such column: nw_kg`, báo dạng **unhandled promise rejection** ⇒ `init()` bị reject
- [x] Truy vết: `init()` → `fetchItemsWithStats` (`SELECT … nw_kg`) — nguồn duy nhất tham chiếu `nw_kg`
- [x] **Nguyên nhân gốc** (`src/db/index.js` L11-16): `dbInstance` gán **trước** `runMigrations`
      ⇒ lời gọi `getDb()` **thứ hai** (song song) trả DB **chưa migrate** và query ngay
- [x] Vì sao chỉ lộ ra từ FEAT-17: trước đó mọi cột `SELECT` đã có từ v1 ⇒ lỗi nằm im
- [x] Nguồn song song: `init()` gọi từ `useEffect` ở `_layout.tsx`; remount/Fast Refresh/reload là đủ

### Bước 25.2 — Sửa ✅
- [x] `src/db/index.js` 🔒: cache **promise** (`dbReady`) thay vì instance; `catch` ⇒ `dbReady = null` rồi ném lại
- [x] `src/db/migrations.js` 🔒: `v3` đọc `PRAGMA table_info(items)`, chỉ `ADD COLUMN` còn thiếu (idempotent)
- [x] `src/utils/schemaColumns.js` 🟢 mới: `missingColumns` (thuần) + `ITEM_METRIC_COLUMNS`; lọc tên cột qua `/^[A-Za-z_][A-Za-z0-9_]*$/`
- [x] **Không** nới lỏng `SELECT` của `fetchItemsWithStats` (giữ AC-NEW-03) — sửa gốc, không che lỗi
- [x] `INV-DB1` trong `SPEC-rules.md`; `SPEC-api.md` §6.1 ghi chú `getDb()`

### Bước 25.3 — Kiểm thử & chất lượng ✅
- [x] `scripts/test-schemaColumns.mjs` — **24 ca** (idempotent, chạy lại, đọc `PRAGMA`, chặn SQL injection tên cột)
- [x] E2E `src/db/index.js` nguyên bản: `getDb()` **song song 5 lần** ⇒ mở DB **1** lần, 5 lời gọi cùng 1 instance
- [x] E2E thứ tự: `PRAGMA user_version` → `table_info(items)` → 4 `ALTER` ⇒ không `SELECT` nào chạy trước
- [x] E2E `v3.up()`: DB đủ cột ⇒ **0** `ALTER`; DB chỉ có 2/4 ⇒ thêm nốt 2; DB mới ⇒ đủ 4, `DEFAULT NULL`, không `DROP`
- [x] `npm test` — **574 ca đạt** (11 script)
- [x] `npx expo lint` 0 lỗi · `npx tsc --noEmit` 0 lỗi mới (`app-tabs.web.tsx:27` có sẵn) · `npx expo export` sạch

### Bước 25.4 — Hồi quy (bắt buộc) ⛔ chưa chạy được
- [ ] ⛔ **RC-120** — mở app trên DB cũ `user_version = 2` ⇒ không lỗi `no such column`, vào được màn hình chính _(máy thật)_
- [ ] ⛔ **RC-121** — `PRAGMA table_info(items)` có đủ 4 cột; `user_version = 3` _(máy thật)_
- [ ] ⛔ Hồi quy bị ảnh hưởng: `INV-B1` (`ensureActiveBatch`), `AC-APP-02` (seed lần chạy đầu), mọi màn hình khởi động _(máy thật)_

---

## FEAT-18 — Số lượng riêng cho từng PO

> Phạm vi: **Cấp 2 + Cấp 3**. Không breaking change.
> Spec: `specs/features/FEAT-18-po-per-code.md` · Changelog v1.16 · AC-PO-01..09

### Bước 26.1 — Chẩn đoán ✅
- [x] Vấn đề: `items.po` lưu **tập** PO nối `+` (`'2924+2929'`), `items.target` là **tổng**
      ⇒ không có đường tách ngược số lượng của từng PO
- [x] Đo trên `src/data/Dmac.json`: PO `2924` và `2929` không còn mã nào thuộc riêng
      ⇒ cột `Tổng` của bảng PO bằng **0** dù đơn có 64 mã / 51.568 pcs
- [x] Không sửa được ở tầng dẫn xuất: dữ liệu **không tồn tại**, không phải lỗi tính toán

### Bước 26.2 — Migration v4 + hiển thị ✅
- [x] `src/db/migrations.js` 🔒: thêm `v4` — tạo `item_po (ntk, po, qty, order_batch_id)`,
      PK `(ntk, po, order_batch_id)`, index `(order_batch_id, po)`
- [x] Backfill: **chỉ** mã thuộc **một** PO (`qty = target` chính xác, `TRIM` khoảng trắng thừa);
      mã đa PO / `po` rỗng / `po` `NULL` **không** tạo dòng
- [x] Idempotent: `CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE` ⇒ chạy lại không lỗi, không nhân bản
- [x] **Không** sửa `db/schema.js` 🔒 (cài mới đi chung v1→v2→v3→v4); **không** sửa migration v1/v2/v3
- [x] `src/utils/poSummary.js` 🟢: `poSummaries()` nhận `itemPoRows` **tuỳ chọn** (không breaking),
      cột `Tổng` lấy `SUM(item_po.qty)` theo từng PO; mã đa PO chưa có dòng ⇒ rơi về đúng hành vi FEAT-12
- [x] PO không có dòng nào ⇒ `Tổng = 0` (không phải `NULL`); `Σ` bảng PO vẫn khớp `Kế hoạch`
- [x] Sửa `INV-D6` (nội dung bất biến giữ nguyên, *cơ chế* đổi); `SPEC-data.md` §5.6b mới + §5.1 + §5.6

### Bước 26.3 — Kiểm thử & chất lượng ✅
- [x] `scripts/test-migrations.mjs` — **31 ca** trên **SQLite thật** (`node:sqlite`, in-memory),
      chạy `MIGRATIONS`/`runMigrations` **nguyên bản**: cài mới v1→v4 · nâng cấp v3→v4 có dữ liệu thật ·
      PK chặn trùng · `Σ item_po == Σ target` · chạy 2 lần không nhân bản · guard BUGFIX-08 khi `user_version` đã đúng
- [x] **Test có tác dụng**: bỏ `INSTR(po,'+') = 0` khỏi backfill ⇒ **4 ca đỏ** (đã kiểm rồi khôi phục)
- [x] `scripts/test-poSummary.mjs` mở rộng cho `itemPoRows`
- [x] `scripts/db-init-e2e/scenario.mjs` cập nhật theo v4 (`stale-version` giữ `user_version = 3`
      vì đó **chính là** máy thật bị lỗi; thêm assert v4 tạo `item_po`) — 6 kịch bản / 26 assert
- [x] `npm test` — **653 ca đạt** (12 script) + 6 kịch bản E2E
- [x] `npx expo lint` sạch · `npx tsc --noEmit` chỉ còn `app-tabs.web.tsx:27` **có sẵn từ trước** (xác nhận qua `git stash`)
- [x] `npx expo export --platform android` **OK** — bundle Hermes có `item_po`
- [x] ⚠️ `npx expo export --platform web` **lỗi** `wa-sqlite.wasm` — **có sẵn từ trước** (`git stash` xác nhận bản gốc lỗi y hệt), không phải hồi quy FEAT-18

### Bước 26.4 — Hồi quy (bắt buộc) ⛔ chưa chạy được
- [ ] ⛔ **RC-124** — mở app trên DB có dữ liệu: `user_version = 4`, `item_po` tồn tại, không lỗi _(máy thật)_
- [ ] ⛔ **RC-125** — mỗi mã một PO có đúng 1 dòng `qty = target`, `po` đã `TRIM`; mã `po` có `+` không có dòng _(máy thật)_
- [ ] ⛔ **RC-126** — bảng `Tổng theo PO`: mỗi PO có `Tổng` riêng, PO không có mã riêng hiện `0`, `Σ` khớp `Kế hoạch` _(máy thật)_
- [ ] ⛔ **RC-127** — mở app lần thứ hai: `item_po` không nhân bản _(máy thật)_
- [ ] ⛔ Hồi quy bị ảnh hưởng: `INV-D6`, `AC-DEL-09`, `INV-B1` (`ensureActiveBatch`), `AC-APP-02` _(máy thật)_

---

## FEAT-19 — Tách mã nhiều PO thành từng dòng riêng

> Phạm vi: **Cấp 3** (đổi hành vi hiển thị). **Không** migration, **không** breaking change.
> Spec: `specs/features/FEAT-19-split-item-by-po.md` · Changelog v1.17 · AC-SPLIT-01..13

### Bước 27.1 — Chẩn đoán ✅
- [x] Yêu cầu chủ dự án: mã nhiều PO phải tách riêng, không gộp `PO 2922+2923`
- [x] Đo trên `Dmac.json`: 49 mã, **15 mã nhiều PO**; `106167GF` = 2922 (270) + 2923 (135)
      bị gộp thành 1 thẻ kế hoạch 405; `1072017GF` gộp **6** PO
- [x] FEAT-18 đã lưu phần của từng PO trong `item_po` ⇒ có **dữ liệu thật** để tách, không cần suy đoán

### Bước 27.2 — Hỏi & chốt (không suy đoán) ✅
- [x] Q1 `Đã làm`/`Lỗi` ở thẻ tách ⇒ **dùng chung số đã làm của mã** (`entries` khoá `ntk`)
- [x] Q2 4 trường KL/TKL/Thể tích/Kiện ⇒ **chỉ ở thẻ tách đầu tiên**, thẻ sau `null` (ẩn theo `INV-I1`)
- [x] Q3 Sửa/Xoá ở thẻ tách ⇒ **ẩn cả hai** (`updateItem`/`removeItem` nhắm theo **mã**)

### Bước 27.3 — Sửa ✅
- [x] `src/utils/itemRows.js` 🟢 mới: `buildPoQtyByNtk` (dùng chung) + `splitItemRows` + `filterItemRows`
- [x] `src/utils/poSummary.js` 🟢: `buildPoQtyByNtk` chuyển ra `itemRows.js` để hai nơi không lệch cách tách
- [x] `src/screens/ItemsScreen.js` 🟡: dùng `filterItemRows(splitItemRows(...))`, `key={row.rowKey}`,
      `onEditItem`/`onDeleteItem` = `undefined` khi `row.isSplit`
- [x] `src/components/ItemCard.js` 🟡: ghi chú dùng chung / chưa tách được — **không thêm prop**
- [x] Vá **BUG-06**: `key` React gồm cả `po` (trước là `key={item.ntk}` sẽ trùng khi tách)
- [x] Bộ lọc trạng thái tính theo **mã** (`itemDone`), không theo kế hoạch per-PO
- [x] Mã đa PO chưa có `item_po` ⇒ giữ 1 thẻ gộp + ghi chú *"nhập lại file nguồn"* (không bịa số)
- [x] `filteredItems` **giữ nguyên**; `summaryTotals`/`PoSummaryTable` **không đổi** ⇒ không nhân đôi

### Bước 27.4 — Kiểm thử & chất lượng ✅
- [x] `scripts/test-itemRows.mjs` — **72 ca**: tách đúng số dòng, `target` per-PO, `Σ = items.target`
      (**INV-D7**), mã một PO không đổi, 4 trường chỉ ở dòng đầu, `rowKey` duy nhất (kể cả khác batch),
      lọc PO / tìm kiếm / trạng thái, mã 6 PO, dữ liệu bất thường (`itemPoRows` rác) không làm hỏng
- [x] **Test có tác dụng**: bỏ logic dòng đầu ⇒ 1 ca đỏ; đảo thứ tự sắp xếp PO ⇒ 2 ca đỏ
- [x] `scripts/test-poSummary.mjs` 85/85 nguyên vẹn sau refactor
- [x] `npm test` — **725 ca đạt** (13 script) + 6 kịch bản E2E
- [x] `npx expo lint` sạch · `npx tsc --noEmit` không lỗi mới

### Bước 27.5 — Hồi quy (bắt buộc) ⛔ chưa chạy được
- [ ] ⛔ **RC-128** — nhập `packing_data.json` rồi mở tab Mã hàng: `106167GF` hiện **hai thẻ** PO 2922 (270) + PO 2923 (135) _(máy thật)_
- [ ] ⛔ **RC-129** — thẻ tách có ghi chú dùng chung, 4 trường chỉ ở thẻ đầu, **không** có nút Sửa/Xoá _(máy thật)_
- [ ] ⛔ **RC-130** — chip lọc từng PO chỉ ra thẻ của PO đó; `Σ Kế hoạch` khớp `SummaryCards` (INV-D7) _(máy thật)_
- [ ] ⛔ **RC-131** — DB cũ chưa nhập lại: thẻ gộp còn kèm ghi chú, không mất dữ liệu _(máy thật)_
- [ ] ⛔ Hồi quy bị ảnh hưởng: `AC-ITEM-*` (danh sách, lọc, thẻ), `INV-D6`/`INV-D7`, `INV-V1`, `INV-V3`, `BUG-01`, `AC-DEL-08/09` _(máy thật)_
