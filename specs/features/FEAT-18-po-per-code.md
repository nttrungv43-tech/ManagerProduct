# FEAT-18 — Tổng theo PO đúng số lượng của từng PO (bảng trung gian `item_po`)

> **Cấp thay đổi: 2 (thêm bảng) + 3 (đổi hành vi bảng "Tổng theo PO")** — chủ dự án chỉ đạo
> rõ ràng 2026-10-04: *"Hãy sửa theo hướng C"*.
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-acceptance.md](../SPEC-acceptance.md) | [SPEC-test.md](../SPEC-test.md)

---

## 1. Bối cảnh & mục tiêu

### Vấn đề (đã đo trên `src/data/Dmac.json`, 12 PO 2919–2930)

App lưu PO của mã hàng dạng **chuỗi nối** trong `items.po`. Mã thuộc nhiều PO ⇒ `po` có `+` ⇒
`poSummaries()` dồn **toàn bộ** vào một nhóm `Nhiều PO`, **không** dồn vào dòng PO nào.

Hậu quả quan sát được:

| PO | Số mã thuộc riêng | Cột "Tổng" |
|---|---|---|
| **2924** | **0** (5 mã đều dùng chung) | **0** |
| **2929** | **0** (4 mã đều dùng chung) | **0** |
| 10 PO còn lại | 1–5 mã | chỉ tính phần *riêng*, thiếu phần dùng chung |

Và `target` của mã hiển thị trên thẻ mã là **Σ qty trên tất cả PO** (`packingV1Import.js:247`),
nên người dùng thấy "số lượng không đúng" khi so với từng PO. Ví dụ `1063057GF` = 1320
(= 1080 của 2924 + 240 của 2929); `1072017GF` = 2808 trên 6 PO.

### Nguyên nhân gốc

Thiếu quan hệ **"mã này thuộc PO nào, với số lượng bao nhiêu"**. `items.po` chỉ giữ tập PO, còn
`items.target` là tổng ⇒ không thể tách ngược. Đây là giới hạn mô hình dữ liệu, không phải lỗi
tính toán: `Σ bảng = Σ file = 25.520` — số học đúng, biểu diễn sai.

### Mục tiêu (đo được)

- Mỗi dòng PO trong bảng "Tổng theo PO" hiện **đúng số lượng của riêng PO đó**.
- `Σ cột "Tổng" của bảng` **vẫn** bằng tổng cả đơn (giữ INV-D6).
- Dữ liệu cũ không mất, app không lỗi sau khi nâng cấp.

---

## 2. Phạm vi

- **Làm:** bảng trung gian `item_po`; `queries.fetchItemPoRows()`; `importPackingV1`/`addItem`/
  `updateItem`/`removeItem`/`removeItemsByPo`/`deleteArchive` đồng bộ `item_po`;
  `poSummaries()` nhận tham số thứ 3 (dữ liệu per-PO) và dựng dòng PO từ đó;
  `PoSummaryTable` hiện `—` cho cột không quy được về một PO.
