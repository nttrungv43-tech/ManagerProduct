# FEAT-28 — Quản lý sản phẩm chưa dán nhãn & Tab Dán nhãn (Checker)

## 1. Bối cảnh & mục tiêu
- **Vấn đề người dùng gặp**: Khi nhập số lượng sản xuất ở tab Mã hàng, có trường hợp sản phẩm ra chuyền nhưng chưa được dán tem nhãn hoàn chỉnh (chờ in tem, chờ tổ đóng gói dán tem...). Trước đây hệ thống coi mọi sản lượng nhập vào là như nhau, người quản lý không biết có bao nhiêu sản phẩm đang tồn chờ dán tem nhãn, dẫn đến khó theo dõi và dễ sót hàng chưa dán nhãn trước khi đóng kiện.
- **Kết quả mong muốn**:
  1. Cho phép đánh dấu một lượt sản xuất là "Chưa dán nhãn hoàn chỉnh" (toàn bộ hoặc một phần).
  2. Tạo một Tab riêng "Dán nhãn" (Checker Workspace) trên thanh điều hướng đáy, hiển thị danh sách tất cả các lô đang chờ dán nhãn kèm tổng số lượng.
  3. Cung cấp công cụ Checker 1-chạm `[✓ Đã dán xong]` hoặc dán nhãn từng phần để cập nhật số lượng tức thì, đồng bộ sang tab Mã hàng và Lịch sử.

## 2. Phạm vi
- **Làm**:
  - Bổ sung 2 cột an toàn vào `production_entries`:
    - `is_labeled INTEGER NOT NULL DEFAULT 1 CHECK (is_labeled IN (0, 1))`
    - `unlabeled_qty INTEGER NOT NULL DEFAULT 0 CHECK (unlabeled_qty >= 0)`
  - Thêm tuỳ chọn "Chưa dán nhãn" ở Form nhập sản lượng trong [ItemCard.js](file:///home/oem/Workspace/DEV/production-tracker/src/components/ItemCard.js) và [HistoryEntrySheet.js](file:///home/oem/Workspace/DEV/production-tracker/src/components/HistoryEntrySheet.js).
  - Thêm Tab mới trên thanh Bottom Bar: `src/app/(tabs)/labeling.tsx` & màn hình [LabelingScreen.js](file:///home/oem/Workspace/DEV/production-tracker/src/screens/LabelingScreen.js).
  - Hiển thị Badge số lượng chờ dán nhãn trên icon tab `Dán nhãn`.
  - Viết các hàm nghiệp vụ trong `src/db/queries.js` và actions trong `src/store/useAppStore.js`.
  - Bộ kiểm thử tự động `scripts/test-labelingTab.mjs` bảo đảm 100% test pass.
- **KHÔNG làm**:
  - Không thay đổi logic dán nhãn đóng kiện container (`pallet_lines.is_labeled`).
- **Cấp thay đổi**: Cấp 2 (Bổ sung cột DB có DEFAULT + Thêm Tab và Component mới).

## 3. Acceptance Criteria
- **AC-LBL-01**: Khi thêm lượt sản xuất, nếu không bật tuỳ chọn "Chưa dán nhãn", lượt đó mặc định có `is_labeled = 1` và `unlabeled_qty = 0`.
- **AC-LBL-02**: Khi bật tuỳ chọn "Chưa dán nhãn", người dùng có thể chọn dán chưa xong toàn bộ (unlabeled_qty = qty) hoặc dán dở dang (unlabeled_qty < qty).
- **AC-LBL-03**: Tab "Dán nhãn" hiển thị tổng hợp: Tổng số pcs chưa dán nhãn và danh sách chi tiết các lượt sản xuất đang chờ xử lý.
- **AC-LBL-04**: Trên thẻ công việc tại tab Dán nhãn, bấm `[✓ Đã dán xong]` sẽ chuyển lượt đó thành `is_labeled = 1` và `unlabeled_qty = 0`, lô đó lập tức rời khỏi danh sách chờ.
- **AC-LBL-05**: Hỗ trợ dán nhãn một phần: Cho phép nhập số lượng vừa dán xong để trừ lùi `unlabeled_qty`.
- **AC-LBL-06**: Khi có hàng chờ dán nhãn, icon Tab `Dán nhãn` hiển thị badge số lượng. Khi không còn hàng chờ dán, hiển thị thông báo trạng thái sạch sẽ.

## 4. Ảnh hưởng dữ liệu
- Bảng `production_entries`: Thêm 2 cột có giá trị DEFAULT hằng số:
  - `is_labeled INTEGER NOT NULL DEFAULT 1`
  - `unlabeled_qty INTEGER NOT NULL DEFAULT 0`
- Toàn bộ dữ liệu lịch sử đã có từ trước tự động nhận `is_labeled = 1` và `unlabeled_qty = 0`, không gây sai lệch dữ liệu cũ.
- Tự động vá cột bằng `ADDABLE_COLUMN_DECLS` và `repairMissingColumns` theo chuẩn BUGFIX-08 / BUGFIX-23.

## 5. Kế hoạch file
| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `src/db/schema.js` | 🔒 Đóng băng | Sửa | Khai báo 2 cột mới trong `CREATE_TABLES_SQL`, `REQUIRED_COLUMNS`, `ADDABLE_COLUMN_DECLS` |
| `src/db/queries.js` | 🔒 Đóng băng | Sửa | Bổ sung hàm `fetchUnlabeledEntries`, `markEntryLabeled` và cập nhật `addEntry`/`updateEntry` |
| `src/store/useAppStore.js` | 🔒 Đóng băng | Sửa | Thêm state `unlabeledCount`, `unlabeledEntries` và actions đồng bộ |
| `src/app/(tabs)/_layout.tsx` | 🟡 Cẩn trọng | Sửa | Thêm `Tabs.Screen name="labeling"` với icon `pricetag-outline` |
| `src/app/(tabs)/labeling.tsx` | 🔒 Đóng băng | Tạo mới | Route re-export màn hình `LabelingScreen` |
| `src/screens/LabelingScreen.js` | 🟡 Cẩn trọng | Tạo mới | Giao diện Checker quản lý danh sách sản phẩm chờ dán nhãn |
| `src/components/ItemCard.js` | 🟡 Cẩn trọng | Sửa | Thêm tuỳ chọn chưa dán nhãn khi nhập sản lượng |
| `src/components/HistoryEntrySheet.js` | 🟢 Tự do | Sửa | Thêm tuỳ chọn chưa dán nhãn khi sửa/thêm nhật ký |
| `scripts/test-labelingTab.mjs` | 🟢 Tự do | Tạo mới | Bộ unit test kiểm thử toàn diện tính năng dán nhãn |

## 6. Kế hoạch kiểm thử
- `npm test`: Chạy toàn bộ 732 ca kiểm thử hiện có (không ca nào bị gãy).
- `node scripts/test-labelingTab.mjs`: Kiểm tra thêm lượt chưa dán nhãn -> danh sách chờ dán hiển thị đúng -> 1-chạm xác nhận đã dán xong -> danh sách chờ cập nhật sạch sẽ.
