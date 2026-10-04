# SPEC-API — Hợp đồng API nội bộ

> **Từ SPEC.md §6** — [Quay lại SPEC.md](SPEC.md) | [SPEC-rules.md](SPEC-rules.md) | [SPEC-data.md](SPEC-data.md)

**Nguyên tắc:** Không đổi chữ ký (signature) hàm hiện có trong `queries.js` và `useAppStore.js`. Chỉ được **thêm** hàm mới hoặc thêm tham số tuỳ chọn có giá trị mặc định.

---

## §6.1 `src/db/index.js`

| Hàm | Trả về | Ghi chú |
|---|---|---|
| `getDb()` | `SQLiteDatabase` (singleton) | Lần đầu: mở `production_tracker.db`, chạy schema, migration, **schema guard** (`ensureItemMetricColumns` — xác minh 4 cột `items` bằng `PRAGMA table_info`, vá nếu thiếu, không tin `user_version`), rồi `ensureActiveBatch`. **BUGFIX-08:** cache **promise** khởi tảo (không cache instance) ⇒ gọi song song vẫn chờ đủ migration (`INV-DB1`). In log chẩn đoán `[db] user_version=… · items=[…]` |
| `getActiveBatchId(db)` | `number` | id của batch active (`ORDER BY id DESC LIMIT 1` — luôn là batch mới nhất) |

> **BUGFIX-02/03:** `ensureActiveBatch` (nội bộ 🟡) bảo đảm **đúng một** batch `active` (INV-B1):
> nếu DB lỡ có nhiều batch active (bản cũ chạy `finishOrder` song song, hoặc app bị tắt giữa lúc
> dở việc), nó giữ batch **mới nhất** và chuyển các batch active còn lại sang `archived`
> (`finished_date = COALESCE(finished_date, todayLocal())`). **Không** xoá `entries`/`items`/
> `pallet_status`/`container_data`. Tạo batch đầu tiên cũng nằm trong **một** transaction, dùng
> `INSERT OR IGNORE` + tổng lấy từ `SUM(items.target)` (INV-D6).

---

## §6.2 `src/db/queries.js`

