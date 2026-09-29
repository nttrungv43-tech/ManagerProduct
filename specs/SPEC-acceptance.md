# SPEC-AC — Acceptance Criteria

> **Từ SPEC.md §7** — [Quay lại SPEC.md](SPEC.md) | [SPEC-rules.md](SPEC-rules.md) | [SPEC-test.md](SPEC-test.md)

> Định dạng: **AC-<tab>-<số>**. Trạng thái: ✅ đã cài đặt · 🟡 một phần · ⬜ chưa làm. **Không được làm sai lệch** các AC ✅ khi thêm tính năng.

---

## §7.1 Tab "Mã hàng" (`ItemsScreen`, `ItemCard`)

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-ITEM-01 | ✅ | **Tổng quan** gồm 4 ô: Kế hoạch = Σ`target`; Đã sản xuất = Σ`produced`; Hoàn thành = `Math.round(produced/target*1000)/10` (%) hoặc `0` nếu `target=0`; Hàng lỗi = Σ`defect` (màu `bad`). Thanh tiến độ rộng `min(pct,100)%` |
| AC-ITEM-02 | ✅ | Thẻ mã hàng hiện `Mã {ntk}`, `PO {po}`, phần trăm (1 chữ số thập phân). Màu %: `≥100` → `good`; `≥60` → `warn`; còn lại → `bad` (`pctClass`) |
| AC-ITEM-03 | ✅ | Hiện `Kế hoạch`, `Đã làm`, `Còn lại = max(target − produced, 0)`, `Lỗi` |
| AC-ITEM-04 | ✅ | Chạm tiêu đề thẻ để mở/đóng. Trạng thái mở/đóng là state cục bộ, không mất khi dữ liệu nạp lại |
| AC-ITEM-05 | ✅ | **Thêm nhật ký:** `qty = parseFloat(input)‖0`, `defectQty = parseFloat(input)‖0`. Nếu `qty ≤ 0` **và** `defectQty ≤ 0` thì **không làm gì** (không lỗi, không ghi DB). Ngược lại ghi 1 dòng với `date` = hôm nay, `line` đã chọn, `defectQty`, `defectTypes` |
| AC-ITEM-06 | ✅ | Sau khi thêm: xoá ô nhập, bỏ chọn loại lỗi, mở khung nhật ký và tải lại danh sách, số liệu thẻ và tổng quan cập nhật ngay |
| AC-ITEM-07 | ✅ | `line` mặc định `manual` ("Thủ công"); tuỳ chọn `auto` ("Tự động") |
| AC-ITEM-08 | ✅ | **Loại lỗi** (Thẻ vàng / Thẻ đỏ / Rách bọc) chọn nhiều, không bắt buộc |
| AC-ITEM-09 | ✅ | **Nhật ký:** mới nhất trước; mỗi dòng: `{date} — {qty} pcs · {Thủ công/Tự động}`, thêm `· Lỗi {n}` và tên loại lỗi nếu có |
| AC-ITEM-10 | ✅ | **Xoá dòng nhật ký** phải xác nhận. Huỷ = không đổi. Xác nhận: xoá, tải lại, cập nhật số liệu |
| AC-ITEM-11 | ✅ | **Sửa nhật ký:** chạm "Sửa" trên EntryLogRow → mở form inline (cùng layout với "Thêm"), pre-fill từ entry (`qty`, `line`, `defectQty`, `defectTypes`); validate như AC-ITEM-05 (nếu `qty≤0 && defectQty≤0` → không lưu); `defectTypes` chỉ gửi khi `defectQty>0` (fix BUG-04); Save → Alert xác nhận (INV-U1) → gọi `onUpdateEntry(entryId, payload)` → refresh + `dataVersion` tăng; Cancel → đóng form, `editingId=null`. Chỉ sửa được entry của batch đang `active` (INV-B2) |
| AC-ITEM-12 | ✅ | **Tìm kiếm:** khớp chuỗi con, không phân biệt hoa thường, trên `ntk` |
| AC-ITEM-13 | ✅ | **Lọc PO:** chip "Tất cả PO" + từng PO (tách `po` theo `+`). Mã hàng khớp nếu `po.split('+')` chứa PO đang chọn |
| AC-ITEM-14 | ✅ | **Lọc trạng thái:** `Tất cả` / `Chưa hoàn thành` / `Đã xong` (`target > 0 && produced ≥ target`) |
| AC-ITEM-15 | ✅ | Ba bộ lọc kết hợp **AND**. Không có kết quả → "Không tìm thấy mã hàng nào." |

---

