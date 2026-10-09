# FEAT-25 — Quản lý & Cập nhật Container (Mã container, Số seal chì)

## 1. Bối cảnh & mục tiêu
- **Vấn đề người dùng gặp**: Hiện tại trên giao diện tab Container, người dùng chỉ có thể xem danh sách container và thêm/sửa/xoá các kiện hàng (pallet) bên trong. Không có chức năng chỉnh sửa trực tiếp tên container (`container_no`) hay số chì (`seal_no`), cũng như chưa có giao diện thêm container mới bằng tay hay xoá container thừa khi cần điều chỉnh thực tế tại xưởng.
- **Kết quả mong muốn**:
  1. Cho phép người dùng chạm nút "✏️ Sửa" trên từng container để cập nhật Tên / Mã container (`container_no`) và Số niêm chì (`seal_no`).
  2. Hiển thị thông tin số seal (`Seal: ...`) trực tiếp bên cạnh mã PO trên thẻ container.
  3. Cho phép xoá container (kèm cảnh báo xác nhận rõ ràng nếu container đang chứa các kiện hàng).
  4. Cho phép thêm container mới bằng tay (chọn PO thuộc đơn hàng, nhập mã container và số seal).
  5. Đảm bảo toàn vẹn dữ liệu: chặn để trống tên container, chặn trùng mã container trong cùng một đơn hàng (`order_batch_id`), hỗ trợ đầy đủ các thao tác qua store và lưu vào SQLite.

## 2. Phạm vi
- **Làm**:
  - Viết các hàm nghiệp vụ trong `src/db/queries.js`:
    + `updateContainer(batchId, containerId, { container_no, seal_no })`
    + `removeContainer(batchId, containerId)`
    + `addContainer(batchId, poCode, { container_no, seal_no })`
  - Thêm các action tương ứng trong `src/store/useAppStore.js`.
  - Tạo component `src/components/ContainerEditSheet.js` làm modal bottom sheet cho form thêm/sửa container.
  - Tích hợp vào `src/screens/ContainersScreen.js`.
  - Viết bộ kiểm thử unit/integration tự động trong `scripts/test-containerEdit.mjs`.
- **KHÔNG làm (non-goals)**:
  - Không thay đổi cấu trúc bảng CSDL (bảng `containers` từ FEAT-21 đã có đủ các cột `id, order_batch_id, po_id, container_no, seal_no`).
- **Cấp thay đổi**: Cấp 1 (thêm tính năng mới, thêm component, không đổi schema hay chữ ký hàm cũ).

## 3. Acceptance Criteria
- **AC-CONT-10 (Hiển thị Số Seal)**: Trên thanh tiêu đề của mỗi container card, nếu container có `seal_no`, hiển thị thêm ` · Seal: {seal_no}` bên cạnh `PO {po}`.
- **AC-CONT-11 (Nút Sửa container)**: Mỗi container có nút "✏️ Sửa" riêng biệt, bấm vào không kích hoạt việc đóng/mở danh sách kiện mà mở bottom sheet sửa container.
- **AC-CONT-12 (Cập nhật Container)**: Người dùng có thể sửa `container_no` và `seal_no`. Hệ thống cập nhật thành công và tự động đồng bộ lại danh sách container trên UI.
- **AC-CONT-13 (Chặn dữ liệu không hợp lệ)**:
  + Nếu tên container để trống hoặc chỉ có khoảng trắng: Báo lỗi `Tên / số container không được để trống.`
  + Nếu tên container bị trùng với một container khác trong cùng đơn: Báo lỗi `Mã container "{container_no}" đã tồn tại trong đơn hàng.`
  + Giữ nguyên tên của chính container đang sửa thì không bị báo lỗi trùng.
- **AC-CONT-14 (Xoá container)**:
  + Cho phép xoá container với `Alert.alert` cảnh báo trước.
  + Nếu container có kiện hàng: Thông báo rõ số lượng kiện sẽ bị xoá cùng container.
  + Khi xoá thành công: Container và toàn bộ kiện bên trong được dọn dẹp sạch sẽ (CASCADE).
- **AC-CONT-15 (Thêm container thủ công)**: Có nút "＋ Thêm container" trên giao diện tab Container, cho phép chọn PO và nhập mã container để thêm container mới vào đơn hàng đang sản xuất.

## 4. Kế hoạch file
| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `specs/features/FEAT-25-container-crud.md` | 🟢 Tự do | Thêm mới | Đặc tả tính năng |
| `src/db/queries.js` | 🔒 Đóng băng | Mở rộng | Thêm `updateContainer`, `removeContainer`, `addContainer` |
| `src/store/useAppStore.js` | 🔒 Đóng băng | Mở rộng | Thêm actions quản lý container |
| `src/components/ContainerEditSheet.js` | 🟢 Tự do | Thêm mới | Modal giao diện thêm / sửa container |
| `src/screens/ContainersScreen.js` | 🟡 Cẩn trọng | Sửa | Tích hợp nút sửa, nút thêm, hiển thị seal_no |
| `scripts/test-containerEdit.mjs` | 🟢 Tự do | Thêm mới | Bộ kiểm thử tự động cho container CRUD |