| Hàm | Tham số | Trả về / hiệu ứng |
|---|---|---|
| `fetchItemsWithStats(batchId)` | | `[{ntk, po, target, order_batch_id, produced, defect}]` sắp theo `ntk`. **FEAT-17:** mảng trả về có **thêm** `nw_kg, gw_kg, volume_cbm, package_count` (có thể `NULL` — `INV-I1`). Chữ ký **không đổi**; caller cũ destructuring vẫn chạy |
| `fetchEntriesForItem(batchId, ntk)` | | Mảng dòng `entries`, mới nhất trước (`ORDER BY id DESC`) |
| `addEntry(batchId, ntk, {date, qty, line, defectQty, defectTypes[]})` | | `INSERT`; `defectTypes` được `join(',')`. **FEAT-09:** trả `{ok:true}` hoặc `{ok:false, error}` nếu vượt `items.target` |
| `updateEntry(entryId, {date, qty, line, defectQty, defectTypes[]})` | | `UPDATE` một dòng. **FEAT-09:** trả `{ok:true}` hoặc `{ok:false, error}` nếu vượt `items.target` |
| `removeEntry(entryId)` | | `DELETE` một dòng |
| `fetchPalletStatus(batchId)` | | `{ [key]: boolean }` |
| `setPalletStatus(batchId, key, done)` | | Upsert trạng thái |
| `isPalletDone(cid, pallet, palletDoneMap)` | (hàm thuần) | Xem AC-CONT-03. FEAT-10: dùng khoá `${cid}-${no}-${ntk}` cho kiện nhiều loại |
| `countPalletsDone(palletDoneMap)` | (hàm thuần) | `{done, total}` trên toàn bộ `containersData` seed |
| `countPalletsDoneWithData(palletDoneMap, containers?)` | (hàm thuần) | `{done, total}`; dùng `containers` nếu có, fallback `containersData` |
| `fetchContainerData(batchId)` | | `containersData[]` từ DB, hoặc `null` (**FEAT-14:** hàng `data='[]'` ⇒ trả `[]`, tức đơn trắng — không fallback seed) |
| `importContainerData(batchId, jsonData)` | packing list JSON | Parse container/pallet → lưu `container_data`; cập nhật `pallets_total`; trả `{containers, pallets}` |
| `fetchHistoryGrouped(groupBy, filterValue)` | `groupBy ∈ 'day'\|'month'\|'year'` | `[{groupKey,total,manualTotal,autoTotal,defectTotal}]` |
| `fetchHistoryDetail(groupBy, groupKey)` | | `day`: từng dòng. `month`/`year`: gộp theo `ntk` |
| `fetchAvailableYears()` | | `['2026', ...]` |
| `fetchArchives()` | | Các batch `archived`, mới nhất trước |
| `fetchArchiveItems(batchId)` | | `[{ntk,target,produced,defect}]` |
| `importItemsFromJson(batchId, jsonData)` | packing list JSON | INSERT OR REPLACE items; cập nhật `total_target`; trả `{imported, totalItems}` |
| **`importPackingV1(batchId, jsonData)`** | *(FEAT-17, hàm mới)* | `packing_data.json` (`schema_version: 1`) → ghi `items` (kèm `po` chính xác từng mã + 4 cột §5.8) + `container_data` + `total_target` + `pallets_total` trong **một** transaction; all-or-nothing (`INV-I4`); trả `{imported, totalItems, containers, pallets, shipments, poCount}` |
| `importEntriesFromJson(batchId, entries)` | `Array<{ntk,date,qty,line?,defectQty?,defectTypes?}>` | Bulk INSERT; bỏ qua nếu `ntk` không tồn tại hoặc `qty≤0 && defectQty≤0`; trả `{imported, skipped}` |
| **`getItemTargetUsage(batchId, ntk, excludeEntryId?)`** | (FEAT-09, hàm mới) | `{target, produced, remaining, hasLimit}`; `produced = SUM(entries.qty)` trong batch, **đã trừ** `excludeEntryId` nếu có. `hasLimit = target > 0` |
| `finishOrder(containers?)` | (tuỳ chọn: `containersData[]`) | Lưu batch, tạo batch mới, trả `newBatchId`. `containers` dùng cho pallet stats; fallback seed. **BUGFIX-03:** phần ghi nằm trong **một** transaction; `UPDATE … WHERE id=? AND status='active'` (`changes=0` ⇒ ném lỗi ⇒ rollback); `finished_date` = `todayLocal()`. **FEAT-14:** batch mới **rỗng** — `total_target = 0`, `pallets_total = 0`, **không** `INSERT items`, `INSERT OR REPLACE container_data = '[]'` |

---

## §6.2.1e `src/utils/date.js` (BUGFIX-02 — hàm thuần, 🟢 file mới)

> `toISOString()` trả ngày theo **UTC** ⇒ ở Việt Nam (UTC+7), 00:00–06:59 sáng bị ghi nhầm sang
> **hôm trước**. Mọi ngày ghi mới phải dùng hàm ở đây.
> Test: `node scripts/test-date.mjs` (`npm run test:date`).

| Hàm | Tham số | Trả về |
|---|---|---|
| `todayLocal(now = new Date())` | `Date` (tuỳ chọn, để test) | `YYYY-MM-DD` theo **giờ cục bộ** (`getFullYear/getMonth/getDate`, không dùng `getUTC*`) |
| `isDateString(value)` | | `true` nếu `value` là `YYYY-MM-DD` và là ngày có thật (chặn `2026-13-01`, `2026-02-31`) |

> **Cấm** `new Date().toISOString().slice(0, 10)` trong mã nguồn. Đã thay ở: `queries.js` (4 chỗ:
> `writeContainerDataInTx`, `materializeContainers`, `finishOrder`, `importContainerData`),
> `migrations.js` (1), `ItemCard.js` (1 — ngày nhật ký, BUG-02 gốc rễ).

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

### §3.1b `utils/itemRows.js` (FEAT-19)

