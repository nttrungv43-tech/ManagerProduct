# FEAT-12 — Bảng tổng số lượng theo từng đơn hàng PO

> **Trạng thái: ĐÃ CÀI ĐẶT (v1.5, 2026-10-01).** Chủ dự án chốt: bảng dưới `SummaryCards`; mã nhiều PO gom nhóm `Nhiều PO`; **giữ** dòng PO không có mã riêng ở `0 / 0 / 0` (AC-ITEM-24).
> **Cấp thay đổi: 1 (UI-only, hàm thuần). Không schema, không migration, không đổi chữ ký hàm.**
> Độc lập FEAT-09/10/11 — chỉ đọc dữ liệu đã có, không ghi gì.

---

## 1. Bối cảnh & mục tiêu

**Vấn đề người dùng gặp:**
- Tab Mã hàng chỉ có 4 ô tổng **toàn đơn** (`SummaryCards`: Kế hoạch / Đã sản xuất / Hoàn thành / Hàng lỗi). Người dùng hỏi *"đơn PO này còn bao nhiêu chưa làm?"* thì phải **tự cộng tay** từng thẻ mã hàng, hoặc bấm từng chip PO rồi đọc lại 4 ô tổng.
- Khi đang lọc 1 PO, 4 ô tổng **vẫn hiện số của cả đơn** ⇒ dễ đọc nhầm là số của PO đang lọc.
- Đơn có **nhiều PO** nên "tổng của PO" cần quy tắc rõ, nếu không sẽ cộng trùng.

**Kết quả mong muốn (đo được):**
- Nhìn 1 bảng là biết **từng PO** còn bao nhiêu: **Tổng** / **Đã sản xuất** / **Còn lại**.
- Tổng các dòng trong bảng **luôn khớp** tổng toàn đơn (không cộng trùng, không bỏ sót).
- Bảng tự cập nhật ngay khi nhập sản xuất, thêm/sửa/xoá mã hàng.

---

## 2. Phạm vi

### 2.1 Làm

| Nhóm | Thao tác |
|---|---|
| **Tính toán** | Hàm thuần `poSummaries(items)` → danh sách nhóm PO kèm `target / produced / remaining / defect / itemCount` |
| **Hiển thị** | Bảng mới `PoSummaryTable` ngay **dưới** `SummaryCards`, mỗi PO một dòng |
| **Quy tắc nhiều PO** | Mã thuộc >1 PO **không** cộng vào từng PO, gom vào một dòng `Nhiều PO (n mã)` |
| **Kiểm thử** | `scripts/test-poSummary.mjs` cho hàm thuần |

### 2.2 KHÔNG làm (non-goals)
- ❌ Không thay đổi 4 ô `SummaryCards` hiện có (AC-ITEM-01 giữ nguyên).
- ❌ Không thêm cột **Hàng lỗi** vào bảng PO (chỉ 3 số như yêu cầu: Tổng / Đã sản xuất / Còn lại).
- ❌ Không áp dụng cho batch `archived` / tab **Lịch sử** — bảng chỉ ở tab Mã hàng (batch `active`).
- ❌ Không cho bấm dòng để lọc PO (có thể làm sau ở FEAT riêng).
- ❌ Không lưu số liệu xuống DB — **toàn bộ là dữ liệu dẫn xuất**, tính lại từ `items` mỗi lần render.
- ❌ Không đổi chữ ký `summaryTotals` / `allPOs` / `filteredItems`.
- ❌ Không đổi bộ lọc hiện có.

### 2.3 Cấp thay đổi (§10.1 `SPEC-data.md`)

**Cấp 1 — UI-only + hàm thuần.** Không bảng/cột mới, không migration, không đổi chữ ký hàm.

---

## 3. Acceptance Criteria

