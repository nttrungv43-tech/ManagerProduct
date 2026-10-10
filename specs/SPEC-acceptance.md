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
| AC-ITEM-30 | ✅ | **Đơn trắng (FEAT-14):** 4 ô tổng = `0`, bảng PO hiện `Chưa có mã hàng.` (`AC-ITEM-27`), danh sách hiện `Chưa có mã hàng nào trong đơn hàng này. Bấm ＋ Thêm mã hàng hoặc Nhập JSON để bắt đầu` (khác `Không tìm thấy mã hàng nào.` của `AC-ITEM-15` là do bộ lọc) |
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
| AC-CONT-07 | ✅ | **Sau xác nhận:** (a) batch cũ → `archived` (cùng `finished_date`, tổng, `pallets_done/total`); (b) batch mới **trắng** (`FEAT-14`): 0 dòng `items`, `total_target = 0`, `pallets_total = 0`, `container_data = '[]'`, 0 nhật ký; (c) `palletDoneMap` rỗng; (d) lưu trữ có đơn mới ở đầu; (e) **không mất nhật ký** |
| AC-CONT-08 | ✅ | **Đơn đã lưu trữ:** thẻ `Hoàn tất ngày {finished_date}`; chạm mở chi tiết |
| AC-CONT-09 | ✅ | Batch mới trắng ⇒ tab Container hiện `Chưa có container trong đơn hàng này.` kèm gợi ý nhập packing list; **không** render 26 kiện mẫu; chip lọc PO ẩn khi không có container |
| AC-CONT-10 | ✅ | Thống kê đơn rỗng = `0/0 kiện`, thanh tiến độ `0%`, **không** chia/chia-cho-0; nút `Hoàn tất đơn hàng hiện tại` vẫn dùng được (cho phép hoàn tất đơn rỗng) |

> **Đơn mới luôn trắng (FEAT-14, v1.8)** — chi tiết: [`features/FEAT-14-empty-new-order.md`](features/FEAT-14-empty-new-order.md).
> Đóng `DEBT-02`/`FEAT-07` (Cấp 3, chủ dự án đã chọn 2026-10-02): `finishOrder` **không** nạp `seedItems`/`containersData`.
> Dấu hiệu "batch không có container" là `container_data = '[]'` (phân biệt "trống có chủ ý" với "chưa có hàng"
> — trường hợp này mới fallback seed). **Lần chạy đầu vẫn nạp seed** (`AC-APP-02`, `ensureActiveBatch` không đổi).
> Hệ quả nghiệp vụ: đơn mới không có container ⇒ phải **Nhập packing list** trước khi thêm kiện.
>
> **Sửa BUG-02/03 (v1.7)** — chi tiết: [`features/BUGFIX-02-03-finish-order.md`](features/BUGFIX-02-03-finish-order.md).
> Toàn bộ phần ghi của `finishOrder` nằm trong **một** transaction (INV-B3); `UPDATE … AND status='active'`;
> nút bị khoá khi đang chạy (`⏳ Đang hoàn tất…`) và lần bấm thứ hai bị từ chối (`BUSY`);
> `finished_date` dùng **ngày cục bộ** (`todayLocal()`) nên không lệch ngày khi hoàn tất lúc 00:00–06:59 VN.
> AC-CONT-06/07 giữ nguyên — không đổi nội dung thông điệp, tổng chốt hay cách lưu trữ.

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
| AC-APP-02 | ✅ | **Chỉ lần chạy đầu** tự tạo batch active + nạp `seedItems` (8 mã hàng, 0 sản lượng). Đơn tạo sau `finishOrder` là **trắng** (`FEAT-14`, `AC-CONT-07b`) |
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
| AC-IMP-12 | ✅ | Sau `finishOrder` → batch `archived` **giữ nguyên** `container_data`; batch mới có `container_data = '[]'` ⇒ hiển thị rỗng, **không** fallback seed (`FEAT-14`) |
| AC-IMP-14 | ✅ | **Import packing list vào đơn trắng (FEAT-14):** `INSERT OR REPLACE` ghi đè `container_data = []`, chèn `items`, `pallets_total` cập nhật ⇒ cả hai tab có dữ liệu ngay |
| AC-IMP-15 | 🟡 | **Nhập thẳng định dạng mới (FEAT-17):** `packing_data.json` (`schema_version: 1`) nhận diện và nạp **thật** — 64 mã, Σ `target` = 51.568, 26 container, 468 kiện liên tục `1..468`; `po` **chính xác từng mã** (`A+B` khi nhiều shipment) |
| AC-IMP-16 | 🟡 | **4 trường mỗi mã (FEAT-17):** lưu + hiển thị `nw_kg`, `gw_kg`, `volume_cbm`, `package_count`; `NULL` ⇒ **ẩn**, không hiện `0` (`INV-I1`) |
| AC-IMP-17 | 🟡 | **All-or-nothing (FEAT-17):** `problem` chặn ⇒ `Alert` tiếng Việt liệt kê lý do và **0** lệnh ghi DB (`INV-I4`) |
| AC-IMP-18 | 🟡 | Định dạng **cũ** (`總表`, `entries`) hành vi **không đổi** sau FEAT-17 (`AC-IMP-08`, `AC-IMP-13`) |
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