> Không phụ thuộc DB/React ⇒ test được bằng `node scripts/test-itemRows.mjs`.

| Hàm | Tham số | Trả về |
|---|---|---|
| `buildPoQtyByNtk(itemPoRows)` | dòng `item_po` | `Map<ntk, Map<po, qty>>`. **Dùng chung** với `poSummaries()` để hai nơi không lệch cách tách |
| `splitItemRows(items, itemPoRows)` | dòng `items` + `item_po` | `ItemRow[]` — mỗi PO của một mã là **một dòng** (AC-SPLIT-01) |
| `filterItemRows(rows, state)` | dòng đã tách + `{activeFilter, searchQuery, activeStatusFilter}` | `ItemRow[]` — cùng bộ lọc của `filteredItems` nhưng trên dòng tách |

`ItemRow = { ntk, po, order_batch_id, target, produced, defect, nw_kg, gw_kg, volume_cbm,
package_count, poCount, isSplit, isFirstOfNtk, mergedMultiPo, itemDone, rowKey }`

- `target` = `item_po.qty` của **riêng** PO đó; `produced`/`defect` **dùng chung** cho mọi dòng của mã (Q1).
- 4 trường FEAT-17: dòng tách **đầu** mang giá trị thật, dòng sau `null` ⇒ `ItemCard` ẩn (Q2, `INV-I1`).
- `isSplit` (`poCount > 1`) ⇒ **không** truyền `onEditItem`/`onDeleteItem` (Q3, AC-SPLIT-07).
- `mergedMultiPo` = mã đa PO **chưa** có `item_po` ⇒ 1 dòng gộp + ghi chú (AC-SPLIT-10).
- `rowKey` = `${order_batch_id}-${ntk}-${po}` — duy nhất, dùng làm React `key` (vá BUG-06).
- **Bất biến INV-D7:** `Σ target` các dòng của một mã == `items.target` của mã đó.

---

## §6.2.1d `src/utils/deleteItemsByPo.js` (FEAT-13 — hàm thuần, 🟢 file mới)

> Xoá **hàng loạt theo PO**. Thông báo xoá **1 mã** vẫn nằm ở `deleteItem.js` (§6.2.1b) — cả hai cùng dùng
> `itemErrorMessage()` để không bao giờ lệch lý do (AC-DEL-12).
> ⚠️ Import `deleteItem.js` **kèm đuôi `.js`**: Node ESM không tự thêm đuôi cho đường dẫn tương đối, còn Metro chấp nhận cả hai dạng — giống `scripts/test-*.mjs`.

| Hàm | Tham số | Trả về |
|---|---|---|
| `INVALID_PO_CODE`, `PO_NO_ITEMS_CODE`, `PO_HAS_ENTRIES_CODE`, `PO_ITEMS_IN_PALLETS_CODE` | — | Hằng mã lỗi riêng của xoá hàng loạt (không trùng mã `ITEM_*`) |
| `BULK_DELETE_BUTTON_TEXT` / `BULK_EMPTY_TEXT` | — | `'Xoá cả PO'` / `'Không có mã hàng nào thuộc PO này.'` |
| `splitPo(po)` | `string` | `string[]` — tách theo `+`, trim, bỏ rỗng. **Cùng** cách với `allPOs()`/`filteredItems()` |
| `isMultiPoItem(po)` | `string` | `boolean` — `po` có chứa `+` |
| `selectItemsByPo(items, po, { excludeMulti = true })` | `items`, PO đơn lẻ | `{ matched, multi, totalTarget, itemCount }`. Dùng **chung** cho preview và xoá thật ⇒ preview không thể lệch kết quả |
| `poFilterNeedsReset(activeFilter, items)` | | `true` khi PO đang lọc không còn mã nào ⇒ UI reset về `Tất cả PO` (Q5) |
| `formatNumber(n)` | `number` | Chuỗi số phân tách nghìn kiểu VN (`8030` → `'8.030'`), không phụ thuộc `toLocaleString` của hệ điều hành. Dùng chung cho thông báo **và** UI `PoDeleteSheet` |
| `bulkDeleteConfirmMessage(po, preview)` | | Thân `Alert`: tên PO + số mã + tổng pcs (**phân tách nghìn kiểu VN**, không phụ thuộc `toLocaleString`) + câu không hoàn tác được |
| `formatBulkDeleteError(error)` | `{code, po?, items?}` | Chuỗi tiếng Việt; từng mã bị chặn dịch qua `itemErrorMessage()`; > 3 mã ⇒ gom `• ... và N mã khác.`; mã lạ ⇒ thông báo chung |
| `confirmDeleteItemsByPo({ po, preview, onDelete, alert, onBusy, onSuccess })` | | `Promise<{ok, error?, result?}>`. `alert` là **object/class `Alert`** của RN (bắt buộc truyền vào). Nút `Huỷ` ⇒ `{ok:false, code:'CANCELLED'}`; `{ok:false}` ⇒ `Alert.alert(DELETE_ERROR_TITLE, formatBulkDeleteError(error))`; thành công ⇒ gọi `onSuccess` |

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

