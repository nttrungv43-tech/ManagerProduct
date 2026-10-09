# FEAT-26 — Nhận diện Mã hàng Vừa cập nhật & Nổi bật Mã PO

## 1. Bối cảnh & mục tiêu
- **Vấn đề người dùng gặp**: Trong sản xuất, nhiều mã hàng trùng tên (`ntk`) nhưng thuộc các mã PO khác nhau (ví dụ cùng mã `1063048GF` nhưng có thẻ ở PO 2919, có thẻ ở PO 2920, PO 2921). Khi người dùng nhập số lượng, rất dễ bị nhầm lẫn giữa các PO, hoặc sau khi bấm "Ghi nhận sản xuất" xong không biết chắc thẻ nào vừa được cộng số liệu.
- **Kết quả mong muốn**:
  1. **Nhận diện sau khi cập nhật**:
     - Thẻ vừa được ghi nhận số liệu sẽ xuất hiện Huy hiệu nổi bật: `⚡ VỪA CẬP NHẬT (PO {po}) lúc {hh:mm}` kèm số lượng vừa nhập.
     - Khung viền thẻ đổi sang màu nổi bật (`theme.good`) với độ dày lớn hơn để dễ định vị ngay khi cuộn danh sách.
  2. **Tránh nhầm lẫn trước và trong khi nhập**:
     - Mã PO trên tiêu đề thẻ được hiển thị dưới dạng Badge nổi bật (`[ PO {po} ]`) thay vì chỉ là dòng chữ phụ màu xám nhỏ.
     - Trong khu vực nhập số lượng (cả nhập chung và nhập theo `order_ref`), có banner ghi rõ: `Đang nhập cho: Mã {ntk} · PO {po}`.

## 2. Phạm vi
- **Làm**:
  - Thêm state `lastUpdatedInfo` và action `setLastUpdatedInfo` trong `src/store/useAppStore.js`.
  - Cập nhật `src/screens/ItemsScreen.js` để truyền `isLastUpdated` và `lastUpdatedInfo` cho `ItemCard`.
  - Cập nhật `src/components/ItemCard.js`:
    + Render Badge PO nổi bật ở tiêu đề thẻ.
    + Render Banner "⚡ VỪA CẬP NHẬT" khi `isLastUpdated === true`.
    + Render viền nổi bật `theme.good` khi `isLastUpdated === true`.
    + Render banner chỉ rõ mã PO trong form nhập liệu (cả form chung và form ref).
  - Viết unit test tự động trong `scripts/test-lastUpdatedHighlight.mjs`.
- **KHÔNG làm (non-goals)**:
  - Không sửa đổi schema SQLite.
  - Không đổi chữ ký hàm của `queries.js`.
- **Cấp thay đổi**: Cấp 1 (thêm UI/UX, thêm state hỗ trợ, không đổi schema).

## 3. Acceptance Criteria
- **AC-ITEM-31 (Huy hiệu Vừa Cập Nhật)**: Sau khi nhập nhật ký sản xuất thành công, thẻ mã hàng vừa thao tác hiển thị huy hiệu `⚡ VỪA CẬP NHẬT (PO {po}) lúc {time}` và viền đổi sang màu nổi bật (`theme.good`).
- **AC-ITEM-32 (Badge PO Nổi bật)**: Mỗi thẻ mã hàng hiển thị Badge `PO {po}` rõ ràng, tách biệt bên cạnh mã hàng.
- **AC-ITEM-33 (Nhắc nhở PO trong Form nhập)**: Trong form nhập sản lượng, hiển thị rõ ràng thông tin PO đang thao tác.
