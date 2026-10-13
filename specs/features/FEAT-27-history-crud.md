# FEAT-27 — Quản lý thêm / sửa / xoá lịch sử sản xuất trong tab Lịch sử

> **Cấp thay đổi**: Cấp 1 (Thêm tính năng UI + hàm query mới, không đổi schema DB)  
> **Ngày**: 2026-10-13  
> **Yêu cầu người dùng**: Thêm chức năng thêm, sửa, xoá lịch sử sản xuất cho ngày, tháng, năm trong tab Lịch sử; đảm bảo không bị bàn phím che mất ô nhập input.

---

## 1. Mục tiêu & Phạm vi

- **Tab Lịch sử (`HistoryScreen.js`)**:
  1. Thêm nút "＋ Thêm lịch sử sản xuất" ở đầu màn hình và trong từng nhóm ngày/tháng/năm.
  2. Hiển thị danh sách các lượt sản xuất thực tế trong nhóm khi mở rộng (bao gồm ngày, mã hàng, PO, ref, số lượng, lỗi, chuyền).
  3. Cho phép bấm **Sửa** từng lượt sản xuất thông qua Sheet chỉnh sửa.
  4. Cho phép bấm **Xoá** từng lượt sản xuất kèm cảnh báo xác nhận `Alert.alert`.
- **Form Thêm / Sửa (`HistoryEntrySheet.js`)**:
  - Chọn ngày sản xuất (sử dụng `DateSelectorBar`).
  - Chọn mã hàng & PO trong đơn active hiện tại.
  - Chọn số hiệu Ref (nếu có).
  - Chọn chuyền (Thủ công / Tự động).
  - Nhập số lượng sản xuất (`qty`), số lượng lỗi (`defectQty`), chọn loại lỗi (Thẻ vàng, Thẻ đỏ, Rách bọc).
  - Cơ chế tránh bàn phím che khuất: tự động nhấc sheet lên trên bàn phím, tự động cuộn khi focus input, chạm backdrop để ẩn bàn phím.
- **Tầng dữ liệu (`queries.js`)**:
  - Thêm hàm `fetchHistoryEntries(groupBy, groupKey)` lấy danh sách các bản ghi `production_entries` chi tiết của nhóm.
  - Sử dụng các hàm ghi có sẵn: `addEntry`, `updateEntry`, `removeEntry`.

---

## 2. Tiêu chí nghiệm thu (Acceptance Criteria)

- **AC-HIST-CRUD-01**: Bấm "＋ Thêm lịch sử sản xuất" mở form thêm; nhập đầy đủ thông tin hợp lệ và bấm Thêm sẽ ghi thành công vào DB và tự cập nhật số liệu tab Lịch sử và tab Mã hàng.
- **AC-HIST-CRUD-02**: Khi mở rộng nhóm ngày/tháng/năm, hiển thị danh sách từng lượt sản xuất kèm nút Sửa và Xoá.
- **AC-HIST-CRUD-03**: Bấm Sửa mở form với dữ liệu hiện tại của lượt sản xuất; sửa số lượng/ngày/chuyền/lỗi và bấm Lưu sẽ cập nhật thành công.
- **AC-HIST-CRUD-04**: Bấm Xoá hiển thị hộp thoại xác nhận `Alert.alert`; xác nhận xoá sẽ xoá bản ghi khỏi DB và giảm số lượng tương ứng.
- **AC-HIST-CRUD-05**: Khi bàn phím ảo xuất hiện trên Android & iOS, form không bị bàn phím che mất các ô nhập `qty`, `defectQty` hay các nút thao tác.
