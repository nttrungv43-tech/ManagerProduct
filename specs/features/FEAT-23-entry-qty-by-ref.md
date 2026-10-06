# FEAT-23 — Nhập số lượng sản xuất **theo từng `order_ref`** (phương án A)

> Cấp 3 (đổi hành vi nhập số lượng + thêm bảng) — chủ dự án chọn **phương án A** ngày 2026-10-05.
> Dựa trên nền FEAT-22 (`order_line_refs`). Liên quan: FEAT-09 (`INV-V1`), FEAT-20, FEAT-21, FEAT-22.

---

## 1. Bối cảnh & mục tiêu

FEAT-22 đã lưu được `order_ref` **đúng theo PO × mã** kèm `target` riêng của từng ref, và kiểm
chứng `Σ target` mỗi ref bằng đúng `order_lines.target` (**76/76** dòng, tổng **25.520** trên
`Dmac.json`).

Nhưng nhật ký sản xuất vẫn chỉ gắn vào **dòng đơn hàng** (`order_line_id`), nên với mã có nhiều ref
người dùng **không biết số đã làm của riêng từng ref là bao nhiêu**.

**Vấn đề cụ thể** — `PO 2919 / 1063048GF`, `target` 716 pcs, chia 3 ref:

| `order_ref` | Kế hoạch của ref |
|---|---|
| `D980470` | 477 pcs |
| `D980973` | 159 pcs |
| `D980781` | 80 pcs |

Nhập 300 pcs hôm nay: không biết 300 đó thuộc ref nào. Đóng xong, xưởng đòi báo cáo theo số hiệu
nhà máy thì app không trả lời được.

**Kết quả mong muốn (đo được):** mỗi ref có tiến độ riêng (đã làm / còn lại), người dùng nhập số lượng
**gắn vào một ref**, hạn mức chặn theo ref, và `Σ` các ref luôn khớp thẻ cha.

---

## 2. Phạm vi

**Làm:**
- Bảng `production_entry_refs` gắn **một** ref cho **một** mục nhật ký.
- Hạn mức **theo ref**: `SUM(qty) của ref ≤ order_line_refs.target` (`INV-R5`).
- `ItemCard`: khối tiến độ + ô nhập riêng cho từng ref (phương án A — thẻ cha **giữ nguyên**).
- Nhật ký hiển thị ref đã gắn; nhật ký chưa gắn ref được báo riêng.
- Sửa/xoá nhật ký giữ nguyên hạn mức theo ref.

**KHÔNG làm (non-goals):**
- ❌ Sửa `target` của ref (chỉ đọc từ packing list — `INV-R3`).
- ❌ Tách thẻ cha thành nhiều thẻ (đó là **phương án B**, chủ dự án đã chọn **A**).
- ❌ Nhập số lượng **không** gắn ref trong khối ref (nhật ký gốc vẫn nhập được như cũ).

**Cấp thay đổi: 3** — đổi hành vi nhập số lượng (đã được chủ dự án chọn phương án A) + thêm bảng.

---

## 3. Quyết định thiết kế: **phương án A** — thẻ cha giữ, ref là dòng con

Chủ dự án chọn **A** (2026-10-05), thay vì **B** (thẻ cha biến mất, mỗi ref một thẻ).

```
┌─ PO 2919 · 1063048GF ───────────────────┐
│ Kế hoạch: 716   Đã làm: 300   Còn lại: 416 │
│ Số hiệu (3)                                │
│   D980470 — 477 pcs                         │
│   D980973 — 159 pcs                         │
│   D980781 — 80 pcs                          │
│                                           │
│ ▸ Nhập sản xuất hôm nay  (Ghi cho PO 2919) │  ← giữ nguyên như FEAT-21
│ ▸ Tiến độ & nhập theo số hiệu              │  ← MỚI
│     D980470   [___]  Đã làm 200/477  Còn 277│
│     D980973   [___]  Đã làm 100/159  Còn  59│
│     D980781   [___]  Đã làm   0/ 80  Còn  80│
└───────────────────────────────────────────┘
```

**Vì sao A, không phải B:**

