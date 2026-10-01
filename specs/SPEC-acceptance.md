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
| AC-ITEM-17 | ✅ | **Hạn mức đơn đặt hàng (FEAT-09):** nếu `items.target > 0` thì `SUM(entries.qty)` của mã hàng trong batch `active` **không được vượt** `target`. Thêm nhật ký: nếu `đã làm + qty > target` → `Alert` "Vượt đơn đặt hàng" (nêu `target`, `đã làm`, `còn nhập tối đa`, `vượt`), **không ghi DB**, **không xoá ô nhập** |
| AC-ITEM-18 | ✅ | **Sửa vượt hạn mức (FEAT-09):** tính `đã làm − qtyCũ + qtyMới > target` → `Alert`, **không lưu**, form sửa **vẫn mở**. Sửa làm **giảm** `qty` luôn được phép, kể cả khi `đã làm = target` |
| AC-ITEM-19 | ✅ | **Giá trị số không hợp lệ (FEAT-09):** `''`, `'abc'`, `'12abc'`, âm, số thực, ký hiệu khoa học → **không ghi DB**. Chuẩn hoá `' 120 '`/`'1.200'`/`'1 200'` → `1200`. Ô trống vẫn giữ hành vi im lặng của AC-ITEM-05 |
| AC-ITEM-20 | ✅ | **Bảng tổng theo PO** hiển thị **ngay dưới** 4 ô `SummaryCards`; 4 ô cũ giữ nguyên, không đổi số — *FEAT-12* |
| AC-ITEM-21 | ✅ | Mỗi dòng hiện PO + 3 số: `Tổng = Σ target`, `Đã sản xuất = Σ produced`, `Còn lại = Σ max(target − produced, 0)` (cùng công thức AC-ITEM-03) |
| AC-ITEM-22 | ✅ | Mã thuộc **nhiều PO** (`po.split('+').length > 1`) **không** cộng vào PO nào; gom vào **một** dòng `Nhiều PO (n mã)`. `A+B` và `B+A` cùng vào nhóm này |
| AC-ITEM-23 | ✅ | **Σ cột "Tổng" của mọi dòng == số "Kế hoạch" ở `SummaryCards`** — không cộng trùng, không bỏ sót (INV-D6) |
| AC-ITEM-24 | ✅ | Có dòng cho **mọi PO trong `allPOs()`**, kể cả PO không có mã thuộc riêng (hiện `0 / 0 / 0`) ⇒ khớp chip lọc PO |
| AC-ITEM-25 | ✅ | Bảng **không** đổi theo tìm kiếm / chip PO / lọc trạng thái — luôn tính trên **toàn bộ** `items`, giống AC-ITEM-01. Là tham chiếu ổn định của cả đơn |
| AC-ITEM-26 | ✅ | Dòng sắp `Tổng` **giảm dần**; bằng nhau thì tên PO **tăng dần**. Số dùng `toLocaleString()` như `SummaryCards` |
| AC-ITEM-27 | ✅ | Bảng cập nhật ngay sau thêm nhật ký, và sau thêm/sửa/xoá mã hàng (FEAT-10/11). `items` rỗng ⇒ hiện `Chưa có mã hàng.` |
| AC-ITEM-28 | ✅ | `target = 0` không làm vỡ bảng: `Tổng = 0`, `Còn lại = 0`, không chia/phép trừ |
| AC-ITEM-29 | ✅ | Chỉ dùng token `theme`, không hard-code màu |

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
| AC-IMP-13 | ✅ | **Import vượt hạn mức (FEAT-09):** kiểm tra **tích luỹ** theo thứ tự file; entry làm `đã làm + qty > target` → **bỏ qua**, đếm vào `skippedOver`; `Alert` kết quả báo rõ số mục bị bỏ qua. `ntk` không tồn tại vẫn tính vào `skipped` (không phải `skippedOver`) |

---

## §7.6 Sửa dữ liệu sản phẩm & kiện (FEAT-10)