| ID | Given / When / Then |
|---|---|
| **AC-ITEM-20** | Bảng tổng theo PO nằm **ngay dưới** 4 ô `SummaryCards`; 4 ô cũ **giữ nguyên** và **không** đổi số |
| **AC-ITEM-21** | Mỗi dòng hiện **PO** + 3 số: `Tổng = Σ target`, `Đã sản xuất = Σ produced`, `Còn lại = Σ max(target − produced, 0)` — cùng công thức "Còn lại" như AC-ITEM-03 |
| **AC-ITEM-22** | Mã thuộc **nhiều PO** (`po.split('+').length > 1`) **không** được cộng vào bất kỳ PO nào; tất cả gom vào **một** dòng nhãn `Nhiều PO (n mã)` — kể cả khi thứ tự PO khác nhau (`A+B` và `B+A` cùng vào nhóm) |
| **AC-ITEM-23** | **Σ cột "Tổng" của mọi dòng == số "Kế hoạch" ở `SummaryCards`** — luôn đúng, không cộng trùng, không bỏ sót |
| **AC-ITEM-24** | Có dòng cho **mọi PO trong `allPOs()`**, kể cả PO không có mã nào thuộc riêng (hiện `0 / 0 / 0`) ⇒ bảng khớp đúng chip lọc PO (AC-ITEM-13) |
| **AC-ITEM-25** | Bảng **không** đổi theo ô tìm kiếm, chip PO, lọc trạng thái — luôn tính trên **toàn bộ** `items`, giống cách `SummaryCards` đang làm (AC-ITEM-01). Bảng là **tham chiếu ổn định** của cả đơn |
| **AC-ITEM-26** | Dòng sắp theo `Tổng` **giảm dần**; bằng nhau thì tên PO **tăng dần** (ổn định, không nhảy vị trí). Số dùng `toLocaleString()` như `SummaryCards` |
| **AC-ITEM-27** | Bảng tự cập nhật ngay sau: thêm nhật ký (AC-ITEM-06), thêm/sửa/xoá mã hàng (FEAT-10). `items` rỗng ⇒ hiện `Chưa có mã hàng.` |
| **AC-ITEM-28** | `target = 0` không làm vỡ bảng: `Tổng = 0`, `Còn lại = 0`, **không** chia/phép trừ |
| **AC-ITEM-29** | Chỉ dùng token `theme`; không hard-code màu (ngoại lệ chữ trắng trên nền `accent`/`good`/`bad`) |

> **Vì sao tiền tố `AC-ITEM-`?** Đây là tính năng **mới** của tab Mã hàng, không mở rộng nhóm `AC-EDIT-` của FEAT-10 — nên đánh số tiếp `AC-ITEM-20..29` cho đúng quy ước `AC-<tab>-<số>`.

---

## 4. Quy tắc tính (đặc tả hành vi)

Cho mỗi dòng `it` trong `items`:

```
rõ ràng:  it.po.split('+').length === 1   →  cộng target/produced vào nhóm it.po
nhiều PO: it.po.split('+').length >  1    →  KHÔNG cộng vào PO nào, gom vào nhóm NHIỀU_PO
```

Nhóm `NHIỀU_PO` có nhãn hiển thị: `Nhiều PO ({itemCount} mã)`.
Nhóm PO thường có nhãn: chính chuỗi PO đó (vd `2600189`).

Sau khi gom, mỗi nhóm tính:
- `target = Σ it.target`
- `produced = Σ it.produced`
- `remaining = Σ max(it.target − it.produced, 0)`
- `defect = Σ it.defect` (tính sẵn cho tiện, **chưa hiển thị** — non-goal)
- `itemCount = số mã trong nhóm`
- `pct = target > 0 ? round(produced / target * 1000) / 10 : 0`

**Ví dụ với dữ liệu seed hiện tại** (dùng làm chuẩn kiểm thử):

| Nhóm | Mã | Tổng | Đã SX | Còn lại |
|---|---|---|---|---|
| `2600168` | 0 | 0 | 0 | 0 |
| `2600189` | 3 | 1.980 | 0 | 1.980 |
| `Nhiều PO (5 mã)` | 5 | 6.050 | 0 | 6.050 |
| **Tổng** | **8** | **8.030** | **0** | **8.030** |

→ khớp `INV-D1` (8.030) và AC-ITEM-23. Cột PO `2600168` có 0 mã riêng vì cả 5 mã của nó đều thuộc nhiều PO — **đây là hành vi đúng theo AC-ITEM-22**, không phải lỗi.

---

## 5. Ảnh hưởng dữ liệu

| Mục | Kết luận |
|---|---|
| Bảng/cột mới | **Không** |
| Migration | **Không** (`user_version` giữ nguyên 2) |
| Nguồn dữ liệu | `items.ntk, items.po, items.target` + `produced`/`defect` đã tính sẵn bởi `fetchItemsWithStats` |
| Ghi DB | **Không** — thuần dữ liệu dẫn xuất, tính lại mỗi lần render |
| Dữ liệu cũ | **Không ảnh hưởng** — chỉ đọc |

---

## 6. Kế hoạch file

| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `src/utils/poSummary.js` | 🟢 **mới** | **tạo** | Hàm thuần `poSummaries()` + `MULTI_PO_LABEL`, `poRowLabel()`. Đặt ở `utils/` (không phải store) để **test được bằng `node`** — cùng cách `validateQty.js`, `palletKey.js`, `deleteItem.js` |
| `src/components/PoSummaryTable.js` | 🟢 **mới** | **tạo** | Chỉ nhận `summaries` + `theme`, không tự truy vấn |
| `src/screens/ItemsScreen.js` | 🟡 | **thêm** 1 dòng render + `poSummaries(items)` | Nơi hiển thị, dưới `SummaryCards` |
| `scripts/test-poSummary.mjs` | 🟢 **mới** | **tạo** | Unit test hàm thuần, không cần Expo/SQLite |
| `package.json` | 🟢 | thêm `test:po` vào `scripts` | Chạy bằng `npm test` |
| `specs/*` | 🟢 | cập nhật | Đồng bộ đặc tả |

**Không chạm:** `db/schema.js` 🔒 · `db/queries.js` 🔒 · `store/useAppStore.js` 🔒 (chỉ **được thêm** export nếu cần — không cần) · `data/seed.js` 🔒 · `src/app/**` 🔒 · `SummaryCards.js` (giữ nguyên AC-ITEM-01)

---

## 7. Thiết kế

### 7.1 Luồng dữ liệu

```
store.items  (đã có sẵn: target + produced + defect)
   └─> poSummaries(items, allPOs(items))   🟢 hàm thuần, trong useMemo
        (allPOs để mọi PO của đơn đều có dòng — AC-ITEM-24)
        └─> <PoSummaryTable summaries={...} theme={theme} />   🟢 chỉ render
```

Không có action mới, không ghi DB, không bảng mới.

### 7.2 Chữ ký mới (bổ sung, không phá)

```js
// src/utils/poSummary.js
export const MULTI_PO_LABEL = 'Nhiều PO';
export function poRowLabel(group);                  // '2600189' | 'Nhiều PO (5 mã)'
export function poSummaries(items, allPos);         // -> PoSummary[] (đã sắp xếp)
// PoSummary = { key, label, isMulti, itemCount, target, produced, remaining, defect, pct }
// items = mảng rỗng -> []
// allPos = allPOs(items); BỎ TRỐNG thì hàm tự tách từ items theo đúng quy tắc của allPOs
```

```jsx
// src/components/PoSummaryTable.js
<PoSummaryTable summaries={poSummaries(items, allPOs(items))} theme={theme} />
```

### 7.3 Văn bản UI (tiếng Việt, INV-U2)

| Vị trí | Nhãn |
|---|---|
| Tiêu đề bảng | `Tổng theo PO` |
| Tên cột | `PO` · `Tổng` · `Đã sản xuất` · `Còn lại` |
| Dòng nhiều PO | `Nhiều PO (n mã)` |
| Không có dữ liệu | `Chưa có mã hàng.` |

---

## 8. Rủi ro hồi quy

| AC/INV bị ảnh hưởng | Cách bảo vệ |
|---|---|
| **AC-ITEM-01** (4 ô tổng toàn cục) | Không sửa `SummaryCards`; FEAT-12 chỉ **thêm** bảng bên dưới (AC-ITEM-20) |
| **AC-ITEM-13** (chip lọc PO) | Bảng có dòng cho **mọi** PO của `allPOs()` (AC-ITEM-24) ⇒ hai danh sách không lệch nhau |
| **INV-D1** (tổng seed = 8.030) | AC-ITEM-23 bắt buộc Σ dòng == tổng toàn cục; test dùng đúng bộ số seed |
| **Cộng trùng khi mã nhiều PO** | Quy tắc AC-ITEM-22 + dòng `Nhiều PO`; test có ca 2 mã cùng nhiều PO |
| **Rủi ro mới: PO không có mã riêng hiện 0/0/0** | Đã chốt ở AC-ITEM-24 là hành vi **đúng**; mô tả rõ trong §4 để không ai "sửa nhầm" thành cộng trùng |
| **`produced`/`defect` có thể `null`** | `fetchItemsWithStats` đã ép về `0`; `poSummaries` vẫn ép `|| 0` để an toàn khi gọi từ nơi khác |
| **Hiệu năng** | 8–vài chục dòng, tính trong `useMemo`; không truy vấn DB thêm |

---

## 9. Kế hoạch kiểm thử