| | A (chọn) | B (bị loại) |
|---|---|---|
| Ô `Kế hoạch 716` ở thẻ cha | **giữ** | mất ⇒ phải dựng lại từ tổng ref |
| `Σ` thẻ con | = 716 = thẻ cha | = 716, nhưng **không** còn dòng tổng |
| Rủi ro `INV-D7` | không đụng (ref là con, không cộng vào danh sách thẻ) | phải kiểm lại |
| Người dùng | vẫn thấy tổng của PO | phải cộng 3 dòng trong đầu |
| `Σ` khớp thẻ cha | **bảo đảm bằng `INV-R6`** | phải suy ra |

Thẻ con **không phải** `order_lines` ⇒ **không** vào `v_line_progress`/`v_po_progress` ⇒ `INV-D6`
(`Σ` bảng PO = tổng đơn) và `INV-D7` không bị đụng. Số hiệu chỉ là **chi tiết hiển thị + hạn mức**.

---

## 4. Acceptance Criteria

| ID | Given / When / Then |
|---|---|
| **AC-RF-01** | Given thẻ có 3 ref, When nhìn thẻ, Then hiện **3** dòng tiến độ: `Đã làm N/target` và `Còn lại` cho **từng** ref |
| **AC-RF-02** | Given ref `D980470` (kế hoạch 477) đã nhập 300, When nhập thêm 200 vào ref đó, Then `Alert` chặn vượt hạn mức của **ref**; `Đã làm` của ref **không đổi** (300) |
| **AC-RF-03** | Given ref `D980470` (477) đã nhập 300, When nhập 300 vào ref `D580422` khác, Then **cho phép** — hạn mức tính theo từng ref, không chặn nhầm |
| **AC-RF-04** | Given 3 ref tổng 716 và thẻ cha `Đã làm 0`, When nhập lần lượt 200 + 100 + 50 vào 3 ref, Then `Đã làm` ở thẻ cha = **350** (tự cộng từ nhật ký) |
| **AC-RF-05** | Given tổng các ref đã nhập **không** vượt tổng kế hoạch của thẻ, When `Σ` sản lượng, Then bằng `Σ qty` nhật ký — **không** cộng trùng (nguyên tắc vàng: mọi màn hình đọc cùng một nguồn) |
| **AC-RF-06** | Given nhật ký gắn ref, When mở danh sách nhật ký, Then dòng đó hiện `· D980470` |
| **AC-RF-07** | Given nhật ký **không** gắn ref (nhập bằng form gốc), When mở danh sách nhật ký, Then ghi rõ *"chưa gắn số hiệu"* — không bịa ref |
| **AC-RF-08** | Given `Σ` nhật ký theo ref **không** bằng `Đã làm` ở thẻ cha (vì có nhật ký không gắn ref), When nhìn thẻ, Then hiện dòng *"chưa gắn số hiệu: N pcs"* — không im lặng làm `Σ` lệch |
| **AC-RF-09** | Given ref không có dữ liệu (`target = 0`), When hiển thị, Then dòng đó **ẩn** (`INV-I1`) — không hiện `0` |
| **AC-RF-10** | Given thẻ **không có** ref nào (mã thêm tay, DB cũ), When nhìn thẻ, Then **không** có khối nhập theo số hiệu; nhập số lượng qua form gốc như cũ |
| **AC-RF-11** | Given mã thêm tay rồi bấm `✎ Sửa mã hàng & số lượng` đổi `target`, When lưu, Then `Σ target` các ref **không** đổi (ref chỉ đọc) nhưng `Đã làm` không vượt `target` mới (`updateItem` chặn như cũ) |
| **AC-RF-12** | Given nhật ký gắn ref, When sửa qty, Then hạn mức ref tính **trừ** dòng đang sửa (`AC-ITEM-18`) — sửa lên 300→400 khi đã 300/477 thì cho phép |
| **AC-RF-13** | Given một mã có nhiều ref nhưng **tổng** vẫn ≤ `order_lines.target`, When nhập tới mức bằng đúng tổng, Then cho phép; vượt tổng thì `queries.js` chặn (`INV-V1` không nới) |
| **AC-RF-14** | Given nhật ký gắn ref rồi xoá, When xoá, Then dòng gắn ref đi theo (`ON DELETE CASCADE`) — không còn dữ liệu mồ côi |
| **AC-RF-15** | Given nhập ký gắn ref, When kiểm DB, Then `Σ qty` của mọi nhật ký (bất kể có ref hay không) **vẫn bằng** `Σ v_line_progress.produced` — con số không đổi so với trước FEAT-23 |

---

## 5. Ảnh hưởng dữ liệu

