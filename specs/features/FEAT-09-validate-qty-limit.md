# FEAT-09 — Kiểm tra số lượng không vượt đơn đặt hàng

> **Trạng thái: ĐÃ CÀI ĐẶT (v1.4, 2026-09-30).** Chủ dự án cho phép triển khai với Q1–Q5 theo mặc định đề xuất ở §6.1.
> Cấp thay đổi: **1** (thêm mới) — nhưng **sửa hành vi ghi dữ liệu** đã có ⇒ đã được chỉ đạo Cấp 3 cho phần "chặn ghi" (xem §2 và §7).

---

## 1. Bối cảnh & mục tiêu

**Vấn đề người dùng gặp:**
- Gõ nhầm số lượng (ví dụ `1000` thay vì `100`) → `Đã làm` vượt `Kế hoạch`, phần trăm > 100%, không phát hiện sai cho tới khi đối chiếu cuối chu kỳ.
- Nhập tay số không phải số nguyên, số âm, hoặc chuỗi rác → ghi vào DB gây số liệu sai.
- Không có cảnh báo nào ở thời điểm nhập; lỗi chỉ lộ ra khi xem tổng quan/lịch sử.

**Kết quả mong muốn (đo được):**
- Không tồn tại trạng thái ghi mới nào làm `SUM(entries.qty)` cho một mã hàng vượt `items.target` trong batch `active`.
- Người dùng nhập quá hạn mức **bị báo lỗi ngay tại chỗ** (Alert tiếng Việt), dữ liệu không đổi.
- Mọi giá trị không hợp lệ về kiểu số bị chặn ở cả 3 đường ghi: nhập tay, sửa nhật ký, import JSON.

---

## 2. Phạm vi

**Làm:**
1. Kiểm tra số lượng nhập vào không vượt `items.target` (đơn đặt hàng) cho từng mã hàng, **tính riêng trong batch `active`**.
2. Chuẩn hoá & kiểm tra dữ liệu số: chỉ nhận số nguyên ≥ 0; bỏ khoảng trắng, từ chối rác/NaN/âm/số thực.
3. Áp dụng cho 3 đường ghi: **thêm nhật ký** (thủ công), **sửa nhật ký**, **import JSON entries**.
4. Báo lỗi bằng `Alert.alert` (tiếng Việt, INV-U2) + giữ nguyên dữ liệu.
5. Kiểm tra lại ở tầng `queries.js` (phòng thủ sâu) trước khi `INSERT`/`UPDATE`.

**KHÔNG làm (non-goals):**
- ❌ Không tự ý cắt bớt (`clamp`) số lượng quá hạn mức — chỉ **từ chối** và báo lỗi.
- ❌ Không sửa/xoá các dòng `entries` đã tồn tại trong DB (kể cả dữ liệu cũ đã vượt hạn mức).
- ❌ Không thêm cột lưu hạn mức riêng (dùng `items.target` làm nguồn duy nhất).
- ❌ Không kiểm tra `defect_qty` (xem quyết định Q2 ở §6.1).
- ❌ Không chặn thao tác "Hoàn tất đơn hàng" (vẫn cho phép, kể cả khi tồn đọng).
- ❌ Không có cờ "ghi đè/bỏ qua kiểm tra" ở v1 (xem §7 rủi ro).

**Cấp thay đổi:** Cấp 1 (thêm hàm mới, thêm UI cảnh báo) **+ Cấp 3** cho phần *chặn ghi* vì nó sửa hành vi của `addEntry`/`updateEntry` đang tồn tại (theo `SPEC-data.md` §10.1: "Sửa hành vi đã có").

---

## 3. Acceptance Criteria