## §6.2.3 `queries.js` — API cho FEAT-13 (xoá theo PO)

> Tất cả hàm mới đều **bổ sung**, không đổi chữ ký hàm cũ (`removeItem` giữ nguyên).
> Chi tiết: [`features/FEAT-13-delete-items-by-po.md`](features/FEAT-13-delete-items-by-po.md).

| Hàm | Tham số | Trả về / hiệu ứng |
|---|---|---|
| `previewItemsByPo(batchId, po)` | `po` = **một PO đơn lẻ** (chứa `+` ⇒ lỗi) | `{ok:true, po, matched:[{ntk,po,target,produced,pallets}], multi:[ntk], totalTarget, itemCount, blocked:[{ntk,code,produced,pallets}], canDelete}`. **Chỉ đọc**, không ghi, không vật chất hoá seed |
| `removeItemsByPo(batchId, po)` | | `{ok:true, po, removed, removedTarget, skippedMulti}` hoặc `{ok:false, error:{code:'INVALID_PO'|'PO_NO_ITEMS'|'PO_HAS_ENTRIES'|'PO_ITEMS_IN_PALLETS', po?, items?}}`. **All-or-nothing** (Q2): có bất kỳ mã bị chặn ⇒ không xoá dòng nào. `DELETE ... WHERE order_batch_id = ? AND ntk IN (?,…)` + `recalcBatchTargetInTx` trong **cùng một transaction** |