`SCHEMA_VERSION` 2 → 3. Thêm **một** bảng, **không** `ALTER` cột nào:

```sql
CREATE TABLE IF NOT EXISTS production_entry_refs (
  entry_id      INTEGER NOT NULL REFERENCES production_entries(id) ON DELETE CASCADE,
  order_line_id INTEGER NOT NULL,
  ref_no        TEXT    NOT NULL,
  -- FK tổng hợp: ref phải thuộc **đúng dòng đơn hàng** của nhật ký này ⇒ DB tự chặn
  -- "gắn nhầm ref của PO khác", thay vì để JS phải nhớ kiểm (đúng nguyên tắc FEAT-21).
  FOREIGN KEY (order_line_id, ref_no) REFERENCES order_line_refs(order_line_id, ref_no),
  PRIMARY KEY (entry_id)
);
CREATE INDEX IF NOT EXISTS ix_per_line_ref ON production_entry_refs(order_line_id, ref_no);
```

`order_line_refs` có PK `(order_line_id, ref_no)` nên FK tổng hợp tham chiếu được — SQLite yêu cầu
cột đích có unique index, PK là unique index.

**Vì sao bảng phụ thay vì `ALTER production_entries ADD COLUMN order_ref`:**
`src/db/index.js` sau FEAT-21 **không còn cơ chế `ALTER`** (đã bỏ hẳn `runMigrations`). Thêm cột sẽ
phải viết lại `ALTER` + schema guard — đúng thứ FEAT-21 bỏ vì BUG-08. Bảng phụ giữ nguyên tiền lệ
FEAT-22: **không đụng bảng cũ**, `CREATE TABLE IF NOT EXISTS` chạy mỗi lần mở app, DB đã có dữ liệu
nhập tay vẫn mở được bình thường.

**Bất biến mới:**

| ID | Bất biến |
|---|---|
| **INV-R5** | Với mọi `(order_line_id, ref_no)`: `SUM(production_entries.qty của ref) ≤ order_line_refs.target`. Kiểm **ở `queries.js`**, không chỉ ở UI — cùng cách `INV-V1` |
| **INV-R6** | `Σ qty` của mọi ref của một dòng đơn hàng **≤** `order_lines.target` của dòng đó. Hệ quả của `INV-R1` + `INV-R5`, kiểm bằng test |
| **INV-R7** | Một mục nhật ký gắn **nhiều nhất một** ref (`PRIMARY KEY (entry_id)`). Nhật ký không gắn ref là hợp lệ (không có dòng trong bảng phụ) |
| **INV-R8** | `Σ` mọi nhật ký (có ref hay không) **vẫn** là `produced` của thẻ cha. FEAT-23 **không** tạo số liệu song song — nó chỉ **gắn nhãn** cho những số đã có |

---

## 6. Kế hoạch file

