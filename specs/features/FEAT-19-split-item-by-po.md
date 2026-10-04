# FEAT-19 — Tách mã nhiều PO thành từng dòng riêng trong danh sách mã hàng

> **Cấp thay đổi: 3 (đổi hành vi hiển thị danh sách mã hàng)** — chủ dự án yêu cầu 2026-10-04:
> *"những mã hàng làm cho nhiều PO thì phải tách riêng ra không gộp chung với nhau theo kiểu
> PO 2922+2933 mà tách riêng ra ví dụ mã 106167GF PO 2022, 106167GF PO 2923"*.
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-acceptance.md](../SPEC-acceptance.md) | [SPEC-test.md](../SPEC-test.md)

---

## 1. Bối cảnh & mục tiêu

### Vấn đề (đo trên `src/data/Dmac.json`, 12 PO 2919–2930)

FEAT-18 đã tách được **số lượng** theo từng PO ở bảng `Tổng theo PO`, nhưng **danh sách mã hàng**
vẫn hiện **một thẻ cho mỗi mã**, tiêu đề gộp kiểu `PO 2922+2923`:

| Mã | PO trong `items.po` | Thẻ hiện tại | Người dùng muốn |
|---|---|---|---|
| `106167GF` | `2922+2923` | 1 thẻ, `PO 2922+2923`, Kế hoạch **405** | 2 thẻ: `PO 2922` = 270, `PO 2923` = 135 |
| `1072017GF` | `2919+2920+2923+2928+2929+2930` | 1 thẻ, `PO` dài 6 số, Kế hoạch **2.808** | 6 thẻ, mỗi PO một dòng |

Đo trên file thật: **49 mã**, trong đó **15 mã thuộc nhiều PO** (`src/data/Dmac.json`), tổng 25.520 pcs.
Mã đa PO nhiều nhất là `1072017GF` (6 PO) và `107314GF` (4 PO).

### Vì sao giờ làm được (FEAT-18 đã mở đường)

`item_po` đã lưu **phần của từng PO** (`packingV1Import.js` ghi `poQty` khi nhập `packing_data.json`),
nên `qty` của riêng từng PO là **dữ liệu thật**, không phải suy đoán. FEAT-19 chỉ dùng dữ liệu đó để
**tách dòng hiển thị**.

### Mục tiêu

- Mỗi PO của mã là **một dòng riêng** trong danh sách mã hàng, không gộp bằng `+`.
- `Kế hoạch` của mỗi dòng là **phần của riêng PO đó**.
- `Σ Kế hoạch` của các dòng của một mã **không đổi** ⇒ không cộng trùng, khớp `Kế hoạch` ở `SummaryCards`.

---

## 2. Quyết định của chủ dự án (2026-10-04)

Ba điểm mơ hồ đã được hỏi và chốt — **không suy đoán**:

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Dòng tách hiển thị `Đã làm` / `Còn lại` / `%` thế nodo? | **Dùng chung số đã làm của mã.** `entries` khoá theo `ntk` nên không quy về từng PO được; mọi dòng của cùng một mã hiện **cùng** `Đã làm`/`Lỗi`, kèm ghi chú nói rõ là dùng chung |
| Q2 | 4 trường `KL`/`TKL`/`Thể tích`/`Kiện` (FEAT-17)? | **Chỉ hiện ở dòng tách đầu tiên**, các dòng sau đặt `null` ⇒ ẩn theo `INV-I1`. Không nhân đôi số liệu |
| Q3 | Nút `✎ Sửa` / `✕ Xoá mã hàng` ở dòng tách? | **Ẩn cả hai** khi mã thuộc nhiều PO — vì `updateItem`/`removeItem` nhắm theo **mã**, bấm ở dòng nào cũng xoá sạch mọi PO |

> **Hệ quả phải nói rõ:** `Còn lại` của các dòng tách **không cộng lại được** bằng `Còn lại` thật của mã,
> vì sản lượng là con số dùng chung. Vì vậy `SummaryCards` phía trên **không đổi** và vẫn là nơi
> xem số liệu tổng đúng (giống lý do FEAT-18 §6.3 không phân bổ `produced` theo PO).

---

