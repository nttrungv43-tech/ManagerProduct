# FEAT-10 — Thêm / sửa / xoá sản phẩm, số lượng và kiện (pallet)

> **Trạng thái: ĐÃ CÀI ĐẶT (v1.5, 2026-09-30).** Chủ dự án yêu cầu triển khai; Q1–Q8 áp dụng theo khuyến nghị mặc định trong §6.1.
> **Cấp thay đổi: 2 (migration `pallet_status` v2) + 3 (đổi định dạng khoá pallet).**
> ⚠️ Đây là tính năng **rủi ro cao nhất** từ trước tới nay: nó đụng trực tiếp vào `INV-D4` (định dạng key pallet **BẤT BIẾN**) và `BUG-01` (PK sai của `pallet_status`).
> Phụ thuộc: FEAT-08 phase 2 (`container_data`), FEAT-09 (`items.target` là hạn mức).

---

## 1. Bối cảnh & mục tiêu

**Vấn đề người dùng gặp:**
- Mã hàng và số lượng chỉ nạp được qua seed cứng (`src/data/seed.js`) hoặc import packing list. Muốn thêm 1 mã hàng mới, sửa số lượng thực tế của PO, hay bỏ 1 mã hàng → **phải sửa code rồi `finishOrder`**, mất toàn bộ tiến độ đơn hiện tại.
- Danh sách kiện trong container là JSON blob tĩnh. Thêm/sửa/xoá kiện khi thực tế khác packing list → không làm được.
- ADR-06 ghi nhận: "đơn mới cần đổi code" — đúng là nợ kỹ thuật (DEBT-02, FEAT-07) chưa được giải quyết.

**Kết quả mong muốn (đo được):**
- Người dùng tự thêm/sửa/xoá **mã hàng** và **số lượng kế hoạch** ngay trên tab Mã hàng, **giới hạn trong PO đang chọn** và batch `active`.
- Người dùng tự thêm/sửa/xoá **kiện** ngay trên tab Container, **giới hạn trong container đang mở** và batch `active`.
- Thao tác này **không cần sửa code, không cần import lại, không mất tiến độ** đơn hiện tại.
- Dữ liệu sửa tay vẫn đúng sau khi tắt/mở app.

---

## 2. Phạm vi

### 2.1 Làm

| Nhóm | Thao tác |
|---|---|
| **Sản phẩm** (`items`) | Thêm mã hàng · Sửa PO/số lượng · Xoá mã hàng — theo PO đang lọc |
| **Số lượng** | Sửa `items.target` (kế hoạch) của từng mã hàng; `total_target` của batch tự tính lại |
| **Kiện** (`container_data`) | Thêm kiện · Sửa số lượng/thành phần kiện · Xoá kiện — theo container đang mở |
| **Vệ sinh dữ liệu** | `pallets_total` của batch tự tính lại sau mọi thay đổi kiện |
| **Nền tảng** | Vật chất hoá seed → DB (`container_data`) ở lần sửa kiện đầu tiên → dẹp DEBT-02 |

### 2.2 KHÔNG làm (non-goals)
- ❌ Không sửa dữ liệu của batch `archived` (INV-B2).
- ❌ Không sửa `entries` (nhật ký sản xuất) từ tính năng này — việc đó thuộc FEAT-09/FEAT-01.
- ❌ Không cho thêm container mới / sửa `po` của container ở v1.
- ❌ Không tự động sửa `items.target` cho khớp với tổng kiện (xem Q7).
- ❌ Không có thao tác "kéo thả" sắp xếp lại kiện.
- ❌ Không đưa thao tác ghi vào nhiều batch cùng lúc.

### 2.3 Cấp thay đổi
- **Cấp 2** — nếu chọn phương án khóa pallet theo `ntk` (Q1) thì bắt buộc có migration.
- **Cấp 3** — sửa hành vi `pallet_status`/`isPalletDone`; cần chỉ đạo rõ chủ dự án.

