# FEAT-08 — Import dữ liệu từ JSON

## 1. Bối cảnh & mục tiêu
- Vấn đề người dùng gấp: Cần nhập dữ liệu nhanh từ file JSON — (a) nhật ký sản xuất (entries) từ hệ thống khác, (b) packing list (items/targets) từ file PO như `PO23492.json`.
- Kết quả mong muốn: Chọn 1 file JSON → app tự động phát hiện format → ghi vào batch active → số liệu cập nhật ngay, lịch sử tự động cập nhật (BUG-05). Thời gian < 3s.

## 2. Phạm vi
- Làm:
  - Chọn file `.json` qua `expo-document-picker`
  - Tự động phát hiện format: entries (có key `entries` hoặc là array với `ntk`+`date`) hoặc packing list (có key `總表`/arrays với `Column4`)
  - Entries: ghi vào bảng `entries`, bỏ qua ntk không tồn tại
  - Packing list: parse Column4 (ntk), Column6 (qty), Column10 (po); INSERT OR REPLACE vào `items`, cập nhật `total_target`
  - Thông báo kết quả bằng `Alert`, xác nhận trước khi ghi (INV-U1)
- KHÔNG làm:
  - Nhập vào batch đã archived
  - Thay đổi schema DB
  - Hỗ trợ CSV/Excel (chỉ JSON)
- Cấp thay đổi: **Cấp 1**

## 3. Acceptance Criteria
- AC-IMP-01: Nút "Nhập JSON" hiện trên tab Mã hàng; chạm → mở `DocumentPicker` chọn file `.json`
- AC-IMP-02: Parse JSON thành công → ghi dữ liệu; lỗi parse/format → `Alert` báo lỗi, không ghi DB
- AC-IMP-03: Sau khi nhập entries: số liệu thẻ + tổng quan cập nhật ngay; tab Lịch sử tự cập (qua `dataVersion`)
- AC-IMP-04: Entry có `ntk` không tồn tại trong `items` → bỏ qua, ghi nhận skipped
- AC-IMP-05: Entry có `qty ≤ 0 && defectQty ≤ 0` → bỏ qua (theo AC-ITEM-05)
- AC-IMP-06: Trước khi ghi: `Alert.alert` xác nhận (INV-U1)
- AC-IMP-07: `defect_types` array → join(','); `line` không hợp lệ → mặc định `manual` (INV-D3)
- AC-IMP-08: File packing list (có `總表`/Column4) → tự động nhận diện, INSERT OR REPLACE items, cập nhật `total_target`
- AC-IMP-09: Sau khi import items: tổng quan cập nhật (Σ target thay đổi); lịch sử không ảnh hưởng

## 4. Ảnh hưởng dữ liệu
- Bảng/cột mới: **Không có** (tái sử dụng `entries` và `items`)
- Ảnh hưởng dữ liệu cũ: INSERT vào batch active (entries) hoặc INSERT OR REPLACE vào items; không sửa archived
- Migration: Không cần

## 5. Kế hoạch file
| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `specs/features/FEAT-08-import-json.md` | 🟢 | Thêm mới | Spec tính năng |
| `src/db/queries.js` | 🔒 | Thêm `importItemsFromJson`, `importEntriesFromJson` | Chỉ được thêm |
| `src/store/useAppStore.js` | 🟡 | Thêm state + action `importFromJson` | Thêm action mới |
| `src/components/ImportJsonButton.js` | 🟢 | Tạo mới | Component UI mới |
| `src/screens/ItemsScreen.js` | 🟡 | Thêm nút | Thêm UI |
| `src/screens/HistoryScreen.js` | 🟡 | Thêm `dataVersion` vào useEffect deps | Fix BUG-05 |

## 6. Thiết kế
- **Luồng:** UI → DocumentPicker → FileSystem.readAsStringAsync → parse → detect format → Alert xác nhận → store.importFromJson → queries → refreshItems + dataVersion++ → UI cập nhật
- **Hàm mới (signature):**
  - `queries.importItemsFromJson(batchId, jsonData): Promise<{imported, totalItems}>`
  - `queries.importEntriesFromJson(batchId, entries): Promise<{imported, skipped}>`
  - `store.importFromJson(jsonData: string): Promise<{imported, skipped} | {imported, totalItems}>`
- **Props:** `ImportJsonButton({ onImport, theme })`
- **JSON formats:**
  ```json
  // Entries
  { "entries": [{"ntk":"106160","date":"2026-09-28","qty":100,"line":"manual","defect_qty":5,"defect_types":["yellow"]}] }
  // Packing list (PO23492.json)
  { "總表": [{"Column4":"1072014GF","Column6":1000,"Column10":23492}, ...] }
  ```

## 7. Rủi ro hồi quo
- Chỉ thêm hàm mới, không đổi signature hiện có → **không breaking**
- INV-A1, A2, B1, U1 đều đáp ứng ✅

## 8. Kế hoạch kiểm thử
- RC nào phải chạy lại: RC-01, RC-02, RC-05, RC-15, RC-17, RC-20
- RC mới: RC-IMP-01..04 (xem SPEC.md §7.5)

## 9. Tiêu chí xong
- [x] `npx expo lint` — 0 lỗi mới
- [x] `npx tsc --noEmit` — 0 lỗi mới
- [x] `npx expo start -c` — khởi động OK
- [ ] RC-IMP-01: Pick JSON entries → nhập → số liệu cập nhật
- [ ] RC-IMP-02: Pick PO23492.json → import items → total_target cập nhật
- [ ] RC-IMP-03: JSON lỗi → Alert lỗi, không ghi DB
- [ ] RC-IMP-04: Nhập xong → sang Lịch sử → dữ liệu cập nhật