**Lưu ý kỹ thuật:**
- Lọc PO bằng **JS** (`splitPo`/`selectItemsByPo`), **không** dùng SQL `LIKE '%PO%'` — `+` là ký tự đại diện của `LIKE` nên sẽ khớp sai.
- `IN (…)` dựng từ `plan.matched.map(() => '?')` — không nội suy chuỗi (quy tắc vàng #7).
- Cùng một hàm `collectPoDeletePlan()` dùng cho cả preview và xoá ⇒ **preview không thể lệch kết quả thật**.

---

## §6.3 `src/store/useAppStore.js`

**State:** `ready`, `batchId`, `items`, `palletDoneMap`, `archives`, `containerData` (mới, `null`; **`[]` = đơn trắng** sau FEAT-14), `activeFilter`, `activeStatusFilter`, `activeContainerFilter`, `searchQuery`, `historyGroup`, `historyFilterValue`, `dataVersion`, `importStatus`, `importResult`, `finishing` (BUGFIX-03 — `boolean`, khoá nút "Hoàn tất").

**Action (async):** `init()`, `refreshItems()`, `addEntry(ntk, payload)`, `updateEntry(entryId, payload)`, `removeEntry(entryId)`, `togglePallet(key, currentlyDone)`, `finishOrder()`, `importFromJson(jsonData)`.

- `init()`: fetch `items` + `palletDoneMap` + `archives` + `containerData` từ DB
- `addEntry(ntk, payload)` / `updateEntry(entryId, payload)`: **FEAT-09** trả về `{ok, error?}` (trước là `undefined`). Tên và tham số **không đổi**; chỉ thêm giá trị trả về ⇒ caller cũ bỏ qua kết quả vẫn chạy đúng
- `finishOrder()`: gọi `q.finishOrder(state.containerData)`, reset `containerData: []` (**FEAT-14** — trước là `null`).
  **BUGFIX-03:** có cờ `finishing` khoá gọi song song (lần 2 trả `{ok:false, error:{code:'BUSY'}}`); trả **thêm** `{ok, batchId}` — tên và tham số không đổi nên caller cũ vẫn chạy đúng.
- `importFromJson`: detect format → `entries` → `importEntriesFromJson`; `packingList` → `importItemsFromJson` + `importContainerData` + refresh `containerData`

**Action (đồng bộ):** `setFilter`, `setStatusFilter`, `setContainerFilter`, `setSearchQuery`, `setHistoryGroup`, `setHistoryFilterValue`.

**Action mới (FEAT-10):** `addItem`, `updateItem`, `removeItem`, `addPallet`, `updatePallet`, `removePallet`. Tất cả trả `{ok, error?}`; khi thành công phải `refreshItems()` / nạp lại `containerData` + `palletDoneMap` và tăng `dataVersion`. Không thêm state toàn cục mới — form mở/đóng là state cục bộ của component.

**Action mới (FEAT-13):** `previewDeleteByPo(po)` (chỉ đọc, trả preview) · `removeItemsByPo(po)` (trả `{ok, error?}` hoặc `{ok:true, removed, removedTarget, skippedMulti}`; thành công thì `refreshItems()` + `dataVersion++`). Cùng nguyên tắc FEAT-10: không thêm state toàn cục, `poSheet`/`poPreview` là state cục bộ của `ItemsScreen`.

**Selector/export:** `pctClass(pct)`, `allPOs(items)`, `filteredItems(state)`, `summaryTotals(items)`, `containersData` (re-export từ seed).

> **FEAT-19:** `filteredItems(state)` **được giữ nguyên** (không xoá hàm đã có) nhưng danh sách mã hàng
> chuyển sang `filterItemRows(splitItemRows(items, itemPoRows), …)` vì cần lọc trên **dòng tách**.
> `summaryTotals(items)` vẫn nhận `items` (mức mã) nên `SummaryCards` không nhân đôi (AC-SPLIT-11).

> `dataVersion` tăng sau mỗi action ghi (fix BUG-05): `addEntry`, `updateEntry`, `removeEntry`, `finishOrder`, `importFromJson`.

---

## §6.4 Component (props)

| Component | Props | Ghi chú |
|---|---|---|
| `ProgressBar` | `{pct, color?, theme}` | |
| `FilterChips` | `{options, activeValue, onSelect, theme}` | |
| `SummaryCards` | `{totals:{...}, theme}` | |
| `EntryLogRow` | `{entry, onEdit, onDelete, theme}` | |
| `ItemCard` | `{item, theme, onAddEntry, onUpdateEntry, onDeleteEntry}` | Cần `item.order_batch_id`. **FEAT-09: không thêm prop** — hạn mức đã có sẵn trong `item.target`/`item.produced`; `onAddEntry`/`onUpdateEntry` trả `{ok, error?}` để component hiện Alert. FEAT-10: thêm `onEditItem?`, `onDeleteItem?`. **FEAT-19: không thêm prop** — `item` là `ItemRow`, component tự đọc `isSplit`/`mergedMultiPo` để hiện ghi chú; thẻ tách không truyền `onEditItem`/`onDeleteItem` nên nút tự ẩn |
| `PalletRow` | `{containerId, pallet, palletDoneMap, onTogglePallet, theme}` | FEAT-10: thêm `onEditPallet?`, `onDeletePallet?` |
| `ArchiveCard` | `{archive, theme}` | |
| `ImportJsonButton` | `{onImport, hasContainerData?, theme}` | Detect format, Alert xác nhận + kết quả. FEAT-10: cảnh báo ghi đè kiện khi `hasContainerData` |
| `ItemsScreen` | (state từ store) | + nút "＋ Thêm mã hàng" (FEAT-10) |
| `ContainersScreen` | (state từ store) | Dùng `containerData \|\| containersData` (`[]` là truthy ⇒ giữ `[]`, **không** fallback seed — FEAT-14); `countPalletsDoneWithData`; + nút "＋ Thêm kiện" (FEAT-10); **rỗng ⇒ empty state** (AC-CONT-09) |
| **`PoSummaryTable`** | `{summaries, theme}` | 🟢 mới (FEAT-12). Chỉ render, **không** tự truy vấn. Rỗng ⇒ hiện `Chưa có mã hàng.` |
| **`ItemEditSheet`** | `{item?, pos, defaultPo?, onSubmit, onDelete, theme}` | 🟢 mới (FEAT-10). Chỉ mount khi mở |
| **`PalletEditSheet`** | `{containerLabel, pallet?, itemOptions, defaultNo?, onSubmit, onDelete, theme}` | 🟢 mới (FEAT-10). Chỉ mount khi mở |
| **`PoDeleteSheet`** | `{pos, selectedPo, preview, loading, busy, onSelectPo, onClose, onConfirm, theme}` | 🟢 mới (FEAT-13). Chỉ render, **không** tự truy vấn. Nút xoá **khoá** khi `preview.canDelete === false` (không có mã, hoặc còn mã bị chặn). Chỉ mount khi mở |

---

## §6.5 Token theme

`bg, card, ink, sub, accent, good, warn, bad, line` (cả `light` và `dark`). Thêm token mới phải thêm ở **cả hai** bảng màu — xem `src/theme.js`.

---

## §6.6 Quản lý đơn lưu trữ (FEAT-15)

| Hàm | Tham số | Trả về | Ghi chú |
|---|---|---|---|
| `previewArchiveDelete(batchId)` | `batchId` | `{ok, finishedDate, produced, target, defect, itemCount, entryCount, palletCount}` \| `{ok:false, error}` | **Hàm mới**, chỉ đọc; dựng nội dung `Alert` (AC-ARCH-04) |
| `deleteArchive(batchId)` | `batchId` | `{ok, deleted:{entries,items,pallets}}` \| `{ok:false, error}` | **Hàm mới** ⇒ chữ ký hàm cũ không đổi (quy tắc #3). Một `withTransactionAsync`; chặn batch `active` (`BATCH_ACTIVE`) |
| `fetchArchives()` | — | `batch[]` | **không đổi** |
| `fetchArchiveItems(batchId)` | — | `[{ntk,target,produced,defect}]` | **không đổi** |

Mã lỗi: `INVALID_BATCH_ID` · `BATCH_ACTIVE` · `ARCHIVE_NOT_FOUND` · `BUSY` · `DB_ERROR`.

**Hàm thuần** `src/utils/archiveDelete.js` (🟢):

| Hàm | Trả về | Ghi chú |
|---|---|---|
| `archiveDeleteConfirmMessage(preview)` | `string` | Nội dung `Alert` 2 nút (AC-ARCH-04) |
| `archiveDeleteErrorMessage(code)` | `string` | Dịch mã lỗi sang tiếng Việt |
| `archiveDeleteErrorCode(err)` | `string` | Chuẩn hoá lỗi (`error.code` hoặc `message`) về mã |

**Store** (`useAppStore.js` — chỉ **thêm**, không đổi tên state/action hiện có):

| Bổ sung | Ghi chú |
|---|---|
| `archivesBusy` (boolean) | khoá nút `🗑` khi đang ghi, giống `finishing` (BUGFIX-03); lần gọi thứ hai trả `BUSY` |
| `refreshArchives()` | nạp lại danh sách lưu trữ |
| `deleteArchive(batchId)` | `q.deleteArchive` ⇒ `refreshArchives()` + `dataVersion++` (AC-ARCH-07) |

> Nút `🗑` trong `ArchiveCard` **không** gọi `getDb()` — đi qua store action (quy tắc #6).
> Chi tiết: [`features/FEAT-15-delete-hide-archive.md`](features/FEAT-15-delete-hide-archive.md).