> Chi tiết: [`features/FEAT-10-edit-items-pallets.md`](features/FEAT-10-edit-items-pallets.md).
> Khoá pallet dùng **định danh `ntk`** (Q1 = PA A): `${cid}-${no}-${ntk}`. Xem `SPEC-data.md` §5.5.2.

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-EDIT-01 | ✅ | Nút "＋ Thêm mã hàng" trên tab Mã hàng. Form: `ntk` (bắt buộc), `po` (mặc định = PO đang lọc; nếu lọc "Tất cả PO" thì bắt chọn), `target` (bắt buộc) |
| AC-EDIT-02 | ✅ | Lưu mã hàng mới → có dòng `items` cho batch `active`; danh sách + `order_batches.total_target` cập nhật ngay |
| AC-EDIT-03 | ✅ | `ntk` đã tồn tại trong batch → chặn, báo "Mã hàng đã tồn tại"; không tạo dòng trùng (PK `(ntk, order_batch_id)`) |
| AC-EDIT-04 | ✅ | `ntk` rỗng / có khoảng trắng / sai định dạng → chặn. Chỉ nhận `[0-9A-Za-z]+` (khớp AC-ITEM-12 và bộ lọc import) |
| AC-EDIT-05 | ✅ | `target` không phải số nguyên ≥ 0 → chặn, dùng lại `parseQty` của FEAT-09 |
| AC-EDIT-06 | ✅ | Sửa `target` xuống dưới số đã sản xuất → **chặn** + báo lỗi (bảo vệ INV-V1 của FEAT-09) |
| AC-EDIT-07 | ✅ | Sửa `target` **tăng** → cho phép |
| AC-EDIT-08 | ✅ | Xoá mã hàng: `Alert` xác nhận nêu hậu quả → xoá khỏi `items`, `total_target` giảm, cập nhật ngay |
| AC-EDIT-09 | ✅ | Xoá mã hàng **đã có nhật ký** (`SUM(qty) > 0`) → **chặn** (INV-D5), hướng dẫn sửa số lượng thay vì xoá |
| AC-EDIT-10 | ✅ | Xoá mã hàng **đang có trong kiện** → chặn, báo số kiện còn chứa (INV-V2) |
| AC-EDIT-11 | ✅ | Đang lọc PO A nhưng thêm mã thuộc PO B → vẫn cho phép, hiện cảnh báo "không thuộc PO đang lọc" |
| AC-EDIT-12 | ✅ | Lọc "Tất cả PO": thao tác chỉ áp dụng cho **đúng mã hàng** được chọn |
| AC-EDIT-13 | ✅ | Batch `archived` → **không** hiện nút Thêm/Sửa/Xoá (INV-B2) |
| AC-EDIT-14 | ✅ | Nút "＋ Thêm kiện" trong mỗi container. Form: số hiệu (mặc định `max(no)+1`), các dòng `{ntk, qty}`; `ntk` chỉ chọn được mã trong `items` của batch |
| AC-EDIT-15 | ✅ | Lưu kiện mới → xuất hiện trong container; `pallets_total` +1; thống kê `done/total`, `%`, `pcs` cập nhật; kiện mới **chưa** tick |
| AC-EDIT-16 | ✅ | Sửa số lượng một dòng hàng trong kiện → `pcs` cập nhật, **giữ nguyên** trạng thái tick |
| AC-EDIT-17 | ✅ | Xoá 1 dòng hàng khỏi kiện nhiều loại → tick của các dòng còn lại **không mất** (phụ thuộc Q1; nếu khoá theo chỉ số thì phải cảnh báo mất trạng thái và xác nhận) |
| AC-EDIT-18 | ✅ | Thêm dòng hàng thứ 2 vào kiện 1 loại đã tick → kiện thành nhiều loại; **không mất** trạng thái tick (phụ thuộc Q1) |
| AC-EDIT-19 | ✅ | Xoá kiện → `Alert` nêu số pcs mất → gỡ khỏi JSON, `pallets_total` −1, **xoá luôn** dòng `pallet_status` của kiện đó |
| AC-EDIT-20 | ✅ | Xoá kiện giữa dãy → các kiện còn lại **giữ nguyên số hiệu**, không đánh số lại |
| AC-EDIT-21 | ✅ | **Đổi số hiệu kiện: cấm ở v1** (tránh phải di chuyển khoá `pallet_status`) |
| AC-EDIT-22 | ✅ | Chưa có `container_data` (đang dùng seed) → sửa kiện lần đầu sẽ **vật chất hoá** seed vào DB, giữ nguyên `id` `c1`/`c2`/`c3` để không mất trạng thái tick |
| AC-EDIT-23 | ✅ | Kiện chứa `ntk` không còn trong `items` → vẫn hiển thị, kèm cảnh báo; **không** tự xoá |
| AC-EDIT-24 | ✅ | `pallet_status` + `container_data` + `pallets_total` ghi trong **cùng một transaction**; JSON hỏng ⇒ rollback, không ghi nửa |
| AC-EDIT-25 | ✅ | Import lại packing list khi đã sửa kiện tay → `Alert` cảnh báo **sẽ ghi đè toàn bộ** chỉnh sửa kiện, yêu cầu xác nhận |
| AC-EDIT-26 | ✅ | Thẻ mã hàng có nút `✕ Xoá mã hàng` cạnh nút `✎ Sửa` (xoá trong 1 chạm) — *FEAT-11* |
| AC-EDIT-27 | ✅ | Bấm nút xoá → `Alert` nhắc **đúng tên mã** → mới xoá thật (INV-U1) |
| AC-EDIT-28 | ✅ | Bấm **Huỷ** → không xoá, `dataVersion` không tăng |
| AC-EDIT-29 | ✅ | *(giữ AC-EDIT-09)* Mã đã có nhật ký → vẫn chặn `ITEM_HAS_ENTRIES` từ nút xoá trên thẻ |
| AC-EDIT-30 | ✅ | *(giữ AC-EDIT-10)* Mã đang có trong kiện → vẫn chặn `ITEM_IN_PALLETS` từ nút xoá trên thẻ |
| AC-EDIT-31 | ✅ | Xoá thành công → mã biến mất, `total_target` giảm đúng bằng `target` bị xoá |
| AC-EDIT-32 | ✅ | *(giữ AC-EDIT-13)* Batch `archived` → không hiện nút xoá (INV-B2, INV-V3) |
| AC-EDIT-33 | ✅ | Nhãn + thông báo nút xoá trên thẻ **giống hệt** nút xoá trong sheet (một hàm dùng chung) |
| AC-EDIT-34 | ✅ | Cả hai nút dùng cùng bản dịch lỗi: `ITEM_EXISTS`/`ITEM_NOT_FOUND`/`ITEM_HAS_ENTRIES`/`ITEM_IN_PALLETS` |
| AC-EDIT-35 | ✅ | `ItemCard` không nhận `onDeleteItem` → nút xoá **không** hiện (mặc định an toàn) |
| AC-EDIT-36 | ✅ | Lọc PO / tìm kiếm / lọc trạng thái không bị lệch sau khi xoá |
