# SPEC-API — Hợp đồng API nội bộ

> **Từ SPEC.md §6** — [Quay lại SPEC.md](SPEC.md) | [SPEC-rules.md](SPEC-rules.md) | [SPEC-data.md](SPEC-data.md)

**Nguyên tắc:** Không đổi chữ ký (signature) hàm hiện có trong `queries.js` và `useAppStore.js`. Chỉ được **thêm** hàm mới hoặc thêm tham số tuỳ chọn có giá trị mặc định.

---

## §6.1 `src/db/index.js`

| Hàm | Trả về | Ghi chú |
|---|---|---|
| `getDb()` | `SQLiteDatabase` (singleton) | Lần đầu: mở `production_tracker.db`, chạy schema, đảm bảo có batch active |
| `getActiveBatchId(db)` | `number` | id của batch active |

---

## §6.2 `src/db/queries.js`

| Hàm | Tham số | Trả về / hiệu ứng |
|---|---|---|
| `fetchItemsWithStats(batchId)` | | `[{ntk, po, target, order_batch_id, produced, defect}]` sắp theo `ntk` |
| `fetchEntriesForItem(batchId, ntk)` | | Mảng dòng `entries`, mới nhất trước (`ORDER BY id DESC`) |
| `addEntry(batchId, ntk, {date, qty, line, defectQty, defectTypes[]})` | | `INSERT`; `defectTypes` được `join(',')`. **FEAT-09:** trả `{ok:true}` hoặc `{ok:false, error}` nếu vượt `items.target` |
| `updateEntry(entryId, {date, qty, line, defectQty, defectTypes[]})` | | `UPDATE` một dòng. **FEAT-09:** trả `{ok:true}` hoặc `{ok:false, error}` nếu vượt `items.target` |
| `removeEntry(entryId)` | | `DELETE` một dòng |
| `fetchPalletStatus(batchId)` | | `{ [key]: boolean }` |
| `setPalletStatus(batchId, key, done)` | | Upsert trạng thái |
| `isPalletDone(cid, pallet, palletDoneMap)` | (hàm thuần) | Xem AC-CONT-03. FEAT-10: dùng khoá `${cid}-${no}-${ntk}` cho kiện nhiều loại |
| `countPalletsDone(palletDoneMap)` | (hàm thuần) | `{done, total}` trên toàn bộ `containersData` seed |
| `countPalletsDoneWithData(palletDoneMap, containers?)` | (hàm thuần) | `{done, total}`; dùng `containers` nếu có, fallback `containersData` |
| `fetchContainerData(batchId)` | | `containersData[]` từ DB, hoặc `null` |
| `importContainerData(batchId, jsonData)` | packing list JSON | Parse container/pallet → lưu `container_data`; cập nhật `pallets_total`; trả `{containers, pallets}` |
| `fetchHistoryGrouped(groupBy, filterValue)` | `groupBy ∈ 'day'\|'month'\|'year'` | `[{groupKey,total,manualTotal,autoTotal,defectTotal}]` |
| `fetchHistoryDetail(groupBy, groupKey)` | | `day`: từng dòng. `month`/`year`: gộp theo `ntk` |
| `fetchAvailableYears()` | | `['2026', ...]` |
| `fetchArchives()` | | Các batch `archived`, mới nhất trước |
| `fetchArchiveItems(batchId)` | | `[{ntk,target,produced,defect}]` |
| `importItemsFromJson(batchId, jsonData)` | packing list JSON | INSERT OR REPLACE items; cập nhật `total_target`; trả `{imported, totalItems}` |
| `importEntriesFromJson(batchId, entries)` | `Array<{ntk,date,qty,line?,defectQty?,defectTypes?}>` | Bulk INSERT; bỏ qua nếu `ntk` không tồn tại hoặc `qty≤0 && defectQty≤0`; trả `{imported, skipped}` |
| **`getItemTargetUsage(batchId, ntk, excludeEntryId?)`** | (FEAT-09, hàm mới) | `{target, produced, remaining, hasLimit}`; `produced = SUM(entries.qty)` trong batch, **đã trừ** `excludeEntryId` nếu có. `hasLimit = target > 0` |
| `finishOrder(containers?)` | (tuỳ chọn: `containersData[]`) | Lưu batch, tạo batch mới, trả `newBatchId`. `containers` dùng cho pallet stats; fallback seed. Batch mới luôn dùng seed. |

---

## §6.2.1 `src/utils/validateQty.js` (FEAT-09 — hàm thuần, 🟢 file mới)