---

## 3. Acceptance Criteria

### 3.1 Sản phẩm & số lượng

| ID | Given | When | Then |
|---|---|---|---|
| **AC-EDIT-01** | Tab Mã hàng, lọc PO `2600189` | Bấm "＋ Thêm mã hàng" | Mở form: `ntk` (bắt buộc), `po` (mặc định = PO đang lọc nếu lọc 1 PO, nếu đang lọc "Tất cả PO" thì bắt chọn), `target` (bắt buộc) |
| **AC-EDIT-02** | — | Lưu mã hàng mới | `items` có 1 dòng `(ntk, activeBatchId)`; danh sách cập nhật ngay; `order_batches.total_target` tăng đúng; **không** tăng `dataVersion` thừa |
| **AC-EDIT-03** | — | `ntk` đã tồn tại trong batch | Chặn, báo "Mã hàng đã tồn tại", **không** tạo dòng trùng (PK `(ntk, order_batch_id)`) |
| **AC-EDIT-04** | — | `ntk` rỗng / có khoảng trắng / chứa ký tự lạ | Chặn, không ghi. `ntk` chỉ nhận `[0-9A-Za-z]+` (khớp bộ lọc `importItemsFromJson` và AC-ITEM-12) |
| **AC-EDIT-05** | `target` không phải số nguyên ≥ 0 | Lưu | Chặn, dùng lại `parseQty` của FEAT-09 (không viết parser thứ hai) |
| **AC-EDIT-06** | Mã hàng có `target = 1000`, đã sản xuất `1200` | Sửa `target` → `800` | **Chặn** + báo lỗi "thấp hơn số đã sản xuất (1200)". Không tạo trạng thái vượt hạn mức mới |
| **AC-EDIT-07** | Mã hàng có `target = 1000`, đã sản xuất `1200` | Sửa `target` → `1500` | Cho phép (tăng hạn mức) |
| **AC-EDIT-08** | Mã hàng có `target = 1200` | Xoá | Alert xác nhận nêu rõ hậu quả (mục 3.3) → xoá khỏi `items`, `total_target` giảm, cập nhật ngay |
| **AC-EDIT-09** | Mã hàng **đã có nhật ký** (`SUM(qty) > 0`) | Xoá | **Chặn** (INV-D5): báo "Mã {ntk} đã có {n} pcs nhật ký, không thể xoá. Hãy sửa số lượng thay vì xoá." Không xoá dòng nào |
| **AC-EDIT-10** | Mã hàng không có nhật ký nhưng **đang có trong kiện** | Xoá | **Chặn** + báo "Mã {ntk} còn nằm trong {n} kiện. Hãy xoá/sửa kiện trước." (giữ tính toàn vẹn container ↔ items) |
| **AC-EDIT-11** | Đang lọc PO `2600168` | Thêm mã hàng có `po = '2600189'` | Cho phép nhưng hiện cảnh báo "Mã này không thuộc PO đang lọc" — tránh thêm nhầm |
| **AC-EDIT-12** | Đang lọc "Tất cả PO" | Xoá/sửa một mã hàng | Thao tác áp dụng cho **đúng mã hàng đó**, không ảnh hưởng mã khác cùng PO |
| **AC-EDIT-13** | Batch `archived` | Mở thẻ lưu trữ | **Không** có nút Thêm/Sửa/Xoá (INV-B2) |

### 3.2 Kiện (pallet)