---

## §7.7 Xoá mã hàng theo PO (FEAT-13)

> Chi tiết: [`features/FEAT-13-delete-items-by-po.md`](features/FEAT-13-delete-items-by-po.md).
> Quyết định Q1–Q6: xem spec §2.1. Tóm tắt: mã **thuộc nhiều PO bị bỏ qua** (Q1) · mã **đã có nhật ký /
> còn trong kiện ⇒ chặn toàn bộ** (Q2) · **không** có chế độ ghi đè (Q3) · chỉ xoá **1 PO đã chọn** (Q4) ·
> tự về `Tất cả PO` khi PO đang lọc hết mã (Q5) · PO hết mã thì **biến mất** khỏi chip/bảng (Q6).

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-DEL-01 | ✅ | Nút `🗑 Xoá theo PO` ở tab Mã hàng, cạnh `＋ Thêm mã hàng`. **Chỉ** hiện khi store đang nạp batch `active` (`state.batchId` có giá trị — INV-V3, giống nút xoá trên thẻ) |
| AC-DEL-02 | ✅ | Sheet có Picker chọn PO (`allPOs(items)`) + **preview**: `Xoá {n} mã · giảm {target} pcs kế hoạch`, danh sách mã, và **Đang kiểm tra…** khi đang tải. Preview **không** ghi DB, **không** vật chất hoá seed vào `container_data` |
| AC-DEL-03 | ✅ | Bấm `Xoá cả PO` → `Alert` nêu **đúng tên PO**, số mã, tổng pcs (phân tách nghìn kiểu VN) và câu `Thao tác này không thể hoàn tác.` (INV-U1). Nhãn `Huỷ`/`Xoá` dùng **chung** với nút xoá 1 mã |
| AC-DEL-04 | ✅ | Xác nhận → `DELETE` **mọi** mã có `po.split('+')` chứa PO đó, trong **một** `withTransactionAsync`; `order_batches.total_target` tính lại **cùng transaction** (INV-V4). Trả `{ok:true, removed, removedTarget, skippedMulti}` |
| AC-DEL-05 | ✅ | Bấm `Huỷ` → không xoá, không báo lỗi, `dataVersion` **không** tăng (đồng bộ AC-EDIT-28) |
| AC-DEL-06 | ✅ | Bất kỳ mã nào của PO **đã có nhật ký** (`SUM(entries.qty) > 0`) ⇒ **chặn toàn bộ**, **không xoá dòng nào**; Alert liệt kê từng mã bị chặn và số pcs nhật ký (mở rộng AC-EDIT-09, bảo vệ INV-D5) |
| AC-DEL-07 | ✅ | Bất kỳ mã nào **còn nằm trong kiện** ⇒ **chặn toàn bộ**; Alert nêu số kiện của từng mã (mở rộng AC-EDIT-10, bảo vệ INV-V2) |
| AC-DEL-08 | ✅ | Mã **thuộc nhiều PO** (`po` có `+`) **không bị xoá**; preview và Alert xác nhận nêu `Bỏ qua {n} mã thuộc nhiều PO`. PO còn lại vẫn giữ mã đó ở mọi PO của nó |
| AC-DEL-09 | ✅ | PO bị xoá hết mã ⇒ **biến mất** khỏi chip lọc PO và dòng bảng `Tổng theo PO` (hệ quả dẫn xuết từ `items`, **không phải lỗi**). `Σ` bảng PO vẫn khớp `Kế hoạch` (INV-D6) |
| AC-DEL-10 | ✅ | Xoá xong mà PO **đang lọc** không còn mã nào ⇒ chip lọc tự trở về `Tất cả PO`; không kẹt ở màn hình trống |
| AC-DEL-11 | ✅ | Sau khi xoá: `SummaryCards`, `PoSummaryTable`, danh sách thẻ và tab Lịch sử cập nhật ngay (`refreshItems()` + `dataVersion++`, AC-HIST-07) |
| AC-DEL-12 | ✅ | Batch `archived` ⇒ không hiện nút (AC-EDIT-13/32, INV-B2). Thông báo lỗi dùng **chung** `itemErrorMessage()` của `utils/deleteItem.js`; mã lỗi lạ ⇒ thông báo chung, không crash |