- **KHÔNG làm (non-goals):** không bỏ cột `items.po` (nhiều chỗ đang dùng: chip lọc, xoá theo PO,
  `allPOs`, hiển thị); không đổi chữ ký hàm đang có (quy tắc vàng #3) — chỉ **thêm** hàm mới và
  thêm tham số tuỳ chọn; không sửa `src/db/schema.js` 🔒 (tạo bảng trong migration v4 như v3);
  không tính phân bổ `produced` theo PO (xem §6.3); không sửa migration v1/v2/v3.
- **Cấp thay đổi:** **2 + 3**.

---

## 3. Acceptance Criteria

| ID | Hành vi |
|---|---|
| **AC-PO-01** | Sau import `packing_data.json`, **mọi** PO trong `allPOs` đều có dòng với `target` = Σ `qty` của các mã thuộc riêng PO đó trong file nguồn |
| **AC-PO-02** | Với `Dmac.json`: dòng **2924** = 2.418 và dòng **2929** = 1.682 (không còn 0) |
| **AC-PO-03** | `Σ cột "Tổng" của bảng PO` == `Σ items.target` (INV-D6 giữ nguyên) |
| **AC-PO-04** | Mã hàng nằm ở nhiều PO vẫn xuất hiện đủ khi bấm chip lọc từng PO (`filteredItems` không đổi) |
| **AC-PO-05** | Dòng PO có mã dùng chung ⇒ cột "Đã sản xuất"/"Còn lại" hiện `—` (không bịa số) + có dòng chú thích giải thích |
| **AC-PO-06** | PO không có mã nào (kể cả mã dùng chung) ⇒ `target = 0`, `itemCount = 0` — như cũ, không đổi |
| **AC-PO-07** | Mã **không** có bản ghi `item_po` (dữ liệu cũ) ⇒ **rơi về hành vi cũ**: mã đa PO vào nhóm `Nhiều PO`, mã một PO cộng vào PO của nó |
| **AC-PO-08** | Migration v4 trên DB cũ: tạo `item_po`, backfill đúng mọi mã một-PO, **không** `DROP`/`ALTER` bảng nào, chạy lại 2 lần không lỗi |
| **AC-PO-09** | Xoá mã / xoá theo PO / xoá hẳn đơn lưu trữ ⇒ **không** còn dòng `item_po` mồ côi |
| **AC-PO-10** | Thêm/sửa mã thủ công: PO một ⇒ có `item_po` (qty = target); PO nhiều ⇒ không có dòng `item_po` (rơi về AC-PO-07) |
| **AC-PO-11** | `Σ items.target` và `order_batches.total_target` **không đổi** vì FEAT-18 |

---

## 4. Ảnh hưởng dữ liệu

**Migration v4** (`src/db/migrations.js`):

```sql
CREATE TABLE IF NOT EXISTS item_po (
  ntk TEXT NOT NULL,
  po TEXT NOT NULL,
  qty INTEGER,
  order_batch_id INTEGER NOT NULL,
  PRIMARY KEY (ntk, po, order_batch_id)
);
CREATE INDEX IF NOT EXISTS idx_item_po_batch ON item_po(order_batch_id, po);
```

| Tiêu chí | Kết luận |
|---|---|
| Loại migration | **Bổ sung** — không `DROP`, không `ALTER` phá huỷ, không đổi PK/index của bảng cũ |
| `db/schema.js` 🔒 | **không** sửa: cài mới chạy v1 → v2 → v3 → v4 nên cùng đường với nâng cấp |
| Backfill | `INSERT OR IGNORE … SELECT … FROM items WHERE INSTR(po,'+') = 0` — chỉ mã **một PO** thì suy ra chính xác `qty = target` |
| Mã **nhiều PO** | **không** tách được từ `items` (`target` là tổng) ⇒ để trống ⇒ UI fallback AC-PO-07. Muốn có số liệu phải **import lại** file nguồn |
| Idempotent | `IF NOT EXISTS` + `INSERT OR IGNORE` ⇒ chạy lại không lỗi |
| Có breaking change DB? | **Không** |

---

## 5. Kế hoạch file

| File | Mức | Hành động | Lý do |
|---|---|---|---|
| `src/db/migrations.js` | 🔒 | **thêm** migration v4 | Bảng mới + backfill |
| `src/db/queries.js` | 🔒 | **thêm** `fetchItemPoRows`; sửa thân `importPackingV1`/`addItem`/`updateItem`/`removeItem`/`removeItemsByPo`/`deleteArchive` | Không đổi chữ ký hàm đang có |
| `src/utils/poSummary.js` | 🟢 | `poSummaries(items, allPos, perPoRows)` — tham số 3 tuỳ chọn | Hàm thuần, test được bằng `node` |
| `src/store/useAppStore.js` | 🔒 | **thêm** state `itemPoRows` + nạp trong `init`/`refreshItems` | Không đổi state/action hiện có |
| `src/screens/ItemsScreen.js` | 🟡 | truyền `itemPoRows` xuống `poSummaries` | |
| `src/components/PoSummaryTable.js` | 🟢 | hiện `—` khi giá trị `null` + dòng chú thích | |
| `src/utils/packingV1Import.js` | 🟢 | `planShipment`/`buildImportPlanV1` trả thêm `poQty` | Nguồn của dữ liệu per-PO |
| `scripts/test-poSummary.mjs` | 🟢 | thêm ca per-PO + fallback + INV-D6 | |
| `scripts/test-packingV1Import.mjs`, `scripts/test-dbInit.mjs` | 🟢 | thêm ca `poQty` + E2E migration v4 | |
| `specs/*`, `SPEC.md`, `tasks.md` | 🟢 | registry, INV-D6, AC, RC, changelog | |

---

## 6. Thiết kế

### 6.1 Luồng dữ liệu

```
importPackingV1 (packing_data.json)
   └─ buildImportPlanV1 → items[{ntk, po:"2919+2921", target, poQty:[{po:"2919",qty:74},{po:"2921",qty:148}]}]
        └─ ghi items (như cũ) + item_po (1 dòng / (ntk, po))
items + item_po ──fetch──▶ store {items, itemPoRows}
                              └─ poSummaries(items, allPos, itemPoRows) ──▶ PoSummaryTable
```

### 6.2 `poSummaries` — dựng dòng PO

Với mỗi mã `it`:

| Tình huống | Xử lý |
|---|---|
| Có dòng `item_po` | `target` của PO p **cộng** `qty` của mã trong PO p ⇒ **tách đúng theo PO**. Nếu mã thuộc >1 PO ⇒ đánh dấu dòng `hasShared` |
| Không có dòng `item_po` | **Fallback = hành vi cũ**: `po` có `+` ⇒ nhóm `Nhiều PO` với `target`; `po` một ⇒ cộng vào PO đó |

`produced`/`remaining`/`pct` chỉ tính cho dòng **không** `hasShared` (và nhóm `Nhiều PO`);
ngược lại `null` ⇒ UI hiện `—`.

> **Vì sao `Σ bảng` vẫn bằng tổng đơn (AC-PO-03):** với mã `X` thuộc các PO p₁…pₖ,
> `Σ items.target(X) = qty(p₁)+…+qty(pₖ)`, và bảng cộng `qty(p₁)` vào dòng p₁, … ⇒ tổng các dòng
> của mọi PO = `Σ items.target`. Dòng "Nhiều PO" chỉ chứa mã **không** có `item_po` ⇒ không cộng trùng.

### 6.3 Vì sao **không** phân bổ `produced` theo PO

`entries` ghi nhận sản lượng theo **`ntk`**, không theo PO. Mã ở 3 PO có **một** `target` trong app
(= tổng). Không có dữ liệu nào cho biết đơn vị sản xuất thuộc PO nào ⇒ **bất kỳ** con số nào khác
`—` đều là bịa. Vì vậy dòng có mã dùng chung hiện `—` (AC-PO-05); tổng sản lượng vẫn có chính xác ở
`SummaryCards` phía trên. Nếu sau này cần, phải thêm trường chọn PO khi ghi nhật ký (ngoài phạm vi).

### 6.4 Văn bản UI

- Cột `Tổng` / `Đã sản xuất` / `Còn lại`: `—` khi không quy được.
- Dòng chú thích (một lần, dưới bảng): *"Mã dùng chung nhiều PO: số lượng theo PO đã tách đúng ở
  cột Tổng; cột Đã sản xuất/Còn lại không quy về từng PO được vì nhật ký sản xuất chỉ ghi theo mã
  hàng."*

---

## 7. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| `item_po` mồ côi khi xoá mã / xoá đơn lưu trữ | Xoá kèm trong **cùng** transaction ở `removeItem`, `removeItemsByPo`, `deleteArchive` (AC-PO-09) |
| Bảng PO cộng trùng mã đa PO | `item_po` lưu **phần của từng PO** (không lưu `target`), mỗi PO một dòng riêng (AC-PO-03) |
| Dữ liệu cũ hiển thị sai sau nâng cấp | Fallback AC-PO-07 giữ **đúng** hành vi cũ cho mã không có `item_po` |
| Sửa tay mã đa PO làm mất phân tách | `updateItem` xoá rồi tạo lại `item_po`; mã đa PO không tạo dòng ⇒ rơi về fallback (đã ghi trong AC-PO-10) |
| `total_target` lệch | FEAT-18 **không** đụng `items.target` (AC-PO-11) |
| Vi phạm quy tắc vàng #3 (đổi chữ ký) | `fetchItemPoRows` là hàm **mới**; `poSummaries` chỉ **thêm** tham số tuỳ chọn có mặc định |
| `PoSummaryTable` crash khi giá trị `null` | Render `—` khi `== null` (kiểm tra bằng `== null` để bắt cả `null` lẫn `undefined`) |

---

## 8. Kế hoạch kiểm thử

- `scripts/test-poSummary.mjs`: per-PO tách đúng; mã đa PO **không** cộng trùng; `hasShared` ⇒
  `produced = null`; fallback mã không có `item_po`; `Σ bảng == Σ items.target`; rỗng ⇒ `[]`.
- `scripts/test-packingV1Import.mjs`: `planShipment` trả `poQty`; mã ở nhiều shipment ⇒ `poQty` cộng dồn.
- `scripts/test-dbInit.mjs`: thêm kịch bản `migration-v4` — DB v3 cũ ⇒ tạo bảng + backfill đúng;
  chạy 2 lần không lỗi.
- Hồi quy: `npm test`, `npx expo lint`, `npx tsc --noEmit`, `npx expo export`.
- **RC-124** (máy thật): sau khi nâng cấp, mở app không lỗi; import `Dmac.json`; dòng 2924 = 2.418,
  2929 = 1.682; `Σ` bảng = `Σ` thẻ mã.
- **RC-125** (máy thật): dữ liệu cũ **chưa** import lại ⇒ bảng PO y hệt trước khi nâng cấp.

---

## 9. Tiêu chí xong

- [ ] Toàn bộ mục 10.4 của SPEC-rules.md