## §7.2 Tab "Container" (`ContainersScreen`, `PalletRow`, `ArchiveCard`)

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-CONT-01 | ✅ | Chip lọc PO (từ `containersData` hoặc `containerData`). Container hiện khi `po.split('+')` chứa PO đang chọn |
| AC-CONT-02 | ✅ | **Kiện 1 loại hàng:** chạm cả dòng để đổi trạng thái, hỏi xác nhận. Key: `${cid}-${no}` |
| AC-CONT-03 | ✅ | **Kiện nhiều loại hàng:** tick từng loại (key `${cid}-${no}-${idx}`), mỗi lần xác nhận. Kiện xong khi đủ mọi key con (`isPalletDone`) |
| AC-CONT-04 | ✅ | **Thống kê container:** `done/total`; `% = Math.round(done/total*1000)/10`; `doneQty/totalQty pcs`; đủ kiện → "Sẵn sàng đóng container ✓" + thanh `good` |
| AC-CONT-05 | ✅ | Mở/đóng container bằng chạm tiêu đề. State cục bộ |
| AC-CONT-06 | ✅ | **Hoàn tất đơn hàng:** hiện `done/total` toàn cục (không phụ thuộc bộ lọc PO). 2 mẫu thông điệp xác nhận |
| AC-CONT-07 | ✅ | **Sau xác nhận:** (a) batch cũ → `archived` (cùng `finished_date`, tổng, `pallets_done/total`); (b) batch mới với `seedItems`, 0 nhật ký; (c) `palletDoneMap` rỗng; (d) lưu trữ có đơn mới ở đầu; (e) **không mất nhật ký** |
| AC-CONT-08 | ✅ | **Đơn đã lưu trữ:** thẻ `Hoàn tất ngày {finished_date}`; chạm mở chi tiết |

---

## §7.3 Tab "Lịch sử" (`HistoryScreen`)

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-HIST-01 | ✅ | Nhóm theo **ngày** (`YYYY-MM-DD`), **tháng** (`Tháng MM/YYYY`), **năm** (`Năm YYYY`), SQL `substr` + `GROUP BY`, giảm dần |
| AC-HIST-02 | ✅ | Mỗi nhóm: tổng pcs, `Thủ công`, `Tự động`, `Lỗi`. Bao gồm **mọi batch** |
| AC-HIST-03 | ✅ | Mở nhóm: `day` → từng dòng; `month`/`year` → gộp theo `ntk` |
| AC-HIST-04 | ✅ | Đổi nhóm thì xoá `historyFilterValue` và trạng thái mở |
| AC-HIST-05 | ✅ | Không có dữ liệu → "Chưa có dữ liệu sản xuất nào được ghi nhận." |
| AC-HIST-06 | ⬜ | Lọc theo ngày/tháng/năm cụ thể (FEAT-02) |
| AC-HIST-07 | ✅ | Tab Lịch sử tự cập nhật khi có dữ liệu mới (qua `dataVersion`) |

---

## §7.4 Toàn cụp

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-APP-01 | ✅ | Khởi động: hiện "Đang tải dữ liệu..." cho tới khi `init()` xong |
| AC-APP-02 | ✅ | Lần chạy đầu tự tạo batch active + nạp `seedItems` (8 mã hàng, 0 sản lượng) |
| AC-APP-03 | ✅ | Tắt app, mở lại: mọi dữ liệu còn nguyên |
| AC-APP-04 | ✅ | Giao diện theo hệ thống sáng/tối (`useColorScheme()` + `theme`) |
| AC-APP-05 | ✅ | Hoạt động hoàn toàn không cần mạng |

---

## §7.5 Import JSON (FEAT-08)

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-IMP-01 | ✅ | Nút "Nhập JSON" trên tab Mã hàng → `DocumentPicker` chọn `.json` |
| AC-IMP-02 | ✅ | Parse JSON → ghi entries; lỗi → `Alert`, không ghi DB |
| AC-IMP-03 | ✅ | Sau nhập: số liệu cập nhật ngay; lịch sử tự cập nhật (`dataVersion`) |
| AC-IMP-04 | ✅ | Entry `ntk` không tồn tại trong `items` → bỏ qua, ghi `skipped` |
| AC-IMP-05 | ✅ | Entry `qty ≤ 0 && defectQty ≤ 0` → bỏ qua |
| AC-IMP-06 | ✅ | Trước ghi: `Alert.alert` xác nhận (INV-U1) |
| AC-IMP-07 | ✅ | `defect_types` array → join(','); `line` không hợp lệ → `manual` |
| AC-IMP-08 | ✅ | Packing list JSON → tự nhận diện, chèn items (INSERT OR REPLACE), cập nhật `total_target` |
| AC-IMP-09 | ✅ | Sau import items: tổng quan cập nhật; lịch sử không ảnh hưởng |
| AC-IMP-10 | 🟡 | Packing list → import **container/pallet structure** (`container_data`); `ContainersScreen` hiển thị ngay |
| AC-IMP-11 | 🟡 | `pallets_total` batch = tổng pallets từ `container_data` (fallback 26 từ seed) |
| AC-IMP-12 | 🟡 | Sau `finishOrder` → archived giữ `container_data`; batch mới reset → fallback seed |
