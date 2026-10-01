# FEAT-11 — Nút xoá mã hàng trực tiếp trên thẻ (tab Mã hàng)

> **Trạng thái: ĐÃ CÀI ĐẶT (v1.5, 2026-09-30).** Chủ dự án duyệt phương án **nút xoá trực tiếp trên thẻ**; giữ nguyên nút xoá trong `ItemEditSheet`; **không** làm xoá hàng loạt, **không** làm undo.
> **Cấp thay đổi: 1 (UI-only, không đổi schema, không migration).**
> Tiếp nối FEAT-10: xoá mã hàng **đã có đầy đủ nghiệp vụ**, FEAT-11 chỉ rút ngắn đường đi tới nó.
> Phụ thuộc: FEAT-10 (`removeItem`, `ItemEditSheet`).

---

## 1. Bối cảnh & mục tiêu

**Vấn đề người dùng gặp:**
- FEAT-10 đã cho xoá mã hàng, nhưng nút xoá **nằm trong sheet sửa** (`ItemEditSheet`). Muốn xoá 1 mã phải: bấm **✎ Sửa mã hàng & số lượng** → cuộn xuống đáy sheet → bấm **Xoá mã hàng** → bấm **Xoá** trong `Alert`. **4 chạm cho một thao tác phá huỷ dữ liệu**, và bước đầu tiên lại là "Sửa" — dễ bấm nhầm.
- Người dùng không biết mình đang ở luồng sửa chứ không phải xoá.

**Kết quả mong muốn (đo được):**
- Xoá 1 mã hàng trong **1 chạm** (bấm nút trên thẻ) + 1 chạm xác nhận = **2 chạm**.
- Nhãn nút **nói đúng việc**: "✕ Xoá mã hàng" (không phải "Sửa").
- Vẫn giữ **đầy đủ chặn an toàn** của FEAT-10: mã có nhật ký → chặn; mã đang trong kiện → chặn; batch `archived` → ẩn nút.

---

## 2. Phạm vi

### 2.1 Làm

| Nhóm | Thao tác |
|---|---|
| **UI** | Nút `✕ Xoá mã hàng` trên `ItemCard`, cạnh nút `✎ Sửa` hiện có |
| **Tái sử dụng** | Tách `Alert` xác nhận + hàm map lỗi ra khỏi `ItemEditSheet` để **một** nguồn sự thật, dùng chung cho sheet và thẻ |
| **Chặn an toàn** | Nút chỉ hiện khi có callback ⇒ mặc định an toàn (không truyền = không hiện) |
| **Bất biến** | Bổ sung `INV-V3`: thao tác xoá/sửa phải nhắm batch `active` |

### 2.2 KHÔNG làm (non-goals)
- ❌ Không đổi nghiệp vụ xoá (`removeItem` giữ nguyên chữ ký, cùng hai lớp chặn).
- ❌ Không xoá hàng loạt nhiều mã.
- ❌ Không thêm "hoàn tác" (undo) — cần cơ chế khôi phục row, cấp thay đổi 2.
- ❌ Không đổi bố cục form `ItemEditSheet` (vẫn giữ nút xoá ở đáy sheet cho người đã quen).
- ❌ Không thêm trạng thái toàn cục mới; chỉ prop cục bộ.
- ❌ Không thêm thư viện, không đổi `src/app/**`.

### 2.3 Cấp thay đổi (§10.1 `SPEC-data.md`)

**Cấp 1 — UI-only.** Không bảng/cột mới, không migration, không đổi chữ ký hàm. Rủi ro thấp.

---

## 3. Acceptance Criteria