| ID | Given | When | Then |
|---|---|---|---|
| **AC-VAL-01** | Mã hàng `target = 1000`, đã làm `900` | Nhập `qty = 200` rồi bấm "Thêm" | **Alert lỗi** "vượt đơn đặt hàng" (nêu rõ `Kế hoạch 1000`, `Đã làm 900`, `Nhập 200`, `Tối đa còn có thể nhập 100`). **Không** ghi DB, ô nhập **không** bị xoá, số liệu thẻ **không** đổi |
| **AC-VAL-02** | `target = 1000`, đã làm `900` | Nhập `qty = 100` | Ghi bình thường → `Đã làm 1000`, `Còn lại 0`, `100%` |
| **AC-VAL-03** | `target = 1000`, đã làm `1000` | Nhập `qty = 1` | Chặn + Alert (còn lại = 0) |
| **AC-VAL-04** | Dòng nhật ký cũ `qty = 50`, `target = 1000`, đã làm `900` (gồm 50) | Sửa dòng đó thành `qty = 200` | Chặn + Alert. Tính `đã làm − qtyCũ + qtyMới = 1050 > 1000` ⇒ không lưu, form sửa **vẫn mở** để người dùng sửa tiếp |
| **AC-VAL-05** | Cùng AC-VAL-04 nhưng sửa thành `qty = 100` | Lưu | Cho phép (`900 − 50 + 100 = 950 ≤ 1000`) |
| **AC-VAL-06** | `target = 1000`, đã làm `1000` | Sửa dòng `qty = 50` → `qty = 20` | Cho phép (giảm). Không được chặn vi "đã đủ" |
| **AC-VAL-07** | Ô nhập chứa `" 120 "`, `"1.200"`, `"1 200"` | Bấm "Thêm" | Chuẩn hoá về `1200` (bỏ khoảng trắng, coi dấu `.`/` ` là phân tách nghìn) — chỉ khi giá trị là số nguyên hợp lệ |
| **AC-VAL-08** | Ô nhập chứa `"abc"`, `""`, `"12abc"`, `"-5"`, `"1.5"`, `"1e3"` | Bấm "Thêm" | Không ghi DB. Alert hoặc bỏ qua im lặng theo AC-ITEM-05 (`qty≤0 && defectQty≤0` → không làm gì); với giá trị không parse được được coi như không hợp lệ |
| **AC-VAL-09** | `target = 0` (item không có đơn đặt hàng) | Nhập bất kỳ số lượng nào | **Không** áp dụng giới hạn (xem Q3 §6.1) — ghi bình thường |
| **AC-VAL-10** | File JSON có 5 entry cho cùng mã hàng, `target = 1000`, đã làm `800` | Import | Nhập tuần tự: `150` ok (950), `150` ok (1100?) — cụ thể: mỗi entry được kiểm với tổng **tích luỹ đang chạy**; entry làm vượt `target` bị **bỏ qua**, đếm vào `skippedOver`; Alert kết quả báo rõ "Vượt đơn đặt hàng: N mục" |
| **AC-VAL-11** | Import file, `ntk` không có trong `items` | Import | Vẫn bỏ qua như AC-IMP-04 (không tính vào `skippedOver`) |
| **AC-VAL-12** | Mọi đường ghi (tay/sửa/import) | — | **Không** đường nào tạo ra `SUM(qty) > target`; kiểm tra ở `queries.js` là lớp phòng thủ cuối, không chỉ ở UI |
| **AC-VAL-13** | Item thuộc batch `archived` | — | Không sửa được từ UI (INV-B2) ⇒ không phát sinh nhánh kiểm tra mới |
| **AC-VAL-14** | DB cũ đã có `SUM(qty) > target` (do nhập tay trước khi có tính năng) | Mở app | App **không** sửa/xoá dữ liệu cũ. `Đã làm` hiển thị như cũ, `Còn lại = 0`, `%` có thể > 100. Mọi lần ghi **mới** đều bị chặn trừ khi làm giảm `qty` |

---

## 4. Ảnh hưởng dữ liệu

- **Bảng/cột mới:** ❌ Không.
- **Migration:** ❌ Không. `PRAGMA user_version` **không** tăng.
- **Nguồn kiểm tra:** `items.target` (đơn đặt hàng) và `SUM(entries.qty)` trong cùng `order_batch_id`. Cả hai cột đã có sẵn và đã có index `idx_entries_ntk(ntk, order_batch_id)`.
- **Dữ liệu cũ:** giữ nguyên 100%. Dữ liệu đã vượt hạn mức **không** bị tự sửa (xem AC-VAL-14).
- **Tính nhất quán:** nếu `importItemsFromJson` (INSERT OR REPLACE) nạp `target` mới nhỏ hơn `SUM(qty)` hiện có ⇒ DB rơi vào trạng thái "vượt" (được chấp nhận, xem §7 R3).