---

## §7.7b Số lượng riêng cho từng PO (FEAT-18)

> Chi tiết: [`features/FEAT-18-po-per-code.md`](features/FEAT-18-po-per-code.md).
> Nguồn: bảng `item_po` (`SPEC-data.md` §5.6b). Đây là bước **lưu và hiển thị**; phần *nhập* chuỗi
> `packing_data.json` (cho phép tách `2924` / `2929` khi nhập lại file nguồn) là phạm vi sau.

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-PO-01 | ✅ | Cột `Tổng` của bảng `Tổng theo PO` lấy `SUM(item_po.qty)` **theo từng PO**, thay vì chỉ cộng mã thuộc riêng PO đó. Mã đa PO có dòng trong `item_po` **được tính vào đúng PO của nó** |
| AC-PO-02 | ✅ | Mỗi PO có `Tổng` **riêng** và đúng phần của nó: cùng một mã `A` thuộc `2924+2929` cộng `2924` vào hàng `2924`, `2929` vào hàng `2929` — không cộng trọn `target` vào cả hai |
| AC-PO-03 | ✅ | `Σ` cột `Tổng` của bảng PO **luôn** bằng `Kế hoạch` (Σ `items.target`) — kể cả khi có mã đa PO (bảo vệ `INV-D6`) |
| AC-PO-04 | ✅ | PO **không** có dòng nào trong `item_po` ⇒ `Tổng = 0`, **không** phải `NULL`, không hiện `—` hay dấu `?` |
| AC-PO-05 | ✅ | Mã đa PO **chưa** có dòng trong `item_po` (backfill không tách được) ⇒ hành vi **giống hệt FEAT-12**: gom vào nhóm `Nhiều PO (n mã)`, không cộng vào PO nào. Không hiển thị sai/lệch số |
| AC-PO-06 | ✅ | Các ô khác của bảng PO (`Đã làm`, `Còn lại`, `Lỗi`, `Kế hoạch`, `Mã`) và mọi chip lọc PO giữ **nguyên** cách tính từ `items` — FEAT-18 chỉ thay **cột `Tổng`**, không đổi hợp đồng dữ liệu/runtime |
| AC-PO-07 | ✅ | `poSummaries()` nhận thêm `itemPoRows` (danh sách `{ntk, po, qty}`) — tham số **tuỳ chọn**, không bắt buộc ⇒ mọi nơi gọi cũ vẫn chạy được, không breaking |
| AC-PO-08 | ✅ | **Migration v4** tạo `item_po` và backfill mã **một PO** với `qty = target`; mã đa PO / `po` rỗng / `po` `NULL` **không** tạo dòng (`TRIM` khoảng trắng thừa). Chạy lại v4 **không** lỗi, **không** nhân bản |
| AC-PO-09 | ✅ | PK `(ntk, po, order_batch_id)` chặn trùng; cùng mã ở **khác batch** là dòng độc lập. Migration là loại **bổ sung**: không `DROP`, không `ALTER` phá huỷ, `schema.js` 🔒 không sửa, app cũ vẫn mở được |