> Không phụ thuộc DB/React. Dùng chung cho UI và unit test (`SPEC-test.md` §11.2).

| Hàm | Tham số | Trả về |
|---|---|---|
| `parseQty(raw)` | chuỗi/số | `number` (số nguyên ≥ 0) hoặc `null` nếu không hợp lệ. Chuẩn hoá: bỏ khoảng trắng, coi `.` và ` ` là phân tách nghìn |
| `checkQtyLimit({target, produced, incomingQty, hasLimit})` | | `{ok:true}` hoặc `{ok:false, code:'OVER_TARGET', target, produced, incomingQty, remaining, overBy}`. `hasLimit=false` ⇒ luôn `{ok:true}` |
| `formatQtyError(result, ntk)` | | Chuỗi tiếng Việt cho `Alert` |

---

## §6.2.1b `src/utils/deleteItem.js` (FEAT-11 — hàm thuần + UI helper, 🟢 file mới)

> **Nguồn sự thật duy nhất** cho thông báo xoá mã hàng. Cả `ItemEditSheet.js` và `ItemCard.js` đều phải dùng helper này — cấm copy `Alert`/map lỗi vào component (AC-EDIT-33/34).

| Hàm | Tham số | Trả về |
|---|---|---|
| `ITEM_ERROR_MESSAGES` | — | Object: `error code` → `(error) => chuỗi tiếng Việt`. Hàm vì nhiều thông điệp cần số liệu động (`ntk`, `produced`, `pallets`). Gồm `ITEM_EXISTS`, `ITEM_NOT_FOUND`, `ITEM_HAS_ENTRIES`, `ITEM_IN_PALLETS` + 3 mã dùng chung với form |
| `itemErrorMessage(error)` | object lỗi `{code, ntk?, produced?, pallets?}` | Chuỗi tiếng Việt; mã lạ / rỗng ⇒ thông báo chung, không crash |
| `deleteConfirmMessage(ntk)` | mã hàng | Thân `Alert` xác nhận — **nêu đúng tên mã** (AC-EDIT-27) |
| `DELETE_CONFIRM_TITLE` / `DELETE_CANCEL_TEXT` / `DELETE_CONFIRM_TEXT` / `DELETE_ERROR_TITLE` | — | Hằng nhãn dùng chung ⇒ thẻ và sheet **không thể** lệch nhãn (AC-EDIT-33) |
| `confirmDeleteItem({item, onDelete, alert, onBusy, onSuccess})` | `item` (dòng `items`), `onDelete(ntk) => {ok, error?}`, `alert` (= **object/class `Alert`** của RN, **bắt buộc** truyền vào — hàm tự gọi `alert.alert(...)`), `onBusy?`, `onSuccess?` | `Promise<{ok, error?}>`. Tự mở `Alert` xác nhận (nút `Huỷ` ⇒ `{ok:false, code:'CANCELLED'}`); khi `{ok:false}` báo `Alert.alert(DELETE_ERROR_TITLE, itemErrorMessage(error))`; khi thành công gọi `onSuccess` |

> Module **cố tình không import `react-native`** nên `scripts/test-deleteItem.mjs` chạy được bằng `node` — vì vậy `confirmDeleteItem` nhận `alert` từ caller thay vì tự import.
>
> ⚠️ **`alert` là object/class `Alert`, KHÔNG phải `Alert.alert`.** RN 57 định nghĩa `Alert` là `class`; gọi `alert(...)` trực tiếp sẽ ném `TypeError: Class constructor Alert cannot be invoked without 'new'`. Caller luôn truyền `alert: Alert`. Có test hồi quy (mục 9) trong `scripts/test-deleteItem.mjs`.

**Không đổi:** `removeItem(batchId, ntk)` trong `queries.js` và `removeItem(ntk)` trong store giữ nguyên chữ ký — FEAT-11 chỉ gọi lại.

---

## §6.2.1c `src/utils/poSummary.js` (FEAT-12 — hàm thuần, 🟢 file mới)

> Không phụ thuộc DB/React ⇒ test được bằng `node scripts/test-poSummary.mjs`. Đặt ở `utils/` (không phải store) để giữ được khả năng unit test — cùng cách `validateQty.js`, `palletKey.js`, `deleteItem.js`.

