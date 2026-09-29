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
| `addEntry(batchId, ntk, {date, qty, line, defectQty, defectTypes[]})` | | `INSERT`; `defectTypes` được `join(',')` |
| `updateEntry(entryId, {date, qty, line, defectQty, defectTypes[]})` | | `UPDATE` một dòng |
| `removeEntry(entryId)` | | `DELETE` một dòng |
| `fetchPalletStatus(batchId)` | | `{ [key]: boolean }` |
| `setPalletStatus(batchId, key, done)` | | Upsert trạng thái |
| `isPalletDone(cid, pallet, palletDoneMap)` | (hàm thuần) | Xem AC-CONT-03 |
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
| `finishOrder(containers?)` | (tuỳ chọn: `containersData[]`) | Lưu batch, tạo batch mới, trả `newBatchId`. `containers` dùng cho pallet stats; fallback seed. Batch mới luôn dùng seed. |

---

## §6.3 `src/store/useAppStore.js`

**State:** `ready`, `batchId`, `items`, `palletDoneMap`, `archives`, `containerData` (mới, `null`), `activeFilter`, `activeStatusFilter`, `activeContainerFilter`, `searchQuery`, `historyGroup`, `historyFilterValue`, `dataVersion`, `importStatus`, `importResult`.

**Action (async):** `init()`, `refreshItems()`, `addEntry(ntk, payload)`, `updateEntry(entryId, payload)`, `removeEntry(entryId)`, `togglePallet(key, currentlyDone)`, `finishOrder()`, `importFromJson(jsonData)`.

- `init()`: fetch `items` + `palletDoneMap` + `archives` + `containerData` từ DB
- `finishOrder()`: gọi `q.finishOrder(state.containerData)`, reset `containerData: null`
- `importFromJson`: detect format → `entries` → `importEntriesFromJson`; `packingList` → `importItemsFromJson` + `importContainerData` + refresh `containerData`

**Action (đồng bộ):** `setFilter`, `setStatusFilter`, `setContainerFilter`, `setSearchQuery`, `setHistoryGroup`, `setHistoryFilterValue`.

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
| `ItemCard` | `{item, theme, onAddEntry, onUpdateEntry, onDeleteEntry}` | Cần `item.order_batch_id` |
| `PalletRow` | `{containerId, pallet, palletDoneMap, onTogglePallet, theme}` | |
| `ArchiveCard` | `{archive, theme}` | |
| `ImportJsonButton` | `{onImport, theme}` | Detect format, Alert xác nhận + kết quả |
| `ContainersScreen` | (state từ store) | Dùng `containerData \|\| containersData`; `countPalletsDoneWithData` |

---

## §6.5 Token theme

`bg, card, ink, sub, accent, good, warn, bad, line` (cả `light` và `dark`). Thêm token mới phải thêm ở **cả hai** bảng màu — xem `src/theme.js`.