> **Sửa `AC-DEL-09`:** PO bị xoá hết mã vẫn **biến mất** khỏi bảng PO như trước (PO có dòng là PO có mã);
> nhưng lý do giờ là `item_po`, không phải `items`. `Σ` bảng PO vẫn khớp `Kế hoạch` (`INV-D6`).

---

## §7.7c Tách mã nhiều PO thành từng dòng riêng (FEAT-19)

> Chi tiết: [`features/FEAT-19-split-item-by-po.md`](features/FEAT-19-split-item-by-po.md).
> Ba điểch mơ hồ đã **hỏi và chốt** với chủ dự án 2026-10-04 (Q1 dùng chung số đã làm của mã ·
> Q2 4 trường FEAT-17 chỉ ở dòng đầu · Q3 ẩn Sửa/Xoá ở dòng tách) — **không** suy đoán.
> Nguồn: `splitItemRows()` (`src/utils/itemRows.js`) đọc bảng `item_po` của FEAT-18.

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-SPLIT-01 | ✅ | Mã thuộc nhiều PO **và** có dòng `item_po` ⇒ tách thành **nhiều thẻ**, mỗi thẻ **một PO**; tiêu đề thẻ **không** còn chuỗi `A+B`. Ví dụ `106167GF` → thẻ `PO 2922` + thẻ `PO 2923` |
| AC-SPLIT-02 | ✅ | `Kế hoạch` mỗi thẻ = `item_po.qty` của **riêng PO đó** (`106167GF`: 270 và 135, thay vì 405 chung) |
| AC-SPLIT-03 | ✅ | `Σ Kế hoạch` của các thẻ của một mã **bằng** `items.target` của mã đó ⇒ danh sách không cộng trùng (**INV-D7**) |
| AC-SPLIT-04 | ✅ | Mã thuộc **một** PO ⇒ **không đổi gì**: 1 thẻ, PO, kế hoạch, 4 trường FEAT-17, nút Sửa/Xoá như cũ |
| AC-SPLIT-05 | ✅ | Mọi thẻ của cùng một mã hiện **cùng** `Đã làm` / `Lỗi` (nhật ký sản xuất chỉ ghi theo **mã**) + có **ghi chú** *"Dùng chung với n PO khác — số đã làm/lỗi tính chung cho cả mã này"* |
| AC-SPLIT-06 | ✅ | 4 trường `KL`/`TKL`/`Thể tích`/`Kiện` hiện **chỉ ở thẻ tách đầu tiên**; thẻ sau đặt `null` ⇒ ẩn theo `INV-I1`. Không nhân đôi số liệu |
| AC-SPLIT-07 | ✅ | Thẻ tách **không** có nút `✎ Sửa mã hàng & số lượng` và `✕ Xoá mã hàng` (vì `updateItem`/`removeItem` nhắm theo **mã**, bấm ở dòng nào cũng mất hết PO). Thẻ mã một PO **vẫn** có |
| AC-SPLIT-08 | ✅ | Chip lọc PO `2922` chỉ hiện thẻ `106167GF` ở PO `2922`, **không** hiện thẻ PO `2923`; tìm kiếm theo mã hiện **mọi** thẻ của mã đó. `key` React gồm cả `po` nên 2 thẻ không đụng nhau (vá **BUG-06**) |
| AC-SPLIT-09 | ✅ | Bộ lọc `Chưa hoàn thành`/`Đã xong` tính theo **mã** (`items.target` vs `items.produced`) — **không** dùng kế hoạch per-PO, vì sản lượng không tách được theo PO |
| AC-SPLIT-10 | ✅ | Mã nhiều PO **chưa** có dòng `item_po` (dữ liệu cũ, chưa nhập lại file nguồn) ⇒ giữ **1 thẻ gộp** như trước **kèm ghi chú** *"Chưa tách được theo PO — nhập lại file nguồn (packing_data.json) để tách từng PO"*. **Không** bịa số lượng per-PO |
| AC-SPLIT-11 | ✅ | `SummaryCards` và bảng `Tổng theo PO` **không đổi** — vẫn tính từ `items` (mức mã) nên không cộng trùng; đây là nơi xem số tổng đúng |
| AC-SPLIT-12 | ✅ | Thêm nhật ký sản xuất ở **bất kỳ** thẻ tách nào ⇒ ghi vào `entries` của **mã** đó ⇒ cả hai thẻ cùng tăng (không nhân đôi) |
| AC-SPLIT-13 | ✅ | `items.target` và `order_batches.total_target` **không đổi**; `INV-V1` (`Σ entries.qty ≤ items.target`) giữ nguyên. **Không** migration, `schema.js` 🔒 không đụng |