---

## 5. Kế hoạch file

| File | Mức bảo vệ (`SPEC-rules.md` §4.2) | Hành động | Lý do |
|---|---|---|---|
| `src/utils/validateQty.js` | 🟢 file mới | **thêm mới** | Logic thuần: `parseQty`, `checkQtyLimit`, `formatQtyError`. Test được không cần DB (theo `SPEC-test.md` §11.2) |
| `src/db/queries.js` | 🔒 (chữ ký) | **thêm** hàm `getItemTargetUsage(batchId, ntk, excludeEntryId?)`; **bổ sung** kiểm tra trong `addEntry`/`updateEntry`/`importEntriesFromJson` — không đổi chữ ký | Lớp phòng thủ cuối; tuân thủ quy tắc vàng #6 (mọi ghi dữ liệu qua queries.js) |
| `src/store/useAppStore.js` | 🔒 (tên action) | **sửa hành vi**: `addEntry`/`updateEntry` trả về `{ok, error?}` thay vì `undefined` — không đổi tên/tham số | Cho UI biết kết quả mà không phải bắt exception |
| `src/components/ItemCard.js` | 🟡 | **sửa**: `handleAdd` và `handleEditSave` kiểm tra trước khi gọi store; hiện `Alert` lỗi; giữ nguyên dữ liệu form khi lỗi | Nơi duy nhất người dùng gõ số lượng |
| `src/components/ImportJsonButton.js` | 🟢 | **sửa**: Alert kết quả import có thêm dòng số mục bị bỏ qua vì vượt hạn mức | Báo lỗi tới người dùng theo yêu cầu |
| `src/components/EntryLogRow.js` | 🟢 | không đổi | — |
| `src/db/schema.js`, `src/db/index.js`, `src/data/seed.js` | 🔒 | **không đụng** | Không có migration |
| `src/screens/*`, `src/app/**` | 🟡 / 🔒 | **không đụng** | Business logic không nằm trong route (quy tắc vàng #5) |
| `specs/SPEC-data.md`, `SPEC-api.md`, `SPEC-acceptance.md`, `SPEC-rules.md`, `SPEC-reference.md`, `SPEC-test.md`, `SPEC-changelog.md` | 🟢 | **sửa** | Đồng bộ spec (đã làm trong phiên này) |

---

## 6. Thiết kế

### 6.1 Các quyết định cần chủ dự án xác nhận

| ID | Câu hỏi | Đề xuất mặc định |
|---|---|---|
| **Q1** | `defect_qty` có tính vào hạn mức không? | **Không.** `defect_qty` là hàng lỗi *nằm trong* tổng đã sản xuất; tính cả sẽ chặn oan. Hạn mức chỉ so với `qty`. |
| **Q2** | `target = 0` hoặc `target` null nghĩa là gì? | **Không áp dụng giới hạn** (coi như "không xác định"). Lý do: `importItemsFromJson` có thể tạo item với `target` bất thường; chặn sẽ khoá người dùng khỏi chính đơn của mình. Cần `hasLimit` cờ riêng. |
| **Q3** | So sánh dùng `SUM(qty)` hay `SUM(qty) − SUM(defect_qty)`? | `SUM(qty)`. Khớp trực tiếp với `produced` mà `fetchItemsWithStats` đang trả về và với `Còn lại` trên UI (AC-ITEM-03) — không tạo hai nghĩa khác nhau cho cùng một con số. |
| **Q4** | Cho phép ghi khi `target` đã đạt mà người dùng **giảm** số của dòng cũ? | **Có** (AC-VAL-06). Chặn sẽ khiến người dùng không sửa được nhật ký sai đã nhập. |
| **Q5** | Có cờ "bỏ qua kiểm tra" không? | **Không** ở v1. Xem R2 §7. |

### 6.2 Luồng dữ liệu

```
UI (ItemCard / ImportJsonButton)
  └─ parse + validate thuần (utils/validateQty.js)        ← phản hồi tức thì
      └─ store action: addEntry / updateEntry
          └─ queries.js: getItemTargetUsage() + re-check   ← phòng thủ sâu
              └─ SQLite
```

`importEntriesFromJson` chạy trong `withTransactionAsync` sẵn có, kiểm tra **tích luỹ** trong chính transaction đó (không dựa vào `getItemTargetUsage` để tránh đọc trạng thái chưa commit).

### 6.3 Hàm/props mới

```js
// src/utils/validateQty.js  (🟢 mới, hàm thuần)
export function parseQty(raw);        // → number | null   (null = không hợp lệ)
export function checkQtyLimit({ target, produced, incomingQty, hasLimit });
//   → { ok: true } | { ok: false, code: 'OVER_TARGET', target, produced, incomingQty, remaining, overBy }
export function formatQtyError(result, ntk); // → string tiếng Việt cho Alert

// src/db/queries.js  (🔒 — chỉ THÊM, không đổi chữ ký)
export async function getItemTargetUsage(batchId, ntk, excludeEntryId = null);
//   → { target, produced, remaining, hasLimit }   (produced đã trừ excludeEntryId)

// Hàm hiện có: giữ nguyên tham số, đổi hành vi trả về
// addEntry(batchId, ntk, payload)   → { ok: true } | { ok: false, error: {code, ...} }
// updateEntry(entryId, payload)     → { ok: true } | { ok: false, error: {code, ...} }
// importEntriesFromJson(batchId, e)→ { imported, skipped, skippedOver }   (thêm khoá, không bỏ khoá cũ)
```

`ItemCard` **không** cần prop mới: đã có `item.target` / `item.produced` từ `fetchItemsWithStats`. Kiểm tra chính xác vẫn do `queries.js` quyết định → không có trạng thái lệch.

### 6.4 Văn bản UI (tiếng Việt, INV-U2)

| Ngữ cảnh | Nhãn |
|---|---|
| Alert thêm/sửa vượt hạn mức | Tiêu đề `Vượt đơn đặt hàng` — `Mã {ntk}: kế hoạch {target}, đã làm {produced}. Chỉ còn nhập tối đa {remaining} (bạn nhập {incomingQty}, vượt {overBy}).` |
| Alert giá trị không hợp lệ | Tiêu đề `Số lượng không hợp lệ` — `Chỉ nhập số nguyên không âm.` |
| Alert kết quả import | Thêm dòng `Vượt đơn đặt hàng: {skippedOver} mục bị bỏ qua.` vào Alert `Hoàn tất` |

---

## 7. Rủi ro hồi quy

| ID | Rủi ro | AC/INV bị ảnh hưởng | Cách bảo vệ |
|---|---|---|---|
| **R1** | Chặn ghi làm mất nhật ký người dùng vô tình chưa bấm lưu | AC-ITEM-05, AC-ITEM-11 | Với lỗi: **không** gọi `onAddEntry`/`onUpdateEntry`, **không** xoá ô nhập, **không** đóng form sửa. Chỉ hiện Alert |
| **R2** | Người dùng thật sự cần ghi vượt hạn mức (đơn bổ sung, kế hoạch sai) | — | V1 không có override. Nếu chủ dự án cần, thêm `force` **optional** ở v2 (không đụng AC-VAL-01) |
| **R3** | `importItemsFromJson` nạp `target` mới nhỏ hơn `SUM(qty)` hiện có | AC-IMP-08 | Chấp nhận (AC-VAL-14). Cân nhắc cảnh báo ở v2 |
| **R4** | Bỏ sót đường ghi → lọt giá trị quá hạn mức | INV-V1 | Kiểm tra ở `queries.js` cho **mọi** `INSERT`/`UPDATE` vào `entries`; AC-VAL-12 |
| **R5** | Đọc `produced` từ cache UI lệch DB | INV-V1 | `queries.js` luôn tính lại từ SQLite ngay trước ghi, không tin state UI |
| **R6** | AC-ITEM-05 hiện nói "không làm gì (không lỗi)" khi `qty≤0 && defectQty≤0` | AC-ITEM-05 | Giữ nguyên nguyên văn cho trường hợp đó; chỉ thêm nhánh Alert cho **giá trị không parse được** (AC-VAL-08) — cần chủ dự án đồng ý sửa câu chữ AC-ITEM-05 |
| **R7** | Sửa hành vi `addEntry`/`updateEntry` (trước: luôn ghi) | Quy tắc vàng #3 (chữ ký) | Chữ ký **không** đổi; chỉ thêm giá trị trả về. Đã ghi rõ trong `SPEC-api.md` |

---

## 8. Kế hoạch kiểm thử

**RC cũ phải chạy lại:** RC-01, RC-02, RC-03, RC-04, RC-05, RC-06, RC-20, RC-22 (toàn bộ mục Mã hàng + bền vững dữ liệu). **RC-11, RC-12** (lịch sử) vì đường ghi thay đổi.

**RC mới:**

| ID | Bước | Kết quả mong đợi |
|---|---|---|
| **RC-23** | Mã `106160` (`target = 1000`): nhập `900` → Thêm | Đã làm `900`, `Còn lại 100` |
| **RC-24** | Nhập `200` → Thêm | Alert `Vượt đơn hàng`; Đã làm vẫn `900`; ô nhập **còn nguyên** `200` |
| **RC-25** | Sửa ô thành `100` → Thêm | Đã làm `1000`, `Còn lại 0`, `100%` |
| **RC-26** | Nhập `1` → Thêm | Alert chặn (AC-VAL-03) |
| **RC-27** | Mở nhật ký, sửa dòng `900` → `1200` → Lưu | Alert chặn; form sửa **vẫn mở**; dòng vẫn `900` |
| **RC-28** | Sửa dòng `900` → `800` → Lưu → Xác nhận | Đã làm `900` (giữ nguyên tổng) |
| **RC-29** | Nhập `abc`, `-5`, `1.5` lần lượt | Không ghi; đúng thông báo theo AC-VAL-08 |
| **RC-30** | Import `sample-import.json` vượt hạn mức | Alert kết quả có dòng "Vượt đơn đặt hàng: N mục bị bỏ qua" |
| **RC-31** | Tắt app, mở lại, kiểm tra số liệu | Nguyên vẹn; `SUM(qty) ≤ target` |

**Unit test mới (`utils/validateQty.js`):**

| Hàm | Ca bắt buộc |
|---|---|
| `parseQty` | `'120'→120`; `' 120 '→120`; `'1.200'→1200`; `'1 200'→1200`; `''→null`; `'abc'→null`; `'12abc'→null`; `'-5'→null`; `'1.5'→null`; `'1e3'→null` |
| `checkQtyLimit` | `{hasLimit:false}` → luôn `ok`; `produced+incoming === target` → `ok`; `> target` → `OVER_TARGET` với `remaining=0`, `overBy` đúng; `incoming=0` → `ok`; `target=0, hasLimit=false` → `ok` |
| `formatQtyLimitError` | Chuỗi có đủ `ntk`, `target`, `produced`, `remaining`, `overBy`; tiếng Việt có dấu |

---

## 9. Tiêu chí xong

- [x] Toàn bộ mục 10.4 `SPEC-rules.md` — AC-ITEM-17/18/19, AC-IMP-13 ✅; không phá quy tắc vàng; không đổi chữ ký; `@/` imports; bundle production sạch (1187 modules); `npm test` 44/44; spec + changelog đã cập nhật
- [x] Q1–Q5 (§6.1) áp dụng theo mặc định đề xuất
- [x] AC-ITEM-05 giữ nguyên nguyên văn: ô trống/`0` vẫn "không làm gì, không lỗi" (R6 không phát sinh)
- [ ] **Còn lại:** checklist hồi quy thủ công RC-23..31 + RC-01..06, RC-11/12, RC-20, RC-22 (xem `tasks.md` Bước 14.5) — cần chạy trên máy thật/simulator