| Hàm | Tham số | Trả về |
|---|---|---|
| `MULTI_PO_LABEL` | — | Hằng `'Nhiều PO'` |
| `poRowLabel(group)` | nhóm | `'2600189'` hoặc `'Nhiều PO (5 mã)'` |
| `poSummaries(items, allPos)` | mảng dòng `items` (có `ntk, po, target, produced, defect`); `allPos` = `allPOs(items)` — bỏ trống thì tự tách từ `items` | `PoSummary[]` **đã sắp xếp**; rỗng ⇒ `[]`. Mọi PO trong `allPos` đều có dòng kể cả `0/0/0` (AC-ITEM-24) |

`PoSummary = { key, label, isMulti, itemCount, target, produced, remaining, defect, pct }`

- **Quy tắc gom nhóm:** `po` không có `+` ⇒ vào nhóm tên `po`; `po` có `+` ⇒ **không** cộng vào PO nào, gom vào nhóm `Nhiều PO` (`isMulti: true`). `A+B` và `B+A` cùng một nhóm.
- **Bất biến:** `Σ target` của mọi nhóm luôn bằng `Σ target` của `items` (INV-D6).
- **Sắp xếp:** `target` giảm dần; bằng nhau thì `label` tăng dần.
- **Chống lỗi:** `produced`/`defect` ép `|| 0`; `target = 0` ⇒ `pct = 0`, không chia.

---

## §6.2.2 `queries.js` — API cho FEAT-10

> Tất cả hàm mới đều **bổ sung**, không đổi chữ ký hàm cũ. Xem [`features/FEAT-10-edit-items-pallets.md`](features/FEAT-10-edit-items-pallets.md).

**Sản phẩm & số lượng:**

| Hàm | Tham số | Trả về / hiệu ứng |
|---|---|---|
| `addItem(batchId, {ntk, po, target})` | | `INSERT` vào `items`; cập nhật `total_target`; trả `{ok:true}` hoặc `{ok:false, error:{code:'ITEM_EXISTS'|'INVALID_NTK'|'INVALID_TARGET'}}` |
| `updateItem(batchId, ntk, {po, target})` | | `UPDATE`; chặn nếu `target < SUM(entries.qty)` (`TARGET_BELOW_PRODUCED`); tính lại `total_target` |
| `removeItem(batchId, ntk)` | | `DELETE`; **chặn** nếu có nhật ký (`ITEM_HAS_ENTRIES`) hoặc còn nằm trong kiện (`ITEM_IN_PALLETS`); tính lại `total_target` |
| `recalcBatchTarget(batchId)` | | `UPDATE order_batches SET total_target = SUM(target)` (🟡 nội bộ, dùng chung) |

**Kiện (container_data):**

| Hàm | Tham số | Trả về / hiệu ứng |
|---|---|---|
| `materializeContainers(batchId)` | | Nếu chưa có `container_data`: `INSERT` từ `containersData` seed, giữ nguyên `id` ⇒ không mất `pallet_status` |
| `addPallet(batchId, containerId, {no, items})` | `items: [{ntk, qty}]` | Thêm kiện; tính lại `pallets_total`; trả `{ok:true}` hoặc `{ok:false, error}` |
| `updatePallet(batchId, containerId, palletNo, {items})` | | Sửa thành phần kiện; **di chuyển trạng thái tick** sang khoá mới trong cùng transaction (INV-P1) |
| `removePallet(batchId, containerId, palletNo)` | | Gỡ kiện khỏi JSON; `DELETE pallet_status` của kiện; tính lại `pallets_total` |
| `getContainerDataForWrite(batchId)` | (nội bộ 🟡) | Đọc JSON + `materializeContainers` nếu cần; **không** ghi gì nếu JSON hỏng |
| `fetchContainersView(batchId)` | (nội bộ 🟡) | Đọc **chỉ để kiểm tra**, fallback seed trong bộ nhớ — **không** vật chất hoá, không ghi DB |

**Helper thuần (🟢 `src/utils/palletKey.js`, mới):**

| Hàm | Mô tả |
|---|---|
| `palletKey(containerId, palletNo, item?)` | `item` không có → `` `${cid}-${no}` ``; có → `` `${cid}-${no}-${ntk}` `` (PA A) |
| `remapPalletStatus(before, after)` | Ánh xạ trạng thái `done` từ cấu trúc cũ sang mới; dùng khi thêm/xoá dòng hàng |
| `recalcPalletTotals(containers)` | `{count, totalQty}` để tính `pallets_total` |

---

## §6.3 `src/store/useAppStore.js`

