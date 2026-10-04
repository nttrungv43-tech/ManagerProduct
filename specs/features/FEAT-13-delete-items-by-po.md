# FEAT-13 — Xoá mã hàng: xoá 1 mã, xoá nhiều mã, xoá toàn bộ mã của một PO

> Bản này đã bỏ nhãn DRAFT. Cấp thay đổi **1** — không schema, không migration, không đổi chữ ký.
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-acceptance.md](../SPEC-acceptance.md)

## 1. Bối cảnh & mục tiêu

- **Vấn đề người dùng gặp:** sau khi nhập packing list, một số mã hàng của PO không còn được sản xuất
  (PO bị huỷ, thay đổi đơn). Muốn bỏ chúng ra khỏi đơn hàng hiện tại thì phải bấm `✎ Sửa` → `✕ Xoá mã hàng`
  → `Xoá` **cho từng mã**; PO có 10 mã thì 30 chạm.
- **Kết quả mong muốn (đo được):** xoá **toàn bộ mã của một PO** trong 1 thao tác (mở sheet → xem trước →
  xác nhận), có bước xem trước nêu rõ số mã và tổng số lượng sẽ bị xoá; an toàn trên dữ liệu thật.

## 2. Phạm vi

- **Làm:**
  1. Xem trước (`preview`) trước khi xoá: số mã, tổng `target`, danh sách mã **không** xoá được kèm lý do.
  2. Xoá toàn bộ mã thuộc **một** PO trong **một transaction**; `total_target` tính lại cùng transaction.
  3. Chặn an toàn: mã **đã có nhật ký** hoặc **còn nằm trong kiện** ⇒ **chặn toàn bộ**, không xoá dòng nào.
  4. Không lặp lại `Alert`/bảng dịch lỗi — dùng chung `src/utils/deleteItem.js`.
- **KHÔNG làm (non-goals):**
  - Không có **undo** / hoàn tác (xoá là không hoàn tác được).
  - Không chế độ **ghi đè** (xoá cả mã đã có nhật ký, giữ nguyên `entries`) ⇒ phá `INV-D5`, là **Cấp 3**, để ngoài v1.
  - Không xoá theo **bộ lọc tìm kiếm / lọc trạng thái**; chỉ xoá theo **PO đã chọn**.
  - Không xoá mã thuộc **nhiều PO** (`po` có `+`) — xem Q1.
  - Không xoá dữ liệu `entries` / `container_data` / `pallet_status`.
- **Cấp thay đổi:** **1** (chỉ thêm hàm + component). Không migration, không đổi chữ ký hàm hiện có.

### 2.1 Quyết định Q1–Q6 (áp dụng khuyến nghị mặc định)

| ID | Câu hỏi | Quyết định |
|---|---|---|
| **Q1** | Mã thuộc nhiều PO (`po = 'A+B'`) khi xoá theo PO A? | **KHÔNG xoá** — bỏ qua, báo `n mã thuộc nhiều PO` để PO còn giữ mã |
| **Q2** | Mã đã có nhật ký / còn trong kiện? | **Chặn toàn bộ** (all-or-nothing), báo đủ danh sách mã bị chặn + lý do |
| **Q3** | Chế độ ghi đè? | **KHÔNG** ở v1 (cần chỉ đạo Cấp 3 riêng nếu muốn) |
| **Q4** | Phạm vi? | Chỉ **xoá toàn bộ mã của 1 PO**; "xoá mã đang lọc" để backlog |
| **Q5** | Xoá hết mã của PO đang lọc? | **Tự chuyển chip lọc về `Tất cả PO`** để không kẹt màn hình trống |
| **Q6** | PO hết mã ⇒ chip/dòng bảng PO? | **Biến mất** — hệ quả dẫn xuất từ `items` (`allPOs`, `poSummaries`), ghi rõ trong AC-DEL-09 |

## 3. Acceptance Criteria

> Nằm ở [`SPEC-acceptance.md`](../SPEC-acceptance.md) §7.7 (`AC-DEL-01..12`). Tóm tắt:

- `AC-DEL-01` Nút `🗑 Xoá theo PO`, chỉ hiện khi store có batch `active` (INV-V3).
- `AC-DEL-02` Sheet chọn PO + **preview** (số mã, tổng `target`, mã bị chặn).
- `AC-DEL-03` Alert xác nhận nêu tên PO + số mã + tổng pcs + **không hoàn tác được** (INV-U1).
- `AC-DEL-04` Xác nhận ⇒ xoá mọi mã của PO trong **một transaction**, `total_target` tính lại cùng transaction.
- `AC-DEL-05` Huỷ ⇒ không đổi gì, `dataVersion` không tăng.
- `AC-DEL-06` Mã **đã có nhật ký** ⇒ chặn, không xoá dòng nào.
- `AC-DEL-07` Mã **còn trong kiện** ⇒ chặn, nêu số kiện.
- `AC-DEL-08` Mã **thuộc nhiều PO** ⇒ bỏ qua + báo số mã.
- `AC-DEL-09` PO hết mã ⇒ biến mất khỏi chip lọc PO và bảng PO.
- `AC-DEL-10` PO đang lọc bị xoá hết ⇒ tự về `Tất cả PO`.
- `AC-DEL-11` Sau xoá: `SummaryCards`, `PoSummaryTable`, danh sách thẻ, tab Lịch sử cập nhật ngay.
- `AC-DEL-12` Batch `archived` ⇒ không hiện nút; thông báo lỗi dùng **chung** `itemErrorMessage()`.

## 4. Ảnh hưởng dữ liệu

