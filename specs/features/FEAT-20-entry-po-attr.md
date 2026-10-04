# FEAT-20 — Gắn PO vào nhật ký sản xuất: bảng "Tổng theo PO" hiện được cột "Đã sản xuất"/"Còn lại"

> **Cấp thay đổi: 2 (thêm cột `entries.po`) + 3 (đổi hành vi hai cột của bảng PO, thẻ mã hàng)**
> — chủ dự án chỉ đạo 2026-10-04:
> *"Mỗi mã dùng chung cần có một id để xác định riêng cho PO tương ứng, khi đó cộng dồn sẽ không
> bị vượt số tổng vì chỉ cộng dồn với những mã sản phẩm có cùng id với PO"*.
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-acceptance.md](../SPEC-acceptance.md) | [SPEC-test.md](../SPEC-test.md)

---

## 1. Bối cảnh & mục tiêu

### Lỗi đang thấy trên máy thật (`Dmac.json`, 12 PO 2919–2930)

FEAT-18 dựng đúng cột `Tổng` theo PO nhờ bảng `item_po`, nhưng **cột `Đã sản xuất` và `Còn lại`
mất trắng toàn bộ bảng**:

```
PO     | Tổng | ĐÃ SẢN XUẤT | CÒN LẠI
2922   | 2934 |     —     |   —
…               (12/12 dòng đều —)
2928   | 1645 |     —     |   —
```

**Nguyên nhân** (`src/utils/poSummary.js`): chỉ cần **một** mã dùng chung nằm trong PO là cả dòng
bị đặt `hasShared`, rồi `produced`/`remaining`/`pct` bị đặt `null` ⇒ `PoSummaryTable` hiện `—`.
Đo trên dữ liệu thật: **15/49 mã dùng chung**, rải đều trên cả 12 PO ⇒ **không PO nào còn số**.

Nguyên nhân gốc vẫn là điều FEAT-18 §6.3 đã nêu: `entries` ghi sản lượng theo **`ntk`** nên
`1072017GF` (thuộc 6 PO) chỉ có **một** con số sản lượng, không tách được cho 6 PO.

### Vì sao FEAT-18/19 không giải được

`item_po` chỉ tách được **kế hoạch**. Còn sản lượng thì chưa từng được ghi theo PO, nên dữ liệu
**không tồn tại** — không phải lỗi tính toán. Mọi cách "đoán" đều là bịa số:

| Cách | Kết quả | Vì sao không dùng |
|---|---|---|
| Cộng sản lượng mã dùng chung vào **mọi** PO của nó | `Σ` cột **vượt** tổng thật (mã 6 PO đếm 6 lần) | Sai số |
| Chia đều theo tỷ lệ `qty` | `Σ` khớp tuyệt đối | **Số bịa** — không có dữ liệu nào cho biết sản xuất theo PO nào |
| Chỉ tính mã thuộc riêng PO | `Σ` ≤ tổng thật | Bỏ sót phần lớn sản lượng |

### Mục tiêu

Cho **người dùng** ghi PO khi nhập sản xuất, để sản lượng trở thành **số đo thật** theo PO.

---

## 2. Định danh: `(order_batch_id, ntk, po)`

Yêu cầu: *"mỗi mã dùng chung cần có một id để xác định riêng cho PO tương ứng"*.

**Cách chọn: dùng cột `entries.po`, không sinh khoá số thay thế.**

| | Phương án chọn | Vì sao |
|---|---|---|
| Định danh | `(order_batch_id, ntk, po)` — cột `entries.po` trỏ tới **đúng** PO của `item_po` | `item_po` **đã có** PK `(ntk, po, order_batch_id)` từ FEAT-18 ⇒ cặp `(ntk, po)` **đã là** một định danh sẵn có |
| Không chọn | Thêm cột `item_po.id` số tự tăng + `entries.item_po_id` | Phải `REBUILD` bảng `item_po` (Cấp 3, phá PK đã dùng), thêm 1 bảng join, và tạo **2** nguồn sự thật cho cùng một thứ |

⇒ `entries.po` là phần còn thiếu của một định danh **đã có sẵn**, không phải cơ chế mới.

`po` **nullable**: nhật ký cũ chưa gắn PO ⇒ `NULL` (không đoán, không ghi đè dữ liệu cũ).

---

## 3. Quy tắc quy sản lượng về PO — **INV-P1** (bất biến mới)

| Trường hợp | Sản lượng của PO đó | Lý do |
|---|---|---|
| Mã thuộc **một** PO | **Mọi** nhật ký của mã (kể cả `po IS NULL`) | Không mơ hồ — mã chỉ có đúng một PO |
| Mã thuộc **nhiều** PO, nhật ký **có** `po` | Chỉ nhật ký `po = <PO đó>` | Đây là điều người dùng đã khai |
| Mã thuộc **nhiều** PO, nhật ký `po IS NULL` | **Không** tính vào PO nào | Không đoán được; đếm vào mọi PO là sai |