| ID | Given / When / Then |
|---|---|
| **AC-EDIT-26** | Tab Mã hàng, mỗi thẻ mã hàng có nút `✕ Xoá mã hàng` nằm cạnh nút `✎ Sửa` hiện có |
| **AC-EDIT-27** | Bấm nút xoá → `Alert.alert` xác nhận **hiện tên mã** (`Xoá mã 106160?`) → bấm **Xoá** mới thực sự xoá (INV-U1) |
| **AC-EDIT-28** | Bấm **Huỷ** trong `Alert` → **không** xoá, `dataVersion` **không** tăng, danh sách không đổi |
| **AC-EDIT-29** | Mã **đã có nhật ký** → xoá bị chặn, `Alert` báo `ITEM_HAS_ENTRIES` (giữ nguyên AC-EDIT-09) |
| **AC-EDIT-30** | Mã **đang có trong kiện** → xoá bị chặn, `Alert` báo số kiện còn chứa (giữ nguyên AC-EDIT-10, INV-V2) |
| **AC-EDIT-31** | Xoá thành công → mã biến mất khỏi danh sách, `total_target` batch giảm đúng bằng `target` bị xoá |
| **AC-EDIT-32** | Batch `archived` → **không** hiện nút xoá (giữ nguyên AC-EDIT-13, INV-B2) |
| **AC-EDIT-33** | Văn bản nút xoá trên thẻ và nút xoá trong sheet **giống hệt nhau** (một hàm dùng chung) |
| **AC-EDIT-34** | Nút xoá trên thẻ dùng **đúng** bản dịch lỗi như sheet: `ITEM_EXISTS`/`ITEM_NOT_FOUND`/`ITEM_HAS_ENTRIES`/`ITEM_IN_PALLETS` |
| **AC-EDIT-35** | `ItemCard` **không** truyền `onDeleteItem` → nút xoá không hiện (mặc định an toàn) |
| **AC-EDIT-36** | Lọc PO / tìm kiếm / lọc trạng thái vẫn hoạt động sau khi xoá (không lệch danh sách) |

> **Vì sao dùng tiếp tiền tố `AC-EDIT-` chứ không phải `AC-ITEM-`?** AC nằm trong tab Mã hàng (`AC-ITEM-*`) nhưng là **mở rộng của nhóm thêm/sửa/xoá của FEAT-10** (`AC-EDIT-*`). Giữ cùng nhóm để đọc FEAT-10 → FEAT-11 liền mạch. Quy ước `AC-<tab>-<số>` trong `SPEC-acceptance.md` được nới cho trường hợp mở rộng nhóm đã có.

---

## 4. Ảnh hưởng dữ liệu

| Mục | Kết luận |
|---|---|
| Bảng/cột mới | **Không** |
| Migration | **Không** (`user_version` giữ nguyên 2) |
| Dữ liệu cũ | **Không ảnh hưởng** — FEAT-11 chỉ thêm một đường gọi tới `removeItem` đã tồn tại |
| Hợp đồng xoá (giữ nguyên từ FEAT-10) | `DELETE FROM items WHERE order_batch_id=? AND ntk=?` trong transaction, kèm cập nhật `total_target`; chặn nếu có `entries` hoặc `ntk` còn trong `container_data` |
| Rủi ro dữ liệu | Thấp — mọi thao tác phá huỷ vẫn qua `Alert` (INV-U1) và hai lớp chặn |

---

## 5. Kế hoạch file

| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `src/components/ItemCard.js` | 🟡 | **thêm** prop `onDeleteItem` (tuỳ chọn) + 1 hàng nút | Nơi hiển thị nút xoá trực tiếp |
| `src/screens/ItemsScreen.js` | 🟡 | truyền `onDeleteItem={removeItem}` | Nối thẻ với store action đã có |
| `src/utils/deleteItem.js` | 🟢 **mới** | **tạo** | Một nguồn sự thật cho `Alert` xác nhận + map lỗi, dùng chung sheet và thẻ |
| `src/components/ItemEditSheet.js` | 🟢 | **sửa** để dùng helper (xoá code trùng) | AC-EDIT-33/34; giữ nguyên UI & props |
| `scripts/test-deleteItem.mjs` | 🟢 **mới** | **tạo** | Unit test hàm thuần map lỗi (không cần Expo/SQLite) |
| `package.json` | 🟢 | thêm `test:delete` vào `scripts` | Chạy được bằng `npm test` |
| `specs/*` | 🟢 | cập nhật | Đồng bộ đặc tả |

**Không chạm:** `db/schema.js` 🔒 · `db/queries.js` 🔒 (không đổi chữ ký) · `store/useAppStore.js` 🔒 (`removeItem` đã có) · `data/seed.js` 🔒 · `src/app/**` 🔒

---

## 6. Thiết kế

### 6.1 Luồng dữ liệu