| File | Mức | Hành động | Lý do |
|---|---|---|---|
| `src/db/schema.js` | 🔒 | **thêm** bảng `production_entry_refs`, `SCHEMA_VERSION = 3`, thêm `ref_progress` vào `v_line_progress` | Cấp 2, chủ dự án đã duyệt |
| `src/db/queries.js` | 🔒 | `addEntry`/`updateEntry` nhận `refNo` **tuỳ chọn**; **thêm** `checkRefTarget`; `fetchEntriesForLine` trả `ref_no` | Chỉ **thêm tham số tuỳ chọn** (quy tắc vàng #3) |
| `src/components/ItemCard.js` | 🟡 | Khối tiến độ + ô nhập theo ref; truyền `refNo` khi thêm/sửa | Đã được phép |
| `src/components/EntryLogRow.js` | 🟢 | Hiện `· <ref>` hoặc *"chưa gắn số hiệu"* | 🟢 tự do |
| `src/utils/refFormat.js` | 🟢 | thêm `normalizeRefProgress`, `hasRefProgress`, `refProgressText`, `unattributedText`, `formatRefOverLimit` | Hàm thuần, test được |
| `src/store/useAppStore.js` | 🔒 | **không sửa** — `addEntry`/`updateEntry` đã truyền `payload` nguyên vẹn xuống `queries` | Không cần action mới |
| `scripts/test-refFormat.mjs` | 🟢 | thêm ca cho tiến độ ref | |
| `scripts/test-schemaV2.mjs` | 🟢 | thêm khối kiểm FK + hạn mức ref trên SQLite thật | |
| `specs/*` | 🟢 | AC / data / test / changelog | §0.1 bước 7 |

**Không sửa:** `db/index.js`, `src/app/**`, `screens/*` (mọi thứ đi qua `ItemCard`).

---

## 7. Thiết kế

**Luồng ghi:** `ItemCard` → `store.addEntry(orderLineId, {…, refNo})` → `queries.addEntry`:
`checkLineTarget` (INV-V1, **giữ nguyên**) → **`checkRefTarget`** (INV-R5, chỉ khi có `refNo`) →
trong `withTransactionAsync`: `INSERT production_entries` + `INSERT production_entry_refs`.

**Luồng đọc:** view `v_line_progress` trả thêm `ref_progress` = chuỗi
`"D980470:200:477,D980973:100:159"` (`ref:đã làm:kế hoạch`) cho từng ref, cộng
`unattributed_produced` = `Σ qty` nhật ký **không** gắn ref của dòng đó.

> **Một chuỗi, không tách nhiều cột** — cùng lý do FEAT-22: `GROUP_CONCAT` không bảo đảm thứ tự nên
> nhiều cột ghép cặp sẽ lệch. Sắp xếp ở `refFormat.js`.

**Hàm `queries.js`** — chữ ký cũ giữ nguyên, chỉ **thêm tham số tuỳ chọn** (quy tắc vàng #3):
```js
addEntry(orderLineId, { date, qty, line, defectQty, defectTypes, refNo = null })
updateEntry(entryId,      { date, qty, line, defectQty, defectTypes, refNo = undefined })
```

> **`updateEntry` dùng `undefined` chứ không phải `null` là CỐ Ý — khác `addEntry`.**
> Ba trạng thái phải phân biệt được, nếu gộp hai cái đầu thì không sửa được nhật ký gắn ref:
>
> | `refNo` truyền vào | Ý nghĩa | Khi nào xảy ra |
> |---|---|---|
> | `undefined` (mặc định) | **giữ nguyên** ref đang gắn | form sửa cũ không nhắc tới ref |
> | `null` / rỗng | **bỏ** gắn ref | người dùng chủ động gỡ |
> | chuỗi | **đổi** sang ref đó | người dùng chuyển ref |
>
> Nếu đặt mặc định `null` thì mọi lần sửa qty một nhật ký gắn ref sẽ **xoá mất** ref của nó — âm
> thầm mất dữ liệu, vi phạm nguyên tắc "không âm thầm sửa". `refNo = undefined` giữ cho mọi lần
> gọi cũ (form sửa hiện tại, `store.updateEntry`) hành vi **y hệt** trước FEAT-23.
>
> Ghi/đổi ref đi qua `setEntryRef` (xoá rồi ghi lại trong cùng transaction) để không phải phân
> nhánh "thêm mới / cập nhật / bỏ" — một đường duy nhất, không có nhánh nào sót.

**Văn bản UI (tiếng Việt, `INV-U2`):**
- Tiêu đề khối: `Tiến độ & nhập theo số hiệu`
- Từng ref: `D980470 — Đã làm 200/477 · Còn lại 277` + ô nhập + nút `Thêm`
- Nhật ký: `2026-10-05 — 200 pcs · Thủ công · PO 2919 · D980470`
- Nhật ký chưa gắn: `… · PO 2919 · chưa gắn số hiệu`
- Tổng chưa gắn: `chưa gắn số hiệu: 50 pcs`
- Vượt hạn mức ref: `Alert` "Vượt kế hoạch số hiệu" + nêu ref, `Đã làm`, `còn lại`, `vượt`

---

## 8. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| `INV-V1` (`Σ entries ≤ target`) | `checkLineTarget` **giữ nguyên**, không nới. `INV-R5` là hạn mức **thêm**, không thay |
| `INV-D6`/`INV-D7` (`Σ` bảng PO / danh sách) | Ref không phải `order_lines` ⇒ không vào `v_po_progress`, không cộng vào danh sách thẻ |
| Số liệu song song (thẻ cha vs tổng ref) | `INV-R8`: không có con số thứ hai ở cấp thẻ. Tổng ref chỉ là **chi tiết hiển thị** |
| Ghi `refNo` sai dòng đơn hàng | FK tổng hợp chặn ở DB (`FOREIGN KEY (order_line_id, ref_no)`) |
| Một nhật ký nhiều ref | `PRIMARY KEY (entry_id)` chặn |
| Xoá nhật ký để lại rác | `ON DELETE CASCADE` |
| `Σ` ref lệch tổng thẻ (có nhật ký không gắn ref) | `AC-RF-08` hiện rõ dòng *"chưa gắn số hiệu"* thay vì im lặng |
| Nhật vượt hạn mức ref | `checkRefTarget` ở `queries.js` (không chỉ UI) + `Alert` giữ ô nhập như `INV-V1` |
| `EntryLogRow` đang hiện *"chưa gắn PO"* | `fetchEntriesForLine` **không** chọn cột `po` (đã bỏ ở FEAT-21) ⇒ nhãn PO đó giờ hiện sai. FEAT-23 chọn PO từ thẻ, **xoá** nhãn PO khỏi dòng nhật ký (mọi nhật ký đã thuộc đúng 1 PO) |

### 8.1 Hai lỗi phát hiện khi triển khai FEAT-23

Cả hai đều do **viết ghi chú SQL có ký tự backtick** bên trong template literal:
chuỗi `` `SELECT … ` `` bị khoá sớm, phần còn lại biến thành JS ⇒ `expo lint`/`tsc` báo lỗi ở
`src/components/ItemCard.js`, `HistoryScreen.js`, `useAppStore.js`, `src/db/schema.js` — tức
file **không** liên quan tới thay đổi. Đã thêm ca guard (khối `10)` trong `test-schemaV2.mjs`)
quét backtick trong `CREATE_TABLES_SQL`/`CREATE_VIEWS_SQL` và ghi chú SQL của `queries.js`.

**BUG-N1 — `checkQtyLimit` gọi sai kiểu, hạn mức `INV-V1` không có tác dụng ở tầng DB (có sẵn từ FEAT-21):**
`src/utils/validateQty.js` nhận **object** `{ target, produced, incomingQty, hasLimit }`, nhưng
`checkLineTarget` gọi theo **vị trí**:

```js
const limit = await checkQtyLimit(produced, qty, target, line.item_code ?? '');
```

Hệ quả: tham số đầu tiên (`{…}`) nhận `produced` (một con số ⇒ không có `.target`/`.incomingQty`
nên rơi về mặc định), 3 đối số còn lại bị bỏ qua ⇒ `incomingQty = 0` và `hasLimit = null`
⇒ **`checkQtyLimit` luôn trả `{ ok: true }`** ⇒ `INV-V1` chỉ còn được UI tự kiểm, tầng DB không chặn.

**Chưa sửa** — sửa nó là **thay đổi hành vi Cấp 3** (người đang nhập vượt hạn mức sẽ bị chặn lại,
có thể mất dữ liệu nhập tay đã có), nằm ngoài phạm vi FEAT-23 do chủ dự án chọn. Đã đánh dấu
tại chỗ bằng khối `BUG-N1` trong `queries.js`. `checkRefTarget` của FEAT-23 **không** nhân bản lỗi:
gọi đúng dạng object, và `scripts/test-schemaV2.mjs` có ca chạy `checkQtyLimit` thật để chặt lại.

**BUG-N2 — `Còn lại` lệch 0,01 với `Đã làm` khi qty có thập phân:**
`refProgressText` tính `Còn lại = target − produced` trên giá trị **thô** (`100 − 12.345 = 87.655`),
rồi mỗi số mới làm tròn khi hiển thị ⇒ ra `Đã làm 12,35/100 · Còn lại 87,66`. Người dùng cộng lại
thấy `100,01 ≠ 100` và mất lòng tin vào cả bảng số. Sửa: **tròn `produced` trước rồi mới trừ** —
ba số luôn khớp nhau. Ca test chốt lại hành vi này.

---

## 9. Kế hoạch kiểm thử

**RC chạy lại:** RC-02..06 (nhập số lượng), RC-23..31 (hạn mức `INV-V1`), RC-47..62 (sửa/xoá nhật ký),
RC-140..148 (FEAT-22).

**RC mới:**

| ID | Bước | Mong đợi |
|---|---|---|
| RC-150 | Mở thẻ `PO 2919 / 1063048GF` | 3 dòng tiến độ `0/477`, `0/159`, `0/80` (AC-RF-01) |
| RC-151 | Nhập `300` vào `D980470` | `Đã làm` ref = `300/477`, còn `177`; thẻ cha `Đã làm 300` (AC-RF-04) |
| RC-152 | Nhập `200` vào `D980470` | `Alert` chặn vượt; ref vẫn `300`; **ô nhập còn nguyên** `200` (AC-RF-02) |
| RC-153 | Nhập `159` vào `D980973` | Cho phép — đúng bằng hạn mức ref (AC-RF-03) |
| RC-154 | Nhập `1` vào `D980973` sau khi đã `159` | Chặn (hạn mức ref = 0 còn lại) (AC-RF-02) |
| RC-155 | Mở danh sách nhật ký | Dòng gắn ref hiện `· D980470`; dòng nhập bằng form gốc hiện *"chưa gắn số hiệu"* (AC-RF-06/07) |
| RC-156 | Nhập bằng form gốc rồi nhìn thẻ | Dòng *"chưa gắn số hiệu: N pcs"* (AC-RF-08) |
| RC-157 | Sửa nhật ký gắn ref `300` → `400` | Cho phép (400 ≤ 477), cảnh báo xác nhận (AC-RF-12, `INV-U1`) |
| RC-158 | Xoá nhật ký gắn ref | Ref về `0`; không còn dòng mồ côi (AC-RF-14) |
| RC-159 | Thẻ **không có** ref (mã thêm tay) | Không có khối nhập theo số hiệu; nhập bình thường (AC-RF-10) |
| RC-160 | Nhập tới mức tổng kế hoạch của thẻ | Cho phép tới đúng tổng; vượt tổng thì `queries.js` chặn (AC-RF-13) |
| RC-161 | Tắt app, mở lại | Mọi nhật ký gắn ref còn nguyên; `Σ` không đổi (AC-RF-15) |
| RC-162 | Hoàn tất đơn → tab Lịch sử | Tổng nhóm ngày **không đổi** so với trước FEAT-23 (AC-RF-15) |
| RC-163 | Nhật `12.345` vào ref có kế hoạch `100` | `Đã làm 12,35/100 · Còn lại 87,65` — cộng lại đúng 100 (BUG-N2) |
| RC-164 | Một ref có `12.345` pcs, ref khác `5.678` | Hai dòng tiến độ **cùng thứ tự** với hai dòng trong khối "Số hiệu" phía trên |

**Ca unit đã viết** (`scripts/test-refFormat.mjs`, 17 ca; `scripts/test-schemaV2.mjs`, khối `8)`+`9)`+`10)`):
`normalizeRefProgress` (số/NaN/rỗng/trùng/thiếu cột + thứ tự khớp `normalizeRefs`),
`hasRefProgress`, `refProgressText` (không âm, dấu chấm nghìn, BUG-N2),
`unattributedText`, `formatRefOverLimit` (chấp nhận `{code}` của `fail()` **và** `{ok:false}`,
im với lỗi khác); FK tổng hợp chặn ref của PO khác, `PRIMARY KEY` chặn 1 nhật ký 2 ref,
`ON DELETE CASCADE`, `Σ` ref + chưa gắn = `produced` thẻ cha, bất biến 12 PO / 76 thẻ / 25.520 pcs
trên DB sạch, và guard backtick.

---

## 10. Tiêu chí xong

- [x] AC-RF-01..15 đã triển khai (schema, `queries.js`, `ItemCard`, `EntryLogRow`, `refFormat`)
- [x] `SCHEMA_VERSION` 2 → 3, thêm **một** bảng, **không** `ALTER`
- [x] `INV-R5`..`INV-R8` kiểm bằng test trên SQLite thật
- [x] `expo lint` sạch · `tsc --noEmit` chỉ còn lỗi có sẵn (`app-tabs.web.tsx`, không liên quan)
- [x] `npm test`: **533 unit + 2 kịch bản E2E**, 0 fail
- [x] BUG-N1 (hạn mức `INV-V1` không chặn ở tầng DB) — **ghi nhận, chưa sửa**, chờ chủ dự án duyệt vì là thay đổi Cấp 3
- [x] BUG-N2 (lệch 0,01 ở `Còn lại`) — đã sửa + test
- [ ] RC-150..164 chạy tay trên máy thật (cần app build, không chạy được trong môi trường test)
- [ ] Cập nhật `SPEC-acceptance.md` / `SPEC-data.md` / `SPEC-test.md` / `SPEC-changelog.md` / `AGENTS.md`
- [ ] Mục 10.4 `SPEC-rules.md` đầy đủ