Hệ quả (chính là điều chủ dự án yêu cầu):

```
Σ(Đã sản xuất của mọi dòng PO)  ≤  Σ(entries.qty)      — luôn, không bao giờ vượt
Σ(Đã sản xuất của mọi dòng PO) == Σ(entries.qty)      — khi mọi nhật ký mã đa PO đều đã gắn PO
```

> Sản lượng chưa gắn PO **không** bị xoá và **không** bị giấu: nó vẫn hiện đầy đủ ở `SummaryCards`
> và ở thẻ mã (mức mã), và bảng PO có dòng chú thích báo **tổng** số lượng chưa gắn PO.

---

## 4. Acceptance Criteria

| ID | Hành vi |
|---|---|
| **AC-P1** | Migration v5 thêm cột `entries.po`; `NULL` cho mọi nhật ký cũ. Idempotent (chạy lại không lỗi), **không** `DROP`/`REWRITE` |
| **AC-P2** | Nhập sản xuất trên thẻ đã tách PO ⇒ nhật ký được ghi kèm `po` của thẻ đó. Thẻ mã **một** PO cũng ghi `po` (để sau này thêm PO thì lịch sử vẫn đúng) |
| **AC-P3** | Thẻ đã tách PO: `Đã làm` / `Lỗi` / `Còn lại` / `%` tính theo **riêng PO đó** ⇒ `Σ` các thẻ của mã **bằng** `Σ` nhật ký của mã (**INV-D8**) |
| **AC-P4** | Mã thuộc **một** PO: `Đã làm` / `Lỗi` / `Cần lại` **không đổi** (vẫn là tổng mã) |
| **AC-P5** | Bảng `Tổng theo PO`: **không còn dòng nào hiện `—`** (trừ PO có `Tổng = 0` ⇒ `Còn lại = 0` như cũ). Cột `Đã sản xuất` là **số đo thật** |
| **AC-P6** | Bất biến **INV-P1**: `Σ Đã sản xuất` của bảng **≤** `Σ entries.qty`, **không bao giờ vượt** |
| **AC-P7** | Cột `Tổng` của bảng **không đổi** (FEAT-18) và `Σ Tổng` vẫn khớp `Kế hoạch` (INV-D6) |
| **AC-P8** | Nhật ký `po IS NULL` của mã **nhiều** PO: bảng PO có **một dòng chú thích** báo tổng số lượng chưa gắn PO + hướng dẫn gán (không lặp ở từng dòng để khỏi cộng trùng) |
| **AC-P9** | Sửa một nhật ký cũ ⇒ **chọn được PO** của mã đó ⇒ sản lượng chuyển sang bảng PO ngay. Danh sách nhật ký hiện nhãn `PO xxxx` (hoặc `chưa gắn PO`) |
| **AC-P10** | `po` không thuộc PO của mã ⇒ **từ chối** với thông báo tiếng Việt nêu rõ PO không hợp lệ; **không** ghi DB |
| **AC-P11** | Hạn mức `INV-V1` (`Σ entries.qty ≤ items.target`) tính trên **mức mã**, **không đổi** — kể cả khi nhật ký đã gắn PO |
| **AC-P12** | `SummaryCards` **không đổi** (vẫn tổng mọi nhật ký) — không nhân đôi |
| **AC-P13** | `items.target`, `order_batches.total_target`, bảng `pallet_status` **không đổi**; `db/schema.js` 🔒 không đụng |

---

## 5. Ảnh hưởng dữ liệu

**Migration v5** (`src/db/migrations.js`) — **bổ sung**, không `DROP`/`REWRITE`:

```sql
ALTER TABLE entries ADD COLUMN po TEXT;   -- NULL = chưa gắn PO
CREATE INDEX IF NOT EXISTS idx_entries_ntk_po ON entries(ntk, order_batch_id, po);
```

`ADD COLUMN` **không** idempotent (`duplicate column name`) và `ALTER` **không** nằm trong
transaction ⇒ dùng **đúng** khuôn của BUGFIX-08: đọc `PRAGMA table_info(entries)`, chỉ `ADD`
khi còn thiếu, **không** đóng dấu `user_version = 5` nếu vá chưa xong.

| Tiêu chí | Kết luận |
|---|---|
| Loại migration | **Bổ sung** — `NULL` cho dữ liệu cũ, không sửa dòng nào |
| `db/schema.js` 🔒 | **không** sửa: cài mới chạy v1 → v2 → v3 → v4 → v5 |
| Dữ liệu cũ | Giữ nguyên; sản lượng cũ của mã **một** PO vẫn hiện đúng; của mã **nhiều** PO hiện ở mức mã + chú thích |
| Có breaking change DB? | **Không** |

---