| ID | Given | When | Then |
|---|---|---|---|
| **AC-EDIT-14** | Tab Container, mở Container 1 | Bấm "＋ Thêm kiện" | Form: số hiệu kiện (mặc định `max(no)+1`), danh sách dòng hàng `{ntk, qty}`. `ntk` chỉ chọn được mã đang có trong `items` của batch |
| **AC-EDIT-15** | — | Lưu kiện mới | Kiện xuất hiện trong container; `pallets_total` batch +1; thống kê `done/total`, `%`, `pcs` cập nhật ngay; kiện mới **chưa** tick (key chưa có trong `pallet_status`) |
| **AC-EDIT-16** | Kiện có `{106160: 300, 1063022: 40}` | Sửa → đổi số lượng `106160` thành `280` | Số lượng trong kiện và `pcs` hiển thị cập nhật; **giữ nguyên** trạng thái tick đã có |
| **AC-EDIT-17** | — | Sửa → xoá 1 dòng hàng khỏi kiện | ⚠️ **Phụ thuộc Q1.** Nếu dùng khoá theo `ntk`: trạng thái tick của các dòng còn lại **được giữ nguyên**. Nếu giữ khoá theo chỉ số: phải cảnh báo "các dòng còn lại sẽ mất trạng thái đã đánh dấu" và xác nhận mới cho phép |
| **AC-EDIT-18** | Kiện có 1 dòng hàng | Sửa → thêm dòng hàng thứ 2 | ⚠️ **Phụ thuộc Q1.** Khi đó kiện chuyển từ dạng 1 loại sang nhiều loại ⇒ định dạng khoá đổi (`c1-5` → `c1-5-0`,`c1-5-1`). Bắt buộc phải xử lý trạng thái tick một cách quyết định (xem §6.2) |
| **AC-EDIT-19** | — | Xoá kiện | Alert xác nhận (INV-U1) nêu số pcs bị mất → xoá khỏi JSON, `pallets_total` −1, **xoá luôn** các dòng `pallet_status` của kiện đó (không để lại rác) |
| **AC-EDIT-20** | Xoá kiện giữa dãy (kiện 3/10) | Xoá | Các kiện còn lại **giữ nguyên số hiệu** (4,5,6…) — không đánh số lại, tránh đổi khoá |
| **AC-EDIT-21** | Sửa số hiệu kiện | Đổi `no` | ⚠️ Đổi khoá `pallet_status`. Phải di chuyển trạng thái tick sang khoá mới trong cùng transaction, hoặc **cấm** đổi `no` ở v1 (khuyến nghị) |
| **AC-EDIT-22** | Chưa có dòng `container_data` cho batch (đang dùng seed) | Sửa kiện lần đầu | Tự vật chất hoá seed vào DB (giữ nguyên `id` `c1`/`c2`/`c3` ⇒ **không** mất trạng thái tick đang có), rồi mới áp dụng thay đổi. Lần sau đọc thẳng từ DB |
| **AC-EDIT-23** | Kiện chứa `ntk` không còn tồn tại trong `items` | Mở tab Container | Vẫn hiển thị như cũ (không mất dữ liệu), kèm cảnh báo "chứa mã không có trong đơn" — không tự xoá |
| **AC-EDIT-24** | Mọi thao tác kiện | — | `pallet_status` và `container_data` được ghi **trong cùng một transaction**; JSON hỏng ⇒ rollback, không ghi nửa |

### 3.3 Quy tắc bất biến mới (đề xuất)

| ID | Bất biến |
|---|---|
| **INV-V2** | `items` và cấu trúc kiện phải khớp nhau: mọi `ntk` trong `container_data` của batch `active` phải tồn tại trong `items` của batch đó (trừ khi đã cảnh báo theo AC-EDIT-23) |
| **INV-P1** | Khoá `pallet_status` phải **ổn định** khi thành phần kiện đổi. Mọi thay đổi khoá phải di chuyển trạng thái `done` trong cùng transaction — không được làm mất trạng thái tick âm thầm |

---

## 4. Ảnh hưởng dữ liệu

### 4.1 Bảng/cột