```
ItemCard (nút ✕)
   └─> confirmDeleteItem({ item, onDelete, theme })        🟢 util dùng chung
         └─> Alert.alert('Xác nhận', `Xoá mã ${ntk}?`, [Huỷ, Xoá])
               └─> removeItem(ntk)                        store action (đã có)
                     └─> q.removeItem(batchId, ntk)       🟡 chặn trong DB
                           └─> {ok, error?} ──> refreshItems() + dataVersion++
```

### 6.2 Chữ ký mới (bổ sung, không phá)

```js
// src/components/ItemCard.js — prop mới, tuỳ chọn, không đổi chữ ký cũ
ItemCard({ item, theme, onAddEntry, onUpdateEntry, onDeleteEntry, onEditItem, onDeleteItem })

// src/utils/deleteItem.js — file mới, module THUẦN (không import react-native)
export const ITEM_ERROR_MESSAGES;                   // map error code -> (error) => tiếng Việt
export function itemErrorMessage(error);            // -> string, mã lạ => thông báo chung
export function confirmDeleteItem({ item, onDelete, alert, onBusy, onSuccess });
//   -> Promise<{ok, error?}>, tự mở Alert
//   `alert` = **object/class `Alert`** của RN (caller truyền `alert: Alert`),
//   KHÔNG phải `Alert.alert` — vì RN định nghĩa `Alert` là `class`, gọi như hàm sẽ crash.
//   Hàm này tự gọi `alert.alert(...)`.
```

`confirmDeleteItem` gọi `onDelete(ntk)`, nhận `{ok, error?}`:
- `{ok: true}` → đóng im lặng (UI tự refresh qua store).
- `{ok: false}` → `Alert.alert('Không xoá được', itemErrorMessage(error))`.

### 6.3 Văn bản UI (tiếng Việt, INV-U2)

| Vị trí | Nhãn |
|---|---|
| Nút trên thẻ | `✕ Xoá mã hàng` (màu `theme.bad`) |
| `Alert` xác nhận | `Xác nhận` / `Xoá mã {ntk}?` / `[Huỷ] [Xoá]` |
| `Alert` lỗi | `Không xoá được` |

> Nút xoá dùng `theme.bad` để phân biệt ngay với nút sửa (`theme.accent`). Cùng cỡ chữ 12.5, cùng bố cục hàng.

---

## 7. Rủi ro hồi quy

| AC/INV bị ảnh hưởng | Cách bảo vệ |
|---|---|
| **INV-U1** (xác nhận hành động phá huỷ) | Nút mới **bắt buộc** đi qua `confirmDeleteItem` có `Alert`; không có đường gọi thẳng `removeItem` |
| **INV-B2** (không sửa dữ liệu `archived`) | Nút chỉ hiện khi `ItemsScreen` truyền callback (batch `active`) |
| **INV-V2** (kiểm tra ngược `container_data`) | Giữ nguyên chặn `ITEM_IN_PALLETS` trong `queries.js` — FEAT-11 không nới lỏng |
| **AC-EDIT-09/10/13** | Tái dùng nguyên `removeItem`; AC-EDIT-29/30/32 chốt lại để chắc không lệch |
| **AC-ITEM-11/17/18/19** (lọc PO, hạn mức) | Không đụng logic lọc/hạn mức; AC-EDIT-36 chốt hành vi sau xoá |
| **Rủi ro mới: gọi nhầm batch** | `store.removeItem` luôn lấy `getActiveBatchId()`. Nếu về sau `ItemsScreen` hiển thị batch `archived`, thao tác sẽ xoá nhầm dòng cùng `ntk` ở batch **active**. → Bổ sung `INV-V3` + AC-EDIT-32 để chặn từ gốc |
| **Trùng lặp logic** | Bắt buộc dùng `src/utils/deleteItem.js` cho cả sheet và thẻ (AC-EDIT-33/34) — không copy `Alert` vào `ItemCard.js` |
| **BUG (đã sửa): `Alert` là `class`** | RN 57 định nghĩa `Alert` là `class` có static `alert`. Lần đầu helper gọi `alert(...)` như hàm ⇒ `TypeError: Class constructor Alert cannot be invoked without 'new'`, crash mọi thao tác xoá. Đã sửa thành `alert.alert(...)`; thêm test hồi quy mục 9 trong `scripts/test-deleteItem.mjs` |