## 6. Thiết kế

### 6.1 Hợp đồng dữ liệu (đều là **tham số/thuộc tính tuỳ chọn** — quy tắc vàng #3)

| Nơi | Thay đổi |
|---|---|
| `queries.addEntry(batchId, ntk, payload)` | payload nhận **thêm** `po` (tuỳ chọn). Không truyền ⇒ `NULL` ⇒ hành vi **y hệt** trước |
| `queries.updateEntry(entryId, payload)` | payload nhận **thêm** `po`; truyền `''` ⇒ xoá gắn PO |
| `queries.fetchItemsWithStats(batchId)` | mỗi item **thêm** `poStats: [{po, produced, defect}]` + `unattributedProduced` |
| `poSummaries(items, allPos, perPoRows, entryPoStats)` | tham số **thứ 4** tuỳ chọn; bỏ trống ⇒ rơi về hành vi FEAT-18 |
| `splitItemRows(items, itemPoRows, entryPoStats)` | tham số **thứ 3** tuỳ chọn, tương tự |
| `PoSummaryTable` | prop **tuỳ chọn** `unattributed` (số lượng chưa gắn PO) |
| `EntryLogRow` | hiện nhãn PO từ `entry.po` — không thêm prop |
| `store` | **không** sửa: `addEntry(ntk, payload)` chuyển tiếp `payload` nguyên vẹn |

### 6.2 Luồng ghi

```
Thẻ đã tách (106167GF / PO 2922) → nhập 50 pcs
   └─ onAddEntry(ntk, { …, po: '2922' })   ← po lấy từ chính dòng đang hiển thị
        └─ queries.addEntry → INSERT entries(…, po)
             └─ fetchItemsWithStats → poStats [{po:'2922', produced:50}]
                  └─ poSummaries(…, poStats) → dòng 2922: Tổng 270 · Đã làm 50 · Còn lại 220
                       └─ splitItemRows(…, poStats) → thẻ tách hiện Đã làm 50
```

Vì FEAT-19 đã tách thẻ theo PO, **PO cần ghi chính là PO của thẻ đang mở** — người dùng không phải
chọn thêm, không thể chọn nhầm.

### 6.3 Vì sao `hasShared` vẫn giữ nhưng không còn làm trắng cột

`hasShared` giữ nguyên ý nghĩa (dòng có mã dùng chung) vì `PoSummaryTable` dùng nó để quyết
định hiện chú thích. Chỉ bỏ việc đặt `produced = null`. `pct` tính thường trừ khi `target = 0`.

---

## 7. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| `Σ Đã sản xuất` vượt tổng | Chỉ nhật ký **có** `po` mới được cộng vào PO (INV-P1, AC-P6); `po IS NULL` của mã đa PO không vào đâu |
| Sản lượng cũ "biến mất" khỏi bảng PO | Nhật ký cũ **không** bị xoá; vẫn hiện ở `SummaryCards` + thẻ mã; bảng PO có chú thích nêu rõ số lượng chưa gắn PO (AC-P8) và có đường gán lại (AC-P9) |
| Ghi `po` sai làm hỏng số liệu | `queries` chỉ nhận `po` thuộc `items.po` của mã, sai ⇒ `ENTRY_PO_INVALID`, không ghi DB (AC-P10) |
| Migration v5 chạy lại lỗi `duplicate column name` | `ensureEntryPoColumn()` đọc `PRAGMA table_info` trước — đúng khuôn BUGFIX-08 |
| Đổi chữ ký `queries`/`store` | Chỉ **thêm** thuộc tính tuỳ chọn vào object payload; không đổi số/thứ tự tham số |
| `hasShared` biến mất làm vỡ `PoSummaryTable` | Giữ nguyên trường; chỉ đổi cách tính `produced` |

---

## 8. Kế hoạch kiểm thử

- `scripts/test-migrations.mjs`: v5 trên SQLite thật — DB v4 ⇒ thêm cột `po`, dữ liệu cũ `NULL`;
  chạy lại **không** lỗi; v1→v5 đầy đủ.
- `scripts/test-schemaColumns.mjs`: `ensureEntryPoColumn` idempotent + tên cột an toàn.
- `scripts/test-poSummary.mjs`: bỏ `hasShared`→null; INV-P1 (Σ ≤ tổng); mã một PO dùng tổng mã;
  sửa nhật ký cũ ⇒ số chuyển sang PO; không truyền `entryPoStats` ⇒ y hệt FEAT-18.
- `scripts/test-itemRows.mjs`: `produced` per-PO ở thẻ tách; `Σ` thẻ = tổng mã (INV-D8).
- Hồi quy: `npm test`, `npx expo lint`, `npx tsc --noEmit`, `npx expo export --platform android`.

---

## 9. Tiêu chí xong

- [ ] Toàn bộ mục 10.4 của SPEC-rules.md