| Đối tượng | Cần thay đổi? | Lý do |
|---|---|---|
| `items` | ❌ Không thêm cột | `ntk`, `po`, `target` đã đủ cho CRUD |
| `container_data` | ❌ Không thêm cột | `data` JSON đã chứa `containers[].pallets[]`; sửa tại chỗ (read‑modify‑write) |
| `pallet_status` | ⚠️ **Có thể** — nếu chọn Q1 = khoá theo `ntk` | Phải viết lại giá trị `key` hiện có + sửa PK (`BUG-01`) |
| `order_batches.total_target`, `pallets_total` | ❌ Không thêm cột | Đã có; chỉ cần tính lại |

### 4.2 Migration (chỉ khi chọn khoá theo `ntk`)

Gộp vào **migration v2** đang thiết kế sẵn cho `BUG-01` (`SPEC-data.md` §10.2) để không phải làm 2 lần nâng cấp:

```sql
-- v2 (mở rộng): PK đúng + chuyển khoá theo ntk
-- 1) Bảng `container_data` phải được đọc để biết khoá mới ứng với khoá cũ.
--    => Cần bước "đọc JSON trong JS" trước khi chạy SQL thuần.
CREATE TABLE pallet_status_new (
  key TEXT NOT NULL, order_batch_id INTEGER NOT NULL,
  done INTEGER DEFAULT 0, PRIMARY KEY (key, order_batch_id)
);
-- INSERT ... SELECT với khoá mới được JS dựng sẵn
DROP TABLE pallet_status;
ALTER TABLE pallet_status_new RENAME TO pallet_status;
CREATE INDEX IF NOT EXISTS idx_pallet_batch ON pallet_status(order_batch_id);
```

> ⚠️ Bước "đọc JSON" làm migration **không còn thuần SQL**. Cần kiểm thử nâng cấp (RC-22) thật kỹ trên bản sao DB thật.

### 4.3 Dữ liệu cũ
- Giữ nguyên toàn bộ. `items`/`entries`/`container_data`/`pallet_status` của DB cũ vẫn đọc được.
- Nếu **không** chọn khoá theo `ntk`: **không có migration nào**, DB cũ dùng nguyên trạng.

---

## 5. Kế hoạch file

| File | Mức BV | Hành động | Lý do |
|---|---|---|---|
| `src/db/queries.js` | 🔒 | **thêm** `addItem`, `updateItem`, `removeItem`, `recalcBatchTarget`, `materializeContainers`, `addPallet`, `updatePallet`, `removePallet`, helper đọc/ghi JSON kiện | Mọi ghi dữ liệu phải qua queries.js (quy tắc vàng #6) |
| `src/db/queries.js` | 🔒 | **sửa** `isPalletDone` + `setPalletStatus` **nếu** đổi định dạng khoá | Theo Q1 |
| `src/db/schema.js` / `src/db/migrations.js` | 🔒 | **thêm** migration **nếu** Q1 = ntk | Mục 4.2 |
| `src/store/useAppStore.js` | 🔒 | **thêm** action `addItem`/`updateItem`/`removeItem`/`addPallet`/`updatePallet`/`removePallet`; state `itemDraft`? **không** — state cục bộ trong component | Không đổi tên state/action cũ |
| `src/components/ItemEditSheet.js` | 🟢 mới | Form thêm/sửa/xoá mã hàng | Tách khỏi `ItemCard` để giữ file gọn |
| `src/components/PalletEditSheet.js` | 🟢 mới | Form thêm/sửa/xoá kiện | Tương tự |
| `src/components/ItemCard.js` | 🟡 | **thêm** nút Sửa/Xoá + `onEditItem`/`onDeleteItem` | AC-EDIT-08 |
| `src/components/PalletRow.js` | 🟡 | **thêm** nút Sửa/Xoá + `onEditPallet`/`onDeletePallet` | AC-EDIT-19 |
| `src/screens/ItemsScreen.js` | 🟡 | **thêm** nút "＋ Thêm mã hàng" | AC-EDIT-01 |
| `src/screens/ContainersScreen.js` | 🟡 | **thêm** nút "＋ Thêm kiện" theo container | AC-EDIT-14 |
| `src/utils/validateQty.js` | 🟢 | **tái dùng** `parseQty` — không viết parser mới | DRY |
| `src/data/seed.js` | 🔒 | **không đụng** | INV-D1 |
| `src/app/**` | 🔒 | **không đụng** | Route chỉ re-export |
| `specs/*`, `tasks.md` | 🟢 | sửa | Đồng bộ spec |

---

## 6. Thiết kế

### 6.1 Các quyết định đã chốt (chủ dự án chọn theo khuyến nghị mặc định)

| ID | Câu hỏi | Khuyến nghị |
|---|---|---|
| **Q1** ⭐ | Khoá trạng thái tick kiện nhiều loại: giữ `${cid}-${no}-${idx}` (INV-D4) hay đổi thành `${cid}-${no}-${ntk}`? | **Đổi sang `ntk`.** Khoá theo chỉ số vỡ ngay khi thêm/xoá một dòng hàng trong kiện (AC-EDIT-17/18) — mất trạng thái tick. Đổi khoá cần migration nhưng làm mọi thao tác về sau an toàn. Phải gộp với migration `BUG-01`. |
| **Q2** | Có cho sửa `items.target` xuống dưới số đã sản xuất không? | **Không** — chặn (AC-EDIT-06), tránh phá vỡ hạn mức FEAT-09 |
| **Q3** | Xoá mã hàng đã có nhật ký? | **Chặn**, hướng dẫn sửa số lượng (AC-EDIT-09) — bảo toàn lịch sử, đúng quy tắc vàng #1 |
| **Q4** | Đổi số hiệu kiện (`no`)? | **Cấm ở v1** (AC-EDIT-21) — tránh phải di chuyển khoá |
| **Q5** | Import lại packing list sau khi đã sửa kiện tay? | **Cảnh báo + xác nhận**, nêu rõ sẽ ghi đè toàn bộ chỉnh sửa kiện |
| **Q6** | Khi thêm mã hàng, chọn PO từ danh sách sẵn có hay tự nhập? | **Chọn từ danh sách PO đang có** (chip lọc) — tránh PO sai chính tả làm hỏng bộ lọc |
| **Q7** | Sửa số lượng trong kiện có tự cập nhật `items.target` không? | **Không.** Kiện và kế hoạch là hai khái niệm khác nhau. Hiện tại `INV-D1` (Σ kiện = `target`) là bất biến của *seed tĩnh*; khi cho sửa tay thì bất biến này phải được **nới thành cảnh báo**, không phải ràng buộc |
| **Q8** | Sản phẩm có cần phân biệt "thêm tay" với "từ import"? | **Không** ở v1 (tránh thêm cột + migration). Nếu sau này cần cảnh báo khi import ghi đè thì thêm cột `source` |

### 6.2 Xử lý khoá pallet (vấn đề khó nhất)

| Tình huống | Khoá theo chỉ số (hiện tại) | Khoá theo `ntk` (khuyến nghị) |
|---|---|---|
| Thêm kiện mới | ✅ an toàn | ✅ an toàn |
| Xoá kiện | ✅ an toàn (xoá khoá kèm) | ✅ an toàn |
| Sửa số lượng dòng hàng | ✅ an toàn | ✅ an toàn |
| **Xoá 1 dòng hàng trong kiện** | ❌ dòng sau **dịch chỉ số** ⇒ mất tick | ✅ giữ nguyên tick theo `ntk` |
| **Thêm dòng hàng 2 vào kiện 1 loại** | ❌ đổi dạng khoá `c1-5` → `c1-5-0` ⇒ mất tick | ✅ giữ nguyên tick |
| Đổi số hiệu kiện | ⚠️ phải di chuyển khoá (cấm ở v1) | ⚠️ tương tự |

Định dạng khoá đề xuất mới: `` `${containerId}-${palletNo}-${ntk}` `` (kiện 1 loại vẫn dùng `` `${containerId}-${palletNo}` `` như hiện tại, để không phá seed cũ).

### 6.3 Luồng ghi kiện (read‑modify‑write JSON)

```
UI (PalletEditSheet) → store action → queries.js
  1. đọc container_data.data (JSON.parse)  ← nếu null: materialize từ containersData (AC-EDIT-22)
  2. biến đổi containers[] trong bộ nhớ
  3. JSON.stringify
  4. db.withTransactionAsync:
       UPDATE container_data SET data = ? WHERE batch_id = ?
       DELETE/INSERT pallet_status theo khoá mới
       UPDATE order_batches SET pallets_total = ?
```
Bắt buộc: **transaction duy nhất** cho bước 4 (INV-B3 tinh thần), và bước 1–3 **không** ghi gì nếu JSON lỗi.

### 6.4 Văn bản UI (tiếng Việt, INV-U2)

| Ngữ cảnh | Nhãn |
|---|---|
| Nút thêm mã hàng | `＋ Thêm mã hàng` |
| Nút thêm kiện | `＋ Thêm kiện` |
| Xác nhận xoá mã hàng | `Xoá mã {ntk}?` — `Mã này sẽ bị xoá khỏi đơn hàng hiện tại.` |
| Xác nhận xoá kiện | `Xoá kiện {no}?` — `Sẽ mất {qty} pcs khỏi thống kê container. Không thể hoàn tác.` |
| Cảnh báo import ghi đè | `Import sẽ ghi đè toàn bộ chỉnh sửa kiện đã làm. Tiếp tục?` |
| Cảnh báo mã lệch PO | `Mã này không thuộc PO đang lọc.` |

---

## 7. Rủi ro hồi quy

| ID | Rủi ro | AC/INV bị ảnh hưởng | Cách bảo vệ |
|---|---|---|---|
| **R1** | Đổi thành phần kiện làm mất trạng thái tick đã tick | AC-CONT-02/03/04, INV-D4 | Bắt buộc theo Q1 (khoá `ntk`) + AC-EDIT-17/18 + `npm test` cho hàm ánh xạ khoá |
| **R2** | Migration `pallet_status` làm mất dữ liệu tick trên DB thật | INV-D1, RC-17/18 | Bắt buộc chạy RC-22 trên **bản sao DB thật**; có đường lùi (giữ bảng cũ thành `_bak`) |
| **R3** | Ghi JSON không transaction ⇒ `container_data` hỏng | AC-CONT-01..08, AC-IMP-10/11/12 | `withTransactionAsync` + kiểm tra JSON parse trước khi ghi (AC-EDIT-24) |
| **R4** | Sửa `target` làm vỡ hạn mức FEAT-09 | INV-V1, AC-ITEM-17 | AC-EDIT-06 chặn giảm `target` xuống dưới số đã sản xuất |
| **R5** | Xoá mã hàng để lại `entries` mồ côi | INV-D5, AC-HIST-02 | AC-EDIT-09 chặn xoá khi có nhật ký |
| **R6** | Import packing list ghi đè chỉnh sửa kiện tay | AC-IMP-10/11 | Q5: cảnh báo + xác nhận nêu rõ mất dữ liệu |
| **R7** | `total_target`/`pallets_total` lệch sau nhiều thao tác | AC-ITEM-01, AC-CONT-04/06/11 | Hàm `recalcBatchTarget`/`recalcBatchPallets` gọi trong **cùng** transaction; thêm unit test thuần |
| **R8** | `ItemCard`/`PalletRow` phình to, khó đọc | — | Tách form ra `*EditSheet.js` mới (🟢) |
| **R9** | Sửa dữ liệu batch `archived` | INV-B2 | AC-EDIT-13: ẩn nút trên thẻ lưu trữ |
| **R10** | Sửa tay phá `INV-D1` (Σ kiện = `target`) | INV-D1 | Q7: chuyển `INV-D1` thành bất biến của seed tĩnh + hiển thị cảnh báo lệch, không chặn |

---

## 8. Kế hoạch kiểm thử

**RC cũ bắt buộc chạy lại:** RC-01..06 (Mã hàng), **RC-07..10 + RC-14..18 (Container — trọng tâm rủi ro)**, RC-11/12 (Lịch sử), RC-20, RC-22 (nâng cấp DB).

**RC mới:**

| ID | Bước | Kết quả mong đợi |
|---|---|---|
| RC-32 | Thêm mã hàng `TEST001`, PO đang lọc, `target 500` | Xuất hiện trong danh sách, `Kế hoạch` tổng +500, chip PO cập nhật |
| RC-33 | Thêm lại `TEST001` | Alert "đã tồn tại", không tạo dòng trùng |
| RC-34 | Sửa `TEST001` → `target 800` | Tổng cập nhật; `Đã làm` giữ nguyên |
| RC-35 | Mã có nhật ký → sửa `target` xuống dưới số đã sản xuất | Alert chặn |
| RC-36 | Thêm kiện mới vào Container 1 | `done/total` container +1, `pallets_total` +1, thống kê `pcs` cập nhật |
| RC-37 | Tick kiện vừa thêm | Tick được, tính vào thống kê |
| RC-38 | Sửa số lượng 1 dòng hàng trong kiện đã tick | Số pcs đổi, **tick vẫn còn** |
| RC-39 | Xoá 1 dòng hàng khỏi kiện đã tick 2 dòng | Tick của dòng còn lại **không mất** (kiểm chứng Q1) |
| RC-40 | Thêm dòng hàng thứ 2 vào kiện 1 loại đã tick | Kiện thành nhiều loại, tick **không mất** |
| RC-41 | Xoá kiện giữa dãy | Số hiệu kiện còn lại không đổi; `done/total` giảm; xoá luôn dòng `pallet_status` |
| RC-42 | Xoá mã hàng đã có nhật ký | Alert chặn, dữ liệu nguyên vẹn |
| RC-43 | Xoá mã hàng chưa có nhật ký nhưng có trong kiện | Alert chặn, nêu số kiện |
| RC-44 | Tắt app, mở lại | Mọi thay đổi còn nguyên; `pallets_total`/`total_target` khớp |
| RC-45 | Sửa kiện tay rồi import lại packing list | Hiện cảnh báo ghi đè trước khi import |
| RC-46 | *(nếu có migration)* Nâng cấp từ DB cũ có tick cũ | Tick cũ **giữ nguyên**; RC-07..10 vẫn đạt |

**Unit test mới** (bổ sung vào `npm test`):

| Hàm | Ca bắt buộc |
|---|---|
| `palletKey(containerId, palletNo, item?)` | 1 loại → `c1-5`; nhiều loại → `c1-5-106160` |
| `remapPalletStatus(before, after)` | Xoá dòng giữa: tick của dòng sau **được giữ**; đổi 1 loại → nhiều loại: tick được chuyển sang khoá con |
| `recalcTargets(items)` | Cộng đúng `Σtarget`; rỗng → 0 |

---

## 9. Tiêu chí xong

- [ ] Q1–Q8 đã được chủ dự án trả lời (**Q1 là quyết định lớn nhất**)
- [ ] Cấp 3 được chủ dự án chấp thuận (sửa hành vi `pallet_status`/`isPalletDone`)
- [ ] Nếu có migration: chạy RC-46 trên **bản sao DB thật** + có đường lùi
- [ ] AC mới ✅ và **không phá** AC-ITEM/CONT/HIST/IMP hiện có
- [ ] `npm test` + `npx expo lint` + `npx tsc --noEmit` + `npx expo export` đều sạch
- [ ] Không sửa file 🔒 ngoài phạm vi đã được phép; không đổi chữ ký hàm cũ
- [ ] RC-32..46 + RC cũ đã chạy và ghi kết quả
- [ ] `SPEC-changelog.md`, `INV-D1`/`INV-D4` đã cập nhật theo Q1/Q7