> **Hệ quả cần biết:** `Còn lại` của các thẻ tách **không cộng lại** được bằng `Còn lại` thật của mã, vì
> sản lượng là **một** con số dùng chung cho mọi PO của mã. `SummaryCards` phía trên là nguồn số tổng
> đúng — cùng lý do FEAT-18 §6.3 không phân bổ `produced` theo PO.

---

## §7.8 Hoàn tất đơn hàng — an toàn giao dịch (BUGFIX-02/03)

> Chi tiết: [`features/BUGFIX-02-03-finish-order.md`](features/BUGFIX-02-03-finish-order.md).

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-FIN-01 | ✅ | Toàn bộ phần **ghi** của `finishOrder` nằm trong **một** `withTransactionAsync`; lỗi giữa chừng ⇒ rollback, batch cũ **không** bị archive (INV-B3) |
| AC-FIN-02 | ✅ | `UPDATE … WHERE id=? AND status='active'`; không cập nhật được dòng nào ⇒ ném lỗi và rollback |
| AC-FIN-03 | ✅ | Gọi `finishOrder()` lần thứ hai khi đang chạy ⇒ `{ok:false, error:{code:'BUSY'}}`, không tạo batch thứ hai (INV-B1) |
| AC-FIN-04 | ✅ | Nút hoàn tất **khoá** và đổi nhãn `⏳ Đang hoàn tất…` khi `finishing` |
| AC-FIN-05 | ✅ | Lỗi khi hoàn tất ⇒ `Alert` tiếng Việt; dữ liệu giữ nguyên nhờ rollback |
| AC-FIN-06 | ✅ | `finished_date` và mọi ngày ghi mới dùng **ngày cục bộ** (`todayLocal()`), định dạng `YYYY-MM-DD` (INV-D2, RC-19) |
| AC-FIN-07 | ✅ | DB lỡ có > 1 batch `active` ⇒ `ensureActiveBatch` giữ batch **mới nhất**, chuyển batch còn lại sang `archived`; **không** xoá dữ liệu nào |
| AC-FIN-08 *(đổi ở FEAT-14)* | ~~Batch mới nạp seed bằng `INSERT OR IGNORE` + `recalcBatchTargetInTx`~~ ⇒ **Batch mới rỗng**: `total_target = 0`, `pallets_total = 0`, 0 dòng `items`; `container_data = '[]'` (AC-CONT-07b, AC-CONT-09) |
| AC-FIN-09 | ✅ | Chữ ký `finishOrder(containers)` không đổi; chỉ **thêm** giá trị trả về `{ok, batchId}` |

---

