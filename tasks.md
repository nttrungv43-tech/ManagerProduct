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

## Các task tiếp theo
- FEAT-02: Lọc lịch sử theo ngày/tháng/năm