**RC phải chạy lại:** `RC-01`, `RC-02`, `RC-IMP-02`, `RC-IMP-05`, `RC-15`, `RC-20` · toàn bộ `AC-ITEM-01..19` và `AC-EDIT-01..36`

**RC mới:**

| RC | Kịch bản |
|---|---|
| **RC-55** | Tab Mã hàng → thấy bảng `Tổng theo PO` ngay dưới 4 ô, có 3 dòng: `2600168` = 0, `2600189` = 1.980, `Nhiều PO (5 mã)` = 6.050; **tổng khớp** 8.030 với ô Kế hoạch |
| **RC-56** | Nhập 300 pcs cho 1 mã của `2600189` → dòng đó tăng `Đã sản xuất` = 300, `Còn lại` = 1.680, **ngay lập tức** |
| **RC-57** | Lọc PO = `2600189` → bảng **không đổi** (vẫn 3 dòng); danh sách thẻ chỉ còn 3 mã |
| **RC-58** | Thêm 1 mã hàng mới thuộc PO `2600168` → xuất hiện dòng `2600168` có số liệu riêng, `Nhiều PO` **không** đổi |
| **RC-59** | Thêm 1 mã hàng `po = '2600168+2600189'` → dòng `Nhiều PO` tăng lên **6 mã**; 2 dòng PO **không** đổi |
| **RC-60** | Sửa số lượng của 1 mã (FEAT-10) → bảng cập nhật ngay |
| **RC-61** | Xoá 1 mã hàng (FEAT-11) → bảng cập nhật ngay; nếu nhóm rỗng thì dòng đó về 0 |
| **RC-62** | Sau `finishOrder` → batch mới từ seed → bảng về đúng số seed; batch `archived` **không** bị sửa (INV-B2) |

**Unit test** (`scripts/test-poSummary.mjs`): gom nhóm, quy tắc nhiều PO, `remaining` âm → 0, `target = 0`, rỗng, sắp xếp, Σ khớp tổng toàn cục, 2 mã cùng nhiều PO.

---

## 10. Tiêu chí xong

- [x] Mục 10.4 `SPEC-rules.md`: AC-ITEM-20..29 ✅ · `INV-D6` có trong §8
- [x] `poSummaries()` trả đúng nhóm, đúng quy tắc nhiều PO, đúng sắp xếp
- [x] Bảng hiển thị đúng 3 số mỗi dòng, đúng nhãn, chỉ dùng token `theme`
- [x] Σ dòng == tổng toàn cục (đã kiểm bằng test)
- [x] 4 ô `SummaryCards` **không** đổi
- [x] `npm test` — 0 lỗi (không hỏng ca cũ)
- [x] `npx expo lint` — 0 lỗi
- [x] `npx tsc --noEmit` — 0 lỗi mới
- [x] `npx expo export --platform ios` — bundle sạch
- [ ] ⛔ RC-55..62 **chưa chạy được** — cần máy/emulator thật, không có trong môi trường code-only. **Phải chạy trước khi phát hành.**
- [x] `SPEC-changelog.md` + `SPEC-reference.md` + `SPEC.md` cập nhật

---

## 11. Breaking changes

**Không có breaking change.** Lý do:

1. **Schema**: không bảng/cột nào thêm, không migration, `user_version` giữ nguyên `2`.
2. **Chữ ký**: `poSummaries`, `PoSummaryTable` là **thêm mới**. `summaryTotals` / `allPOs` / `filteredItems` / `ItemCard` / `SummaryCards` **không đổi**.
3. **Hành vi cũ**: `SummaryCards`, bộ lọc, thẻ mã hàng, nhật ký **giữ nguyên**. Bảng mới nằm **bên dưới**, không đè lên gì.
4. **Dữ liệu**: chỉ đọc, không ghi, không migrate.
5. **Rủi ro duy nhất** là **bố cục**: thêm chiều cao, danh sách phải cuộn thêm. Đã giới hạn ở 1 bảng nhỏ, không có tương tác.

> ⚠️ Điểm cần chủ dự án xác nhận khi duyệt: dòng PO không có mã riêng hiện `0 / 0 / 0` (AC-ITEM-24). Hợp lý theo AC-ITEM-23 nhưng nhìn dễ gây nhầm — nếu muốn **ẩn** dòng 0 thì sửa AC-ITEM-24 và `poSummaries` chỉ còn trả về nhóm có mã, nhưng bảng sẽ **lệch** với chip lọc PO.