## §7.9 Quản lý đơn hàng lưu trữ (FEAT-15)

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-ARCH-01 | ✅ | Tiêu đề mục lưu trữ có **thanh công cụ**: nút `👁 Ẩn nội dung` / `👁 Hiện nội dung`, nhãn đổi theo trạng thái. Chỉ hiện khi có ít nhất 1 đơn lưu trữ |
| AC-ARCH-02 | ✅ | Mỗi thẻ đơn lưu trữ có **2 vùng chạm tách biệt**: mũi tên `▾/▴` (mở/đóng nội dung — giữ nguyên `AC-CONT-08`) và nút **`🗑`** ở góc phải, **không** nằm trong vùng chạm mở nội dung ⇒ không xoá nhầm khi chỉ muốn xem |
| AC-ARCH-03 | ✅ | `👁 Ẩn nội dung` ⇒ **mọi** thẻ cùng thu gọn (không gọi DB); `👁 Hiện nội dung` ⇒ mọi thẻ cùng mở, mỗi thẻ nạp chi tiết **một lần** (`fetchArchiveItems`). Chạm `▾` trên một thẻ khi đang thu gọn tất cả ⇒ chuyển sang điều khiển từng thẻ và mở đúng thẻ đó |
| AC-ARCH-04 | ✅ | Bấm `🗑` ⇒ `Alert.alert` **2 nút** `Huỷ` · `Xoá hẳn` (tiêu đề `Xoá đơn hàng đã lưu trữ?`). Nội dung nêu ngày hoàn tất, `sản lượng/kế hoạch`, số mã hàng, số nhật ký, số kiện + cảnh báo *"Xoá hẳn sẽ xoá vĩnh viễn dữ liệu đơn này. Số liệu ở tab Lịch sử cũng sẽ giảm theo."* (INV-U1, INV-B4) |
| AC-ARCH-05 | ✅ | **Xoá hẳn:** xoá `entries` → `items` → `pallet_status` → `container_data` → `order_batches` trong **một** `withTransactionAsync` (all-or-nothing, `INV-D5`); chỉ nhắm `status='archived'`; không có dòng ⇒ rollback + `{ok:false, error:{code:'ARCHIVE_NOT_FOUND'}}` ⇒ `Alert` tiếng Việt |
| AC-ARCH-06 | ✅ | Đơn `active` không có nút `🗑`; gọi `deleteArchive(activeId)` ⇒ `{ok:false, error:{code:'BATCH_ACTIVE'}}`, **không** xoá gì (`INV-B1`) |
| AC-ARCH-07 | ✅ | Sau khi xoá: danh sách lưu trữ cập nhật ngay (`refreshArchives()`), tab **Lịch sử** tự cập nhật qua `dataVersion++` (`AC-HIST-07`) |
| AC-ARCH-08 | ✅ | Không còn đơn lưu trữ nào ⇒ mục lưu trữ biến mất (không để lại vùng trống) |
| AC-HIST-08 | ✅ | **Xoá hẳn** đơn lưu trữ ⇒ nhóm Lịch sử chứa ngày đó **giảm** tương ứng (tổng / Thủ công / Tự động / Lỗi và dòng chi tiết); hệ quả **có chủ ý** đã được chủ dự án chấp thuận 2026-10-02, không phải lỗi |

> **Sửa `AC-CONT-08`:** thẻ đơn lưu trữ có thêm nút `🗑`; giữ nguyên nhãn `Hoàn tất ngày {finished_date}` và hành vi mở/đóng chi tiết.
> **Sửa `INV-B2`** (`SPEC-rules.md`): dữ liệu `archived` **vẫn cấm sửa**, được phép **xoá hẳn có kiểm soát**. Thay đổi Cấp 3.
> **Không có trạng thái "đơn đã ẩn"** (chủ dự án chọn *chỉ xoá hẳn*) ⇒ **không thêm cột, không migration**.
> Chi tiết: [`features/FEAT-15-delete-hide-archive.md`](features/FEAT-15-delete-hide-archive.md).