## 3. Phạm vi

- **Làm:** `src/utils/itemRows.js` (hàm thuần `splitItemRows` + `filterItemRows`);
  `ItemsScreen` hiển thị theo dòng tách; `ItemCard` hiện ghi chú dùng chung; `key` React theo
  `(order_batch_id, ntk, po)`.
- **KHÔNG làm:** **không migration** (dữ liệu per-PO đã có ở `item_po` từ FEAT-18);
  **không** đổi chữ ký `queries.js`/`store` (quy tắc vàng #3); **không** đổi `items.target`
  (vẫn là **tổng** của mã — `entries` và hạn mức `INV-V1` phụ thuộc vào đó);
  `SummaryCards` và bảng `Tổng theo PO` giữ nguyên; không thay đổi `packed_data` import.
- **Cấp thay đổi:** **3**.

---

## 4. Acceptance Criteria

| ID | Hành vi |
|---|---|
| **AC-SPLIT-01** | Mã thuộc nhiều PO và **có** dòng `item_po` ⇒ tách thành **nhiều thẻ**, mỗi thẻ **một PO**, không còn chuỗi `A+B` trên tiêu đề thẻ |
| **AC-SPLIT-02** | `Kế hoạch` của mỗi thẻ tách = `qty` của riêng PO đó trong `item_po` (`106167GF` → 270 và 135) |
| **AC-SPLIT-03** | `Σ Kế hoạch` của các thẻ của một mã **bằng** `items.target` của mã đó ⇒ không cộng trùng (bất biến mới **INV-D7**) |
| **AC-SPLIT-04** | Mã thuộc **một** PO ⇒ **không** đổi gì: 1 thẻ, PO, kế hoạch, 4 trường FEAT-17, nút Sửa/Xoá như cũ |
| **AC-SPLIT-05** | Mọi thẻ của cùng một mã hiện **cùng** `Đã làm` / `Lỗi` (dùng chung theo mã) + có **ghi chú** nói rõ nhật ký sản xuất tính chung cho mã |
| **AC-SPLIT-06** | 4 trường FEAT-17 hiện **chỉ** ở thẻ tách **đầu tiên**; các thẻ sau **ẩn** (`null`) — không nhân đôi số liệu (`INV-I1`) |
| **AC-SPLIT-07** | Thẻ tách **không** có nút `✎ Sửa mã hàng & số lượng` và `✕ Xoá mã hàng`; thẻ của mã một PO **vẫn** có |
| **AC-SPLIT-08** | Chip lọc PO `2922` chỉ hiện thẻ `106167GF` ở PO `2922` (không hiện thẻ PO `2923`); tìm kiếm theo mã hiện **mọi** thẻ của mã đó |
| **AC-SPLIT-09** | Bộ lọc trạng thái `Chưa hoàn thành`/`Đã xong` tính theo **mã** (`items.target` vs `items.produced`) — **không** dùng kế hoạch per-PO, vì sản lượng không tách được theo PO |
| **AC-SPLIT-10** | Mã thuộc nhiều PO **chưa** có dòng `item_po` (dữ liệu cũ, chưa nhập lại file nguồn) ⇒ giữ **1 thẻ gộp** như trước **kèm ghi chú** chỉ đường thoát (nhập lại `packing_data.json`) |
| **AC-SPLIT-11** | `SummaryCards` và bảng `Tổng theo PO` **không đổi** — vẫn tính từ `items` (ntk tổng), không cộng trùng |
| **AC-SPLIT-12** | Thêm nhật ký sản xuất ở **bất kỳ** thẻ tách nào ⇒ ghi vào `entries` của **mã** đó ⇒ cả hai thẻ cùng tăng (không nhân đôi) |
| **AC-SPLIT-13** | `items.target` và `order_batches.total_target` **không đổi**; `INV-V1` (hạn mức `Σ entries.qty ≤ items.target`) giữ nguyên |

---

## 5. Ảnh hưởng dữ liệu

**Không có.** Không migration, không cột mới, không `schema.js` 🔒. FEAT-19 chỉ đọc `item_po`
(bảng đã có từ migration v4 của FEAT-18).

---

## 6. Thiết kế

### 6.1 Hình dạng một dòng (chuẩn hoá cho `ItemCard`)

| Trường | Nguồn | Ghi chú |
|---|---|---|
| `ntk`, `order_batch_id` | `items` | như cũ |
| `po` | **một** PO của `item_po` | không còn `+` |
| `target` | `item_po.qty` của PO đó | ở dòng gộp (AC-SPLIT-10) thì lấy `items.target` |
| `produced`, `defect` | `items` | **dùng chung** cho mọi dòng của mã (Q1) |
| `nw_kg`, `gw_kg`, `volume_cbm`, `package_count` | `items` | dòng tách đầu = giá trị thật; dòng sau = `null` ⇒ `ItemCard` tự ẩn (Q2, `INV-I1`) |
| `poCount` | số PO của mã | `1` = mã một PO |
| `isSplit` | `poCount > 1 && đã tách` | quyết định ẩn Sửa/Xoá (Q3) |
| `mergedMultiPo` | mã đa PO **không** có `item_po` | bật ghi chú AC-SPLIT-10 |
| `itemDone` | `items` (mức mã) | bộ lọc trạng thái (AC-SPLIT-09) |
| `rowKey` | `${order_batch_id}-${ntk}-${po}` | duy nhất cho React `key` |

### 6.2 Luồng

```
items + item_po ──splitItemRows()──▶ rows[] ──filterItemRows(state)──▶ ItemsScreen ──▶ ItemCard
                                        │
                                        └─► pos = allPOs(items) (giữ nguyên) ──▶ FilterChips
```

`poSummaries()` (bảng `Tổng theo PO`) **không** dùng `splitItemRows` — nó gom theo PO, khác mục đích.

### 6.3 Vì sao `buildPoQtyByNtk` nằm ở `itemRows.js`

`poSummary.js` đã có sẵn hàm gom này (private). Đưa sang `itemRows.js` và **export** để cả hai nơi
dùng chung một cách tách — tránh hai bản sao lệch nhau. `poSummary.js` chỉ **thay dòng import**,
logic không đổi (`scripts/test-poSummary.mjs` bảo chứng).

---

## 7. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| `Σ` thẻ tách cộng trùng | Mỗi dòng chỉ nhận `qty` của **riêng** PO ⇒ `Σ = items.target` (AC-SPLIT-03, **INV-D7**) |
| `SummaryCards` nhân đôi | Vẫn tính từ `items`, **không** đổi (AC-SPLIT-11) |
| Người dùng tưởng nhập sản xuất ở PO nào cũng tách | Ghi chú trên thẻ (AC-SPLIT-05) + `SummaryCards` là nguồn số tổng |
| Bấm Xoá nhầm mất cả PO | Ẩn nút ở thẻ tách (AC-SPLIT-07) — `removeItem` nhắm theo mã |
| Bộ lọc trạng thái cho kết quả sai | Tính theo mã, không theo kế hoạch per-PO (AC-SPLIT-09) |
| React `key` trùng giữa 2 dòng cùng mã | `rowKey` có kèm `po` (AC-SPLIT-08) |
| Mã đa PO chưa có `item_po` hiển thị sai | Giữ thẻ gộp + ghi chú hướng dẫn (AC-SPLIT-10), **không** bịa số |

---

## 8. Kế hoạch kiểm thử

- `scripts/test-itemRows.mjs`: tách đúng số dòng; `target` per-PO đúng; `Σ = items.target`
  (**INV-D7**); mã một PO không đổi; dòng sau có 4 trường FEAT-17 = `null`; `rowKey` duy nhất;
  mã đa PO không có `item_po` ⇒ `mergedMultiPo`; lọc PO / tìm kiếm / trạng thái; rỗng ⇒ `[]`;
  dữ liệu bất thường (`itemPoRows` null/rác) không làm hỏng.
- `scripts/test-poSummary.mjs`: chạy lại nguyên vẹn sau khi tách `buildPoQtyByNtk` ra.
- Hồi quy: `npm test`, `npx expo lint`, `npx tsc --noEmit`, `npx expo export --platform android`.

---

## 9. Tiêu chí xong

- [ ] Toàn bộ mục 10.4 của SPEC-rules.md