---

## 8. Kế hoạch kiểm thử

**RC phải chạy lại:** `RC-01`, `RC-02`, `RC-IMP-02`, `RC-IMP-05`, `RC-15`, `RC-20` · toàn bộ `AC-EDIT-01..25` (FEAT-10) · `AC-ITEM-11/17/18/19`

**RC mới:**

| RC | Kịch bản |
|---|---|
| **RC-47** | Tab Mã hàng → thấy nút `✕ Xoá mã hàng` trên mọi thẻ, cạnh nút Sửa |
| **RC-48** | Bấm ✕ → Alert hiện đúng tên mã → bấm **Huỷ** → mã vẫn còn, không đổi gì |
| **RC-49** | Bấm ✕ → bấm **Xoá** → mã biến mất, tổng số lượng giảm đúng, tắt/mở lại app vẫn mất |
| **RC-50** | Bấm ✕ trên mã **đã có nhật ký** → bị chặn, hiện `ITEM_HAS_ENTRIES` |
| **RC-51** | Bấm ✕ trên mã **đang có trong kiện** (sang tab Container) → bị chặn, hiện số kiện |
| **RC-52** | Xoá mã đang hiển thị khi lọc PO → danh sách lọc không bị lệch, ô tìm kiếm giữ nguyên |
| **RC-53** | Mở sheet Sửa → nút xoá trong sheet vẫn hoạt động, thông báo **giống hệt** nút trên thẻ |
| **RC-54** | Xoá mã rồi `finishOrder` → batch `archived` giữ dữ liệu **đã xoá**; batch mới sinh từ seed |

**Unit test:** `scripts/test-deleteItem.mjs` — `itemErrorMessage()` trả đúng chuỗi cho cả 4 mã lỗi, mã lạ trả thông báo chung.

---

## 9. Tiêu chí xong

- [x] Mục 10.4 `SPEC-rules.md`: AC-EDIT-26..36 ✅ · `INV-V3` có trong `SPEC-rules.md` §8
- [x] Nút `✕ Xoá mã hàng` trên thẻ, cạnh nút Sửa
- [x] `Alert` xác nhận nói đúng tên mã, có nút Huỷ
- [x] Hai lớp chặn (`ITEM_HAS_ENTRIES`, `ITEM_IN_PALLETS`) vẫn hoạt động từ đường mới
- [x] Không còn `Alert`/map lỗi trùng lặp giữa `ItemCard.js` và `ItemEditSheet.js`
- [x] `npm test` — 0 lỗi (thêm `test:delete`)
- [x] `npx expo lint` — 0 lỗi
- [x] `npx tsc --noEmit` — 0 lỗi mới
- [x] `npx expo export --platform ios` — bundle sạch
- [ ] ⛔ RC-47..54 **chưa chạy được** — cần máy/emulator thật, không có trong môi trường code-only. **Phải chạy trước khi phát hành.**
- [x] `SPEC-changelog.md` + `SPEC-reference.md` §12 Registry + `SPEC.md` cập nhật

---

## 10. Breaking changes

**Không có breaking change.** Lý do:

1. **Schema**: không bảng/cột nào thêm, không migration, `user_version` giữ nguyên `2`.
2. **Chữ ký**: `ItemCard` chỉ **thêm** prop tuỳ chọn `onDeleteItem`; mọi nơi gọi cũ vẫn hợp lệ (AC-EDIT-35). `removeItem` / `queries.js` / store **không đổi**.
3. **Hành vi cũ**: nút xoá trong `ItemEditSheet` **giữ nguyên**; người dùng cũ không bị gãy gì.
4. **Dữ liệu cũ**: không migrate, không đọc/ghi lịch sử. Dữ liệu đã xoá trước đó không phục hồi được (đúng như FEAT-10) — không có thay đổi so với hiện tại.
5. **Rủi ro duy nhất** là hành vi *mới* (xoá nhanh hơn, dễ bấm nhầm hơn) → đã giảm bằng `Alert` bắt buộc + nhãn rõ ràng.

> ⚠️ Lưu ý: xoá mã là **không hoàn tác được**. Không đề xuất thêm undo trong v1; nếu muốn thì mở FEAT riêng ở cấp 2.