### §7.7 FEAT-23 §sort — danh sách PO & container tăng dần

| ID | Trạng thái | Mô tả |
|---|---|---|
| AC-SORT-01 | ✅ | Tab **Mã hàng** — bảng `Tổng theo PO` hiển thị **tăng dần** theo số PO (`2919 < 2920 < 2929`) — xem `poRows` (`src/db/queries.js` `ORDER BY po... ` → thực tế sort ở store/queries theo số) |
| AC-SORT-02 | ✅ | Tab **Container** — chip **Tất cả PO** liệt kê PO **tăng dần theo số** (`ContainersScreen`) |
| AC-SORT-03 | ✅ | Tab **Container** — danh sách container và kiện trong container **tăng dần** theo số/ứ tự tạo |

---

## §7.8 FEAT-22 — Số hiệu nhà máy (`order_ref`) theo PO × mã

> Chỉ đạo chủ dự án 2026-10-05: *"ẩn các dữ liệu KL, TKL, Thể tích, hãy hiển thị dữ liệu
> `order_ref`"*. Chi tiết: [`features/FEAT-22-order-ref-per-po.md`](features/FEAT-22-order-ref-per-po.md).

| ID | Trạng thái | Mô tả |
|---|---|---|
| AC-REF-01 | ✅ | Nhập `Dmac.json` ⇒ **82** dòng `order_line_refs`; `Σ target` = **25.520** = `Σ order_lines.target` |
| AC-REF-02 | ✅ | Thẻ `PO 2919 / 106385GF` hiện **chỉ** `D980159` — **không** lẫn `D980077` (của PO 2921) |
| AC-REF-03 | ✅ | Thẻ `PO 2921 / 106385GF` hiện **chỉ** `D980077` |
| AC-REF-04 | ✅ | Mã nhiều ref trong **cùng** PO (`PO 2919 / 1063048GF`) ⇒ `D980470: 477`, `D980973: 159`, `D980781: 80` — tổng đúng `716` |
| AC-REF-05 | ✅ | Mã **không có ref** (thêm tay, hoặc DB cũ chưa nhập lại file nguồn) ⇒ **ẩn** dòng số hiệu, không hiện `0`/`—` (`INV-I1`) |
| AC-REF-06 | ✅ | Mọi thẻ **không còn** `KL` / `TKL` / `Thể tích`; **vẫn còn** `Kiện` |
| AC-REF-07 | ✅ | `nw_kg`/`gw_kg`/`volume_cbm` trong DB **còn nguyên** — chỉ ẩn ở UI (`INV-I2`) |
| AC-REF-08 | ✅ | DB đã có dữ liệu nhập tay (chưa có bảng `order_line_refs`) ⇒ bảng được tạo, app khởi động bình thường, **không mất dữ liệu** |
| AC-REF-09 | ✅ | Nhập lại lần 2 cùng file ⇒ `order_line_refs` **không nhân bản** (vẫn 82 dòng) |
| AC-REF-10 | ✅ | Từng dòng: `Σ target` các ref **bằng** `order_lines.target` của dòng đó (`INV-R1`) — lệch **0** dòng |
| AC-REF-11 | ✅ | 1 ref ⇒ `Số hiệu`; nhiều ref ⇒ `Số hiệu (N)` + từng dòng `ref — N pcs` |
| AC-REF-12 | ✅ | `Σ target` ref **không bao giờ vượt** `Σ order_lines.target` của cùng batch |

> **Sửa `AC-SPLIT-06`:** AC này thuộc bản cũ (mỗi thẻ tách chỉ hiện 4 trường ở thẻ đầu). FEAT-21 đã bỏ
> cơ chế tách thẻ; FEAT-22 ẩn 3 trong 4 trường. Không còn "thẻ tách đầu/sau".
>
> **Không có breaking change:** `order_lines.target` **không đổi** ⇒ `INV-D6`/`INV-D7`/`INV-V1` giữ
> nguyên; `item_refs` giữ nguyên 55 dòng; `production_entries` **không đụng**; không sửa chữ ký hàm nào
> (`fetchItemsWithStats` chỉ **thêm** khoá `refs`).