**State:** `ready`, `batchId`, `items`, `palletDoneMap`, `archives`, `containerData` (mới, `null`), `activeFilter`, `activeStatusFilter`, `activeContainerFilter`, `searchQuery`, `historyGroup`, `historyFilterValue`, `dataVersion`, `importStatus`, `importResult`.

**Action (async):** `init()`, `refreshItems()`, `addEntry(ntk, payload)`, `updateEntry(entryId, payload)`, `removeEntry(entryId)`, `togglePallet(key, currentlyDone)`, `finishOrder()`, `importFromJson(jsonData)`.

- `init()`: fetch `items` + `palletDoneMap` + `archives` + `containerData` từ DB
- `addEntry(ntk, payload)` / `updateEntry(entryId, payload)`: **FEAT-09** trả về `{ok, error?}` (trước là `undefined`). Tên và tham số **không đổi**; chỉ thêm giá trị trả về ⇒ caller cũ bỏ qua kết quả vẫn chạy đúng
- `finishOrder()`: gọi `q.finishOrder(state.containerData)`, reset `containerData: null`
- `importFromJson`: detect format → `entries` → `importEntriesFromJson`; `packingList` → `importItemsFromJson` + `importContainerData` + refresh `containerData`

**Action (đồng bộ):** `setFilter`, `setStatusFilter`, `setContainerFilter`, `setSearchQuery`, `setHistoryGroup`, `setHistoryFilterValue`.

**Action mới (FEAT-10):** `addItem`, `updateItem`, `removeItem`, `addPallet`, `updatePallet`, `removePallet`. Tất cả trả `{ok, error?}`; khi thành công phải `refreshItems()` / nạp lại `containerData` + `palletDoneMap` và tăng `dataVersion`. Không thêm state toàn cục mới — form mở/đóng là state cục bộ của component.

**Selector/export:** `pctClass(pct)`, `allPOs(items)`, `filteredItems(state)`, `summaryTotals(items)`, `containersData` (re-export từ seed).

> `dataVersion` tăng sau mỗi action ghi (fix BUG-05): `addEntry`, `updateEntry`, `removeEntry`, `finishOrder`, `importFromJson`.

---

## §6.4 Component (props)

| Component | Props | Ghi chú |
|---|---|---|
| `ProgressBar` | `{pct, color?, theme}` | |
| `FilterChips` | `{options, activeValue, onSelect, theme}` | |
| `SummaryCards` | `{totals:{...}, theme}` | |
| `EntryLogRow` | `{entry, onEdit, onDelete, theme}` | |
| `ItemCard` | `{item, theme, onAddEntry, onUpdateEntry, onDeleteEntry}` | Cần `item.order_batch_id`. **FEAT-09: không thêm prop** — hạn mức đã có sẵn trong `item.target`/`item.produced`; `onAddEntry`/`onUpdateEntry` trả `{ok, error?}` để component hiện Alert. FEAT-10: thêm `onEditItem?`, `onDeleteItem?` |
| `PalletRow` | `{containerId, pallet, palletDoneMap, onTogglePallet, theme}` | FEAT-10: thêm `onEditPallet?`, `onDeletePallet?` |
| `ArchiveCard` | `{archive, theme}` | |
| `ImportJsonButton` | `{onImport, hasContainerData?, theme}` | Detect format, Alert xác nhận + kết quả. FEAT-10: cảnh báo ghi đè kiện khi `hasContainerData` |
| `ItemsScreen` | (state từ store) | + nút "＋ Thêm mã hàng" (FEAT-10) |
| `ContainersScreen` | (state từ store) | Dùng `containerData \|\| containersData`; `countPalletsDoneWithData`; + nút "＋ Thêm kiện" (FEAT-10) |
| **`PoSummaryTable`** | `{summaries, theme}` | 🟢 mới (FEAT-12). Chỉ render, **không** tự truy vấn. Rỗng ⇒ hiện `Chưa có mã hàng.` |
| **`ItemEditSheet`** | `{item?, pos, defaultPo?, onSubmit, onDelete, theme}` | 🟢 mới (FEAT-10). Chỉ mount khi mở |
| **`PalletEditSheet`** | `{containerLabel, pallet?, itemOptions, defaultNo?, onSubmit, onDelete, theme}` | 🟢 mới (FEAT-10). Chỉ mount khi mở |

---

## §6.5 Token theme

`bg, card, ink, sub, accent, good, warn, bad, line` (cả `light` và `dark`). Thêm token mới phải thêm ở **cả hai** bảng màu — xem `src/theme.js`.
