# FEAT-24 — Hoàn tất đơn hàng theo mã PO được chọn

## 1. Bối cảnh & mục tiêu
- **Vấn đề người dùng gặp**: Hiện tại chức năng "Hoàn tất đơn hàng" chỉ cho phép hoàn tất toàn bộ đơn hàng active cùng một lúc. Trong thực tế xưởng sản xuất, một lô nhập có thể bao gồm nhiều mã PO khác nhau (ví dụ: PO 2919, PO 2920, PO 2600168...). Có những PO đã đóng kiện xong hoặc sản xuất đủ trước cần xuất xưởng và lưu trữ trước, trong khi các PO còn lại vẫn đang trong quá trình sản xuất. Nếu hoàn tất cả đơn thì các PO đang dở dang cũng bị đóng và đẩy vào lưu trữ; nếu không hoàn tất thì không lưu trữ được các PO đã xong.
- **Kết quả mong muốn**: Khi bấm "Hoàn tất đơn hàng" ở tab Container:
  1. Hiển thị giao diện cho phép người dùng lựa chọn cụ thể các mã PO muốn hoàn tất (kèm nút Chọn tất cả / Bỏ chọn tất cả và hiển thị tiến độ kiện/pcs của từng PO).
  2. Nếu chọn **tất cả PO**: Toàn bộ đơn hàng chuyển sang lưu trữ (archived) và tạo đơn mới trắng như trước.
  3. Nếu chọn **một phần PO**: Các PO được chọn sẽ được tách sang một đơn lưu trữ mới (batch `status='archived'`), còn các PO chưa chọn vẫn tiếp tục nằm ở đơn active hiện tại để sản xuất bình thường.
  4. Mọi số liệu ở tất cả các tab ("Tổng theo PO", "Tất cả PO", danh sách thẻ mã hàng, tab Container, tab Lịch sử) đều tự động cập nhật chính xác.

## 2. Phạm vi
- **Làm**:
  - Mở rộng hàm `finishOrder(poCodes = null)` trong `src/db/queries.js` để hỗ trợ tham số tuỳ chọn `poCodes` (danh sách mã PO cần hoàn tất). Nếu không truyền hoặc rỗng hoặc chọn tất cả thì hoàn tất toàn bộ đơn. Nếu chọn một phần thì tách các PO được chọn sang batch `archived` mới trong cùng 1 transaction.
  - Cập nhật action `finishOrder(poCodes)` trong `src/store/useAppStore.js`.
  - Tạo component `src/components/FinishOrderModal.js` hiển thị danh sách PO, tiến độ đóng kiện/sản lượng, checkbox lựa chọn, và nút xác nhận.
  - Tích hợp `FinishOrderModal` vào `src/screens/ContainersScreen.js`.
- **KHÔNG làm (non-goals)**:
  - Thay đổi schema CSDL (không thêm/xoá cột hay bảng, kiến trúc 9 bảng từ FEAT-21 đã đủ).
  - Không sửa đổi dữ liệu của các batch đã lưu trữ (INV-B2).
- **Cấp thay đổi**: Cấp 1 (mở rộng chức năng, thêm component modal, giữ nguyên chữ ký mặc định).

## 3. Acceptance Criteria
- **AC-FINISH-01 (Mở hộp thoại chọn PO)**: Khi người dùng bấm nút "✅ Hoàn tất đơn hàng" ở tab Container, hiển thị modal/sheet cho phép chọn mã PO cần hoàn tất thay vì thực hiện ngay.
- **AC-FINISH-02 (Thông tin từng PO)**: Danh sách hiển thị từng mã PO kèm trạng thái: số kiện đã đóng / tổng số kiện, sản lượng pcs, và cảnh báo nếu PO chưa đóng đủ 100% kiện.
- **AC-FINISH-03 (Chọn linh hoạt)**: Có nút "Chọn tất cả" / "Bỏ chọn tất cả", và cho phép tick/bỏ tick từng PO.
- **AC-FINISH-04 (Hoàn tất tất cả)**: Khi chọn tất cả PO và bấm xác nhận (sau khi Alert.alert phê duyệt), toàn bộ đơn active chuyển thành archived, tạo đơn mới active trắng (giữ nguyên hành vi cũ).
- **AC-FINISH-05 (Hoàn tất một phần PO)**: Khi chỉ chọn một số PO (ví dụ 1 trong 3 PO):
  - Tạo 1 batch archived mới chứa các PO được chọn, các container, kiện, dòng hàng, nhật ký của các PO đó.
  - Batch active hiện tại vẫn giữ nguyên `id` và trạng thái `active`, chỉ loại bỏ các PO đã hoàn tất.
  - Mọi tab tự động cập nhật ngay lập tức: tab Container chỉ còn container của các PO còn lại; tab Mã hàng chỉ còn thẻ và dòng tổng của các PO còn lại; tab Lịch sử hiển thị đơn vừa lưu trữ chứa các PO đã chọn.
- **AC-FINISH-06 (An toàn & Chặn lỗi)**: Không thể bấm xác nhận nếu chưa chọn PO nào. Bọc toàn bộ trong transaction, nếu có lỗi sẽ rollback và dữ liệu còn nguyên.

## 4. Ảnh hưởng dữ liệu
- Không đổi schema (`db/schema.js` giữ nguyên).
- Khi tách PO:
  - `pos.order_batch_id` của các PO được chọn cập nhật thành ID của batch archived mới.
  - `containers.order_batch_id` của các container thuộc các PO được chọn cập nhật thành ID của batch archived mới.
  - Dữ liệu `order_lines`, `order_line_refs`, `production_entries`, `pallets`, `pallet_lines` tự động đi theo qua FK.

## 5. Kế hoạch file
| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `specs/features/FEAT-24-finish-order-by-po.md` | 🟢 Tự do | Thêm mới | Đặc tả tính năng |
| `src/db/queries.js` | 🔒 Đóng băng | Mở rộng | Thêm tham số tuỳ chọn `poCodes` cho `finishOrder`, logic tách PO sang batch archived |
| `src/store/useAppStore.js` | 🔒 Đóng băng | Mở rộng | Cho phép action `finishOrder` nhận `poCodes` |
| `src/components/FinishOrderModal.js` | 🟢 Tự do | Thêm mới | Modal giao diện chọn PO hoàn tất |
| `src/screens/ContainersScreen.js` | 🟡 Cẩn trọng | Sửa | Tích hợp modal chọn PO |

## 6. Thiết kế chi tiết
- `finishOrder(poCodes = null)`:
  1. Kiểm tra batch active. Nếu không có trả về `NO_ACTIVE_BATCH`.
  2. Lấy danh sách PO hiện có của active batch.
  3. Nếu `!poCodes` hoặc `poCodes.length === allPos.length`:
     Chuyển cả active batch thành archived, tạo active batch mới trắng (như cũ).
  4. Nếu `poCodes.length < allPos.length`:
     Tạo batch archived mới:
     `INSERT INTO order_batches (status, finished_date, source_file, mark, imported_at) VALUES ('archived', ?, ?, ?, ?)`
     Cập nhật các PO được chọn:
     `UPDATE pos SET order_batch_id = ? WHERE order_batch_id = ? AND code IN (...)`
     Cập nhật các container của các PO được chọn:
     `UPDATE containers SET order_batch_id = ? WHERE order_batch_id = ? AND po_id IN (...)`
     Sao chép `item_refs` liên quan nếu cần.
- UI:
  `FinishOrderModal` với FlatList danh sách PO, checkbox, nút thao tác, thông báo cảnh báo.