### 7.10 FEAT-23 — Nhập số lượng **theo từng số hiệu**

> Chi tiết: [`features/FEAT-23-entry-qty-by-ref.md`](features/FEAT-23-entry-qty-by-ref.md).
> Mã ⚠️ = **đã triển khai + test tự động đạt**, nhưng **RC chưa chạy tay trên máy thật**.

| ID | Trạng thái | Mô tả |
|---|---|---|
| AC-RF-01 | ⚠️ | Thẻ 3 ref ⇒ **3** dòng tiến độ, mỗi dòng có `Đã làm N/target` và `Còn lại` |
| AC-RF-02 | ⚠️ | Ref `D980470` đã nhập 300, nhập thêm 200 ⇒ `Alert` chặn vượt hạn mức **của ref**; `Đã làm` ref **không đổi**; ô nhập **còn nguyên** |
| AC-RF-03 | ⚠️ | Nhập vào ref khác vẫn **cho phép** — hạn mức tính theo từng ref, không chặn nhầm |
| AC-RF-04 | ⚠️ | Nhập 200 + 100 + 50 vào 3 ref ⇒ `Đã làm` thẻ cha = **350** (tự cộng từ nhật ký) |
| AC-RF-05 | ⚠️ | `Σ` sản lượng **bằng** `Σ qty` nhật ký — không cộng trùng |
| AC-RF-06 | ⚠️ | Nhật ký gắn ref hiện `· D980470` trong danh sách nhật ký |
| AC-RF-07 | ⚠️ | Nhật ký **không** gắn ref ghi rõ *"chưa gắn số hiệu"* — không bịa ref |
| AC-RF-08 | ⚠️ | Có nhật ký không gắn ref ⇒ hiện *"chưa gắn số hiệu: N pcs"*, không im lặng làm `Σ` lệch |
| AC-RF-09 | ⚠️ | Ref không có dữ liệu (`target = 0`) ⇒ dòng đó **ẩn** (`INV-I1`) |
| AC-RF-10 | ⚠️ | Thẻ **không có** ref ⇒ **không** có khối nhập theo số hiệu; nhập qua form gốc như cũ |
| AC-RF-11 | ⚠️ | Sửa `target` của mã ⇒ `Σ target` các ref **không đổi** (ref chỉ đọc) |
| AC-RF-12 | ⚠️ | Sửa qty nhật ký gắn ref ⇒ hạn mức ref tính **trừ** dòng đang sửa (300→400 khi đã 300/477 thì cho phép) |
| AC-RF-13 | ⚠️ | `Σ` các ref ≤ tổng kế hoạch của thẻ; vượt tổng thì `queries.js` chặn (`INV-V1` **không** nới) |
| AC-RF-14 | ⚠️ | Xoá nhật ký gắn ref ⇒ dòng gắn ref đi theo (`ON DELETE CASCADE`), không còn mồ côi |
| AC-RF-15 | ⚠️ | `Σ qty` mọi nhật ký (có ref hay không) **vẫn bằng** `Σ v_line_progress.produced` — số không đổi so với trước FEAT-23 |

> **Không có breaking change:** `order_lines.target` **không đổi**, thẻ con **không** phải
> `order_lines` ⇒ `INV-D6`/`INV-D7` không đụng; chỉ **thêm** tham số tuỳ chọn `refNo` vào
> `addEntry`/`updateEntry` (quy tắc vàng #3); `store/useAppStore.js` 🔒 **không sửa**.
>
> ✅ **`BUG-N1` đã sửa:** `checkLineTarget` đã được chuyển sang gọi `checkQtyLimit` đúng dạng
> object `{ target, produced, incomingQty }`, khôi phục kiểm tra hạn mức kế hoạch `INV-V1` ở tầng DB.