- **Không** thêm bảng/cột/index ⇒ **không migration**, không rủi ro mất dữ liệu.
- `items`: `DELETE ... WHERE order_batch_id = ? AND ntk IN (…)` trên PK `(ntk, order_batch_id)` sẵn có.
- `order_batches.total_target`: `recalcBatchTargetInTx()` — **cùng transaction** (giống FEAT-10 §5.5.5).
- `entries`, `pallet_status`, `container_data`: **không** đụng tới. Không cần remap khoá pallet vì
  `pallet_status` không tham chiếu `items` (INV-P1 không liên quan).
- Dữ liệu cũ: không ảnh hưởng — mọi thao tác xoá đều có kiểm tra trước.

## 5. Kế hoạch file

| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `src/utils/deleteItemsByPo.js` | 🟢 mới | thêm | Hàm thuần: chọn mã theo PO, thông báo tiếng Việt, `confirmDeleteItemsByPo` |
| `src/db/queries.js` | 🔒 | **thêm** `previewItemsByPo`, `removeItemsByPo` | SQL + transaction; không sửa hàm cũ |
| `src/store/useAppStore.js` | 🔒 | **thêm** `previewDeleteByPo`, `removeItemsByPo` | Action mới; không đổi state/tên cũ |
| `src/components/PoDeleteSheet.js` | 🟢 mới | thêm | Chỉ render, không truy vấn |
| `src/screens/ItemsScreen.js` | 🟡 | sửa | Nút + mở sheet + reset filter |
| `scripts/test-deleteItemsByPo.mjs` | 🟢 mới | thêm | Unit test hàm thuần (`node`) |
| `package.json` | 🟢 | sửa | Thêm `test:deletePo` vào `npm test` |
| `specs/*.md`, `SPEC.md`, `tasks.md` | 🟢 | sửa | AC, API, data model, invariant, RC, changelog |

## 6. Thiết kế

- **Luồng dữ liệu:** `PoDeleteSheet` → `ItemsScreen` → store `previewDeleteByPo(po)` →
  `queries.previewItemsByPo` (đọc `items` + `entries` + `container_data`) → trả preview;
  xác nhận → `confirmDeleteItemsByPo` (`Alert`) → store `removeItemsByPo(po)` →
  `queries.removeItemsByPo` (1 transaction) → `refreshItems()` + `dataVersion++`.
- **Chữ ký mới:** xem [`SPEC-api.md`](../SPEC-api.md) §6.2.3, §6.2.1d, §6.3, §6.4.
- **Văn bản UI (tiếng Việt):** `Xoá theo PO` · `Xoá cả PO` · `Không có mã hàng nào thuộc PO này.` ·
  `Đang kiểm tra…` · `Bỏ qua {n} mã thuộc nhiều PO` · `Không thể xoá {n} mã (đã có nhật ký / còn trong kiện)`.
- **Lọc PO bằng JS, không dùng SQL `LIKE`:** `+` là ký tự đại diện của `LIKE` ⇒ `LIKE '%PO%'` sai.
  Dùng `splitPo()` giống hệt `allPOs()`/`filteredItems()`.

## 7. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| Phá `AC-EDIT-08/09/10/27/29/30/31` (xoá 1 mã của FEAT-10/11) | Không sửa `removeItem` (`queries.js` L190, store L91); nhãn/thông báo dùng chung `deleteItem.js` |
| `INV-D6` / `AC-ITEM-23` (Σ bảng PO == Kế hoạch) | `total_target` tính lại trong cùng transaction; bảng PO dẫn xuất từ `items` |
| `AC-ITEM-13/24` (chip + dòng bảng theo PO) | PO hết mã sẽ biến mất — đã ghi rõ ở `AC-DEL-09`, không phải lỗi |
| `AC-ITEM-15` (không có kết quả khi lọc) | `filteredItems` + `PoDeleteSheet` chuyển chip về `Tất cả PO` (`AC-DEL-10`) |
| `INV-B2` / `INV-V3` (chỉ ghi batch `active`) | Nút + sheet chỉ hiện khi `state.batchId` có giá trị; store luôn lấy `getActiveBatchId()` |
| Mất trạng thái tick kiện | Không sửa `pallet_status`; mã còn trong kiện bị chặn xoá |
| Ghi nửa (xoá xong mà `total_target` chưa cập nhật) | Mọi thao tác nằm trong **một** `withTransactionAsync` |
| Key thẻ `key={item.ntk}` (BUG-06) | Đã biết từ trước, tách khỏi phạm vi FEAT-13 (không sửa ở đây) |

## 8. Kế hoạch kiểm thử

- **Unit test** (`npm run test:deletePo`): `splitPo`, `selectItemsByPo` (khớp `A+B`, loại trừ mã nhiều PO),
  `poFilterNeedsReset`, `bulkDeleteConfirmMessage`, `formatBulkDeleteError`, `confirmDeleteItemsByPo`
  (Huỷ / thành công / bị chặn / hồi quy `Alert` là class).
- **RC mới:** `RC-63..RC-72` — xem [`SPEC-test.md`](../SPEC-test.md) §11.1.
- **RC cũ phải chạy lại:** RC-01..06, RC-20, và toàn bộ `AC-EDIT-01..36`, `AC-ITEM-01/13/20/23/24/25/26/27`.
- Chạy thủ công **trên máy/emulator thật** — môi trường code-only không kiểm được UI + SQLite thật.

## 9. Tiêu chí xong

- [x] Toàn bộ mục §10.4 của [`SPEC-rules.md`](../SPEC-rules.md)
- [x] `npm test` / `npx expo lint` / `npx tsc --noEmit` — 0 lỗi mới
- [x] **Không có breaking change**: Cấp 1, không migration, không đổi chữ ký
- [ ] RC-63..72 + hồi quy AC cũ (cần máy/emulator thật)