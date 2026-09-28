# SPEC — Ứng dụng "Theo dõi sản xuất hàng ngày"

| Mục | Giá trị |
|---|---|
| Phiên bản spec | 1.0 |
| Ngày lập | 2026-09-28 |
| Nền tảng | Expo SDK 57 (Expo Router, thư mục `src/app/`) + `expo-sqlite` + `zustand` |
| Chế độ | 100% offline, một thiết bị, không server |
| Ngôn ngữ giao diện | Tiếng Việt |
| Nguồn gốc | Chuyển từ file `Theo dõi sản xuất hàng ngày.html` (bản web dùng localStorage) sang React Native |

> **File này là nguồn sự thật duy nhất (single source of truth).** Nếu code và spec mâu thuẫn, dừng lại và hỏi chủ dự án. Không tự chọn bên nào.

---

## 0. ĐỌC TRƯỚC — Dành cho AI agent

### 0.1 Quy trình bắt buộc cho mọi thay đổi

1. **Đọc** mục 0, 3, 5, 8 và 9 của file này. Đọc thêm các mục liên quan đến phần bạn định sửa.
2. **Phân loại** thay đổi theo mục 10.1 (Cấp 0 đến Cấp 3).
3. **Viết spec tính năng** vào `specs/features/FEAT-xxx.md` theo mẫu ở mục 13 **trước khi viết code**.
4. **Liệt kê file sẽ sửa** và đối chiếu với bảng mức bảo vệ ở mục 4.2. Không đụng vào file 🔒 nếu chưa được phép.
5. **Cài đặt theo bước nhỏ**, mỗi bước chạy được.
6. **Chạy checklist hồi quy** (mục 11). Ghi kết quả vào phần trả lời.
7. **Cập nhật spec này** (mục 12 Registry, mục 15 Changelog, và Acceptance Criteria nếu hành vi đổi có chủ đích).

### 0.2 Mười quy tắc vàng (vi phạm = hỏng dự án)

1. **Không phá dữ liệu người dùng.** Không `DROP`/`DELETE`/`ALTER` phá huỷ trên bảng có dữ liệu thật nếu không có migration an toàn (mục 10.2).
2. **Chỉ thay đổi schema qua migration có đánh số phiên bản** bằng `PRAGMA user_version`. Không sửa migration đã phát hành.
3. **Không đổi chữ ký (signature) hàm** trong `src/db/queries.js` và `src/store/useAppStore.js`. Muốn mở rộng thì thêm hàm mới hoặc thêm tham số tuỳ chọn có giá trị mặc định.
4. **Mọi import nội bộ khác thư mục dùng alias `@/`** (ví dụ `@/theme`). Không dùng `../src/...` hay đếm `../` để trỏ ra ngoài thư mục hiện tại.
5. **Logic nghiệp vụ không nằm trong file route** (`src/app/**`). File route chỉ `export { default } from '@/screens/...'` hoặc khai báo layout.
6. **Mọi thao tác ghi dữ liệu đi qua store action → `queries.js` → SQLite.** Không viết SQL trong component/screen.
7. **SQL luôn dùng tham số `?`.** Chỉ nội suy chuỗi với hằng số có trong whitelist (như `keyExpr` trong `fetchHistoryGrouped`).
8. **Mọi hành động phá huỷ hoặc đảo trạng thái phải hỏi xác nhận bằng `Alert.alert`** (xoá nhật ký, tick/bỏ tick kiện, hoàn tất đơn, lưu chỉnh sửa). Không dùng `window.confirm`.
9. **Không dùng `localStorage`/`AsyncStorage` cho dữ liệu nghiệp vụ.** Dữ liệu nghiệp vụ chỉ ở SQLite. `AsyncStorage` (nếu thêm) chỉ cho tuỳ chọn giao diện.
10. **Không nâng SDK, không thêm thư viện native, không đổi cấu trúc `src/app/`** khi chưa được phép (thư viện native có thể làm hỏng Expo Go, phải build lại dev client).

### 0.3 Điều agent KHÔNG được làm

- Tạo `App.js` ở gốc dự án (dự án dùng Expo Router, `main` là `expo-router/entry`).
- Đổi tên bảng, cột, key pallet, hay giá trị enum đang dùng (mục 5).
- Sửa `src/data/seed.js` mà không kiểm tra tính nhất quán dữ liệu (INV-D1, mục 8).
- Ghi/sửa/xoá dữ liệu của batch đã `archived` từ giao diện.
- Gọi `getDb()` trong lúc render component. Chỉ gọi trong action hoặc `useEffect`.
- Đưa màu hard-code vào component (dùng token của `theme`, ngoại lệ duy nhất: chữ trắng `#fff` trên nền `accent`/`good`/`bad`).
- "Tiện tay" refactor, đổi tên, format lại file không liên quan tới yêu cầu.
- Xoá các ghi chú/hàm "chưa dùng" (như `fetchAvailableYears`, `updateEntry`). Chúng là điểm mở rộng đã dự trù.

---

## 1. Tổng quan sản phẩm

### 1.1 Mục đích

Công cụ cho xưởng sản xuất theo dõi tiến độ đơn hàng xuất khẩu (đơn Đài Loan, PO2600189 và PO2600168):

1. **Nhập sản lượng hàng ngày** cho từng mã hàng, tách theo dây chuyền thủ công/tự động, kèm hàng lỗi.
2. **Theo dõi đóng kiện (pallet)** theo từng container, đánh dấu kiện đã xong.
3. **Xem lịch sử** sản lượng theo ngày/tháng/năm.
4. **Hoàn tất đơn hàng:** lưu trữ đơn hiện tại, dọn màn hình để bắt đầu đơn mới, không mất lịch sử.

### 1.2 Thuật ngữ (glossary, dùng đúng tên này trong code và UI)

| Thuật ngữ | Trong code | Ý nghĩa |
|---|---|---|
| Mã hàng | `ntk` (chuỗi, ví dụ `'106160'`) | Mã sản phẩm, lấy từ cột "NTK No." trong packing list |
| Kế hoạch | `target` | Số lượng cần sản xuất của một mã hàng trong một đơn |
| Đã sản xuất | `produced` | Tổng `qty` của mọi `entries` thuộc mã hàng và batch |
| Hàng lỗi | `defect` / `defect_qty` | Số lượng lỗi, kèm loại lỗi |
| Loại lỗi | `defect_types` | Giá trị hợp lệ: `yellow` (Thẻ vàng), `red` (Thẻ đỏ), `tear` (Rách bọc) |
| Dây chuyền | `line` | `manual` (Thủ công) hoặc `auto` (Tự động) |
| PO | `po` | Số đơn đặt hàng. Một mã hàng có thể thuộc nhiều PO, nối bằng `+`, ví dụ `'2600168+2600189'` |
| Container | `containersData[]` | Cont chứa các kiện. Có `id` (`c1`, `c2`, `c3`), `label`, `po` |
| Kiện / Pallet | `pallets[]`, `no` | Một pallet trong container. Có thể chứa 1 hoặc nhiều loại hàng |
| Nhật ký / Entry | bảng `entries` | Một lần nhập sản lượng |
| Đơn hàng / Batch | bảng `order_batches` | Một chu kỳ làm việc. Có `status`: `active` hoặc `archived` |
| Lưu trữ / Archive | `status = 'archived'` | Batch đã hoàn tất, dữ liệu giữ nguyên, chỉ đọc |

### 1.3 Dữ liệu tĩnh (seed) là một phần của spec

`src/data/seed.js` chứa `seedItems` (8 mã hàng + kế hoạch) và `containersData` (3 container, 26 kiện). Đây là dữ liệu nghiệp vụ lấy từ packing list, **nằm trong code, không nằm trong DB**. Chỉ `items` (bản sao của `seedItems` theo từng batch) được ghi vào DB.

Số liệu chuẩn để kiểm thử (fixture):

| Chỉ số | Giá trị |
|---|---|
| Tổng kế hoạch (8 mã) | **8.030** (hiển thị `8,030` hoặc `8.030` tuỳ locale) |
| Tổng số kiện | **26** (Container 1: 10, Container 2: 5, Container gộp: 11) |
| Tổng pcs theo container | c1 = 3.540, c2 = 1.260, c3 = 3.230 (tổng 8.030) |

---

## 2. Công nghệ và ràng buộc

| Hạng mục | Quyết định |
|---|---|
| Framework | Expo SDK 57, React Native, Expo Router (thư mục `src/app/`) |
| Ngôn ngữ | File route (`src/app/**`) là `.tsx` theo template. Mọi file còn lại trong `src/` là `.js`. Code mới có thể dùng `.js`/`.jsx`, không bắt buộc TypeScript |
| CSDL | `expo-sqlite` (API async: `openDatabaseAsync`, `execAsync`, `runAsync`, `getFirstAsync`, `getAllAsync`, `withTransactionAsync`) |
| State | `zustand` (một store: `useAppStore`) |
| Điều hướng | Bottom tabs của Expo Router: `index` (Mã hàng), `containers`, `history` |
| Alias | `@/*` trỏ tới `./src/*` (cấu hình trong `tsconfig.json`, KHÔNG được xoá) |
| Picker | `@react-native-picker/picker` |
| Theme | `src/theme.js`: `light`/`dark`, chọn theo `useColorScheme()` |
| Mạng | Không có. Không gọi API, không analytics |
| Chạy | `npx expo start`. Xoá cache khi lạ: `npx expo start -c` |

**Chính sách thư viện:** thêm thư viện phải dùng `npx expo install <pkg>` (để đúng phiên bản SDK), phải nêu rõ lý do trong spec tính năng, và phải ghi chú nếu là **native module** (cần `npx expo run:android|ios`, có thể không chạy trong Expo Go).

---

## 3. Kiến trúc và quy tắc phân tầng

```
┌────────────────────────────────────────────────────────────┐
│ src/app/**  (route)   chỉ re-export màn hình, khai báo tab │
└───────────────┬────────────────────────────────────────────┘
                ▼
┌────────────────────────────────────────────────────────────┐
│ src/screens/**   ghép component, đọc state từ store        │
│ src/components/** hiển thị + form cục bộ                   │
└───────────────┬────────────────────────────────────────────┘
                ▼   (ghi dữ liệu: chỉ qua store action)
┌────────────────────────────────────────────────────────────┐
│ src/store/useAppStore.js   state + action async + selector │
└───────────────┬────────────────────────────────────────────┘
                ▼
┌────────────────────────────────────────────────────────────┐
│ src/db/queries.js   SQL + hàm thuần liên quan pallet       │
│ src/db/index.js     mở DB, khởi tạo, seed batch đầu tiên   │
│ src/db/schema.js    CREATE TABLE (baseline v1)             │
└───────────────┬────────────────────────────────────────────┘
                ▼
┌────────────────────────────────────────────────────────────┐
│ src/data/seed.js    dữ liệu tĩnh (seedItems, containersData)│
│ src/theme.js        token màu                              │
└────────────────────────────────────────────────────────────┘
```

**Quy tắc phụ thuộc (chiều import chỉ đi xuống):**

- `db/*` không được import `store`, `screens`, `components`, `app`.
- `store` không được import `screens`, `components`, `app`.
- `components` không import `screens`, `app`.
- Component **được phép gọi hàm đọc** (`fetch*`) của `queries.js` (hiện có: `ItemCard`, `ArchiveCard`, `HistoryScreen`). Component **không được gọi hàm ghi** (`addEntry`, `updateEntry`, `removeEntry`, `setPalletStatus`, `finishOrder`) trực tiếp. Phải đi qua store.
- **DB là nguồn sự thật.** Sau mỗi thao tác ghi, store nạp lại từ DB (`refreshItems`, v.v.), không tự cộng trừ trong bộ nhớ.

---

## 4. Cấu trúc thư mục và mức bảo vệ

### 4.1 Bản đồ file

```
src/
├── app/
│   ├── _layout.tsx              Root layout: init DB, màn loading, Stack
│   └── (tabs)/
│       ├── _layout.tsx          Khai báo 3 tab
│       ├── index.tsx            → ItemsScreen
│       ├── containers.tsx       → ContainersScreen
│       └── history.tsx          → HistoryScreen
├── theme.js                     token màu light/dark, getTheme()
├── data/seed.js                 seedItems, containersData
├── db/
│   ├── index.js                 getDb(), getActiveBatchId(), ensureActiveBatch()
│   ├── schema.js                CREATE_TABLES_SQL (baseline v1)
│   └── queries.js               toàn bộ truy vấn + isPalletDone/countPalletsDone
├── store/useAppStore.js         useAppStore + pctClass/allPOs/filteredItems/summaryTotals
├── components/                  ProgressBar, FilterChips, SummaryCards,
│                                ItemCard, EntryLogRow, PalletRow, ArchiveCard
└── screens/                     ItemsScreen, ContainersScreen, HistoryScreen
```

### 4.2 Mức bảo vệ

| Ký hiệu | Ý nghĩa | File |
|---|---|---|
| 🔒 **Đóng băng** | Không sửa hành vi/chữ ký/cấu trúc nếu chưa có spec Cấp 3 được duyệt. Chỉ được **thêm** | `db/schema.js` (baseline v1), `data/seed.js` (cấu trúc), `db/queries.js` (chữ ký hiện có), `store/useAppStore.js` (tên state/action/selector hiện có) |
| 🟡 **Cẩn trọng** | Được sửa để thêm tính năng, nhưng phải giữ mọi Acceptance Criteria hiện có | `db/index.js`, `screens/*`, `components/ItemCard.js`, `components/PalletRow.js`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx` |
| 🟢 **Tự do** | Sửa/thêm thoải mái trong phạm vi tính năng | `components/*` còn lại, `theme.js` (thêm token, không đổi giá trị token cũ), file mới trong `src/utils/`, `src/components/`, `specs/` |

> Route `src/app/(tabs)/*.tsx` là 🔒: mỗi file đúng 1 dòng re-export. Muốn thêm tab mới, thêm file route mới và `Tabs.Screen` mới.

---

## 5. Mô hình dữ liệu (schema baseline v1)

### 5.1 Bảng

**`order_batches`**: một đơn hàng/chu kỳ làm việc.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `status` | TEXT NOT NULL DEFAULT `'active'` | `'active'` hoặc `'archived'` |
| `finished_date` | TEXT | `YYYY-MM-DD`, chỉ có khi archived |
| `total_target`, `total_produced`, `total_defect` | INTEGER | Số tổng, chốt lúc hoàn tất. Với batch active, `total_target` được đặt lúc tạo |
| `pallets_done`, `pallets_total` | INTEGER | Chốt lúc hoàn tất |

**`items`**: mã hàng theo từng batch. PK `(ntk, order_batch_id)`. Cột: `ntk`, `po`, `target`, `order_batch_id`.

**`entries`**: nhật ký sản xuất (bảng tăng nhanh nhất).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `ntk` | TEXT NOT NULL | |
| `order_batch_id` | INTEGER NOT NULL | |
| `date` | TEXT NOT NULL | Định dạng `YYYY-MM-DD` (xem BUG-02) |
| `qty` | INTEGER NOT NULL DEFAULT 0 | Số lượng sản xuất |
| `line` | TEXT DEFAULT `'manual'` | `manual` hoặc `auto` |
| `defect_qty` | INTEGER DEFAULT 0 | |
| `defect_types` | TEXT DEFAULT `''` | Chuỗi cách nhau bằng dấu phẩy, không khoảng trắng, ví dụ `'yellow,tear'` |

Index: `idx_entries_date(date)`, `idx_entries_ntk(ntk, order_batch_id)`, `idx_entries_batch(order_batch_id)`.

**`pallet_status`**: trạng thái đóng kiện.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `key` | TEXT PRIMARY KEY | ⚠️ Xem BUG-01. Định dạng key ở 5.2 |
| `order_batch_id` | INTEGER NOT NULL | |
| `done` | INTEGER DEFAULT 0 | 0/1 |

### 5.2 Định dạng key pallet (BẤT BIẾN, không đổi)

| Loại kiện | Key | Ví dụ |
|---|---|---|
| Kiện 1 loại hàng | `` `${containerId}-${palletNo}` `` | `'c1-3'` |
| Từng loại hàng trong kiện nhiều loại | `` `${containerId}-${palletNo}-${itemIndex}` `` | `'c1-2-0'`, `'c1-2-1'` |

`itemIndex` là chỉ số (bắt đầu từ 0) của phần tử trong `pallet.items`. **Đổi thứ tự phần tử trong `seed.js` sẽ làm lệch dữ liệu đã lưu.**

### 5.3 Quan hệ và vòng đời batch

- Luôn có **đúng một** `order_batches` với `status='active'` (INV-B1).
- `entries`, `items`, `pallet_status` đều gắn `order_batch_id`.
- "Hoàn tất đơn hàng" **không copy dữ liệu**: chỉ `UPDATE` batch cũ thành `archived` (kèm số tổng), rồi `INSERT` batch mới và nạp lại `seedItems` cho batch mới.
- Lịch sử (tab Lịch sử) truy vấn **toàn bộ** `entries` của mọi batch.

---

## 6. Hợp đồng API nội bộ (không đổi chữ ký)

### 6.1 `src/db/index.js`

| Hàm | Trả về | Ghi chú |
|---|---|---|
| `getDb()` | `SQLiteDatabase` (singleton) | Lần đầu: mở `production_tracker.db`, chạy schema, đảm bảo có batch active (nạp seed nếu chưa có) |
| `getActiveBatchId(db)` | `number` | id của batch active |

### 6.2 `src/db/queries.js`

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
| `countPalletsDone(palletDoneMap)` | (hàm thuần) | `{done, total}` trên toàn bộ `containersData` |
| `fetchHistoryGrouped(groupBy, filterValue)` | `groupBy ∈ 'day'|'month'|'year'` | `[{groupKey,total,manualTotal,autoTotal,defectTotal}]`, `groupKey` giảm dần |
| `fetchHistoryDetail(groupBy, groupKey)` | | `day`: từng dòng entry. `month`/`year`: gộp theo `ntk` (`qty`, `defect_qty`) |
| `fetchAvailableYears()` | | `['2026', ...]` (dành cho bộ lọc năm, chưa có UI) |
| `fetchArchives()` | | Các batch `archived`, mới nhất trước |
| `fetchArchiveItems(batchId)` | | `[{ntk,target,produced,defect}]` |
| `finishOrder()` | | Lưu trữ batch active, tạo batch mới, trả `newBatchId` |

### 6.3 `src/store/useAppStore.js`

**State:** `ready`, `batchId`, `items`, `palletDoneMap`, `archives`, `activeFilter`, `activeStatusFilter`, `activeContainerFilter`, `searchQuery`, `historyGroup`, `historyFilterValue`.

**Action (async):** `init()`, `refreshItems()`, `addEntry(ntk, payload)`, `updateEntry(entryId, payload)`, `removeEntry(entryId)`, `togglePallet(key, currentlyDone)`, `finishOrder()`.

**Action (đồng bộ):** `setFilter`, `setStatusFilter`, `setContainerFilter`, `setSearchQuery`, `setHistoryGroup` (đồng thời xoá `historyFilterValue`), `setHistoryFilterValue`.

**Selector/hàm thuần export:** `pctClass(pct)`, `allPOs(items)`, `filteredItems(state)`, `summaryTotals(items)`, và re-export `containersData`.

### 6.4 Component (props)

| Component | Props |
|---|---|
| `ProgressBar` | `{pct, color?, theme}` |
| `FilterChips` | `{options: [[value,label],...], activeValue, onSelect, theme}` |
| `SummaryCards` | `{totals:{totalTarget,totalProduced,overallPct,totalDefect}, theme}` |
| `EntryLogRow` | `{entry, onEdit, onDelete, theme}` |
| `ItemCard` | `{item, theme, onAddEntry, onUpdateEntry, onDeleteEntry}` (cần `item.order_batch_id`) |
| `PalletRow` | `{containerId, pallet, palletDoneMap, onTogglePallet, theme}` |
| `ArchiveCard` | `{archive, theme}` |

### 6.5 Token theme

`bg, card, ink, sub, accent, good, warn, bad, line` (cả `light` và `dark`). Thêm token mới phải thêm ở **cả hai** bảng màu.

---

## 7. Đặc tả hành vi (Acceptance Criteria)

> Định dạng: **AC-<tab>-<số>**. Trạng thái: ✅ đã cài đặt · 🟡 một phần · ⬜ chưa làm. Agent **không được làm sai lệch** các AC ✅ khi thêm tính năng.

### 7.1 Tab "Mã hàng" (`ItemsScreen`, `ItemCard`)

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-ITEM-01 | ✅ | **Tổng quan** gồm 4 ô: Kế hoạch = Σ`target`; Đã sản xuất = Σ`produced`; Hoàn thành = `Math.round(produced/target*1000)/10` (%) hoặc `0` nếu `target=0`; Hàng lỗi = Σ`defect` (màu `bad`). Thanh tiến độ rộng `min(pct,100)%` |
| AC-ITEM-02 | ✅ | Thẻ mã hàng hiện `Mã {ntk}`, `PO {po}`, phần trăm (1 chữ số thập phân). Màu %: `≥100` → `good`; `≥60` → `warn`; còn lại → `bad` (`pctClass`) |
| AC-ITEM-03 | ✅ | Hiện `Kế hoạch`, `Đã làm`, `Còn lại = max(target − produced, 0)`, `Lỗi` |
| AC-ITEM-04 | ✅ | Chạm tiêu đề thẻ để mở/đóng. Trạng thái mở/đóng là state cục bộ, không mất khi dữ liệu nạp lại |
| AC-ITEM-05 | ✅ | **Thêm nhật ký:** `qty = parseFloat(input)‖0`, `defectQty = parseFloat(input)‖0`. Nếu `qty ≤ 0` **và** `defectQty ≤ 0` thì **không làm gì** (không lỗi, không ghi DB). Ngược lại ghi 1 dòng với `date` = hôm nay, `line` đã chọn, `defectQty`, `defectTypes` |
| AC-ITEM-06 | ✅ | Sau khi thêm: xoá ô nhập, bỏ chọn loại lỗi, mở khung nhật ký và tải lại danh sách, số liệu thẻ và tổng quan cập nhật ngay |
| AC-ITEM-07 | ✅ | `line` mặc định `manual` ("Thủ công"); tuỳ chọn `auto` ("Tự động") |
| AC-ITEM-08 | ✅ | **Loại lỗi** (Thẻ vàng / Thẻ đỏ / Rách bọc) chọn nhiều, không bắt buộc |
| AC-ITEM-09 | ✅ | **Nhật ký:** mới nhất trước; mỗi dòng: `{date} — {qty} pcs · {Thủ công/Tự động}`, thêm `· Lỗi {n}` và tên loại lỗi nếu có |
| AC-ITEM-10 | ✅ | **Xoá dòng nhật ký** phải xác nhận ("Bạn có chắc muốn xoá mục này không?"). Huỷ = không đổi gì. Xác nhận: xoá, tải lại nhật ký, cập nhật số liệu |
| AC-ITEM-11 | 🟡 | **Sửa dòng nhật ký:** nút "Sửa" có, nhưng mới chỉ set `editingId`, **chưa có form sửa** (FEAT-01). Khi làm: sửa được `date`, `qty`, `line`, `defectQty`, `defectTypes`; validate như AC-ITEM-05; lưu phải xác nhận |
| AC-ITEM-12 | ✅ | **Tìm kiếm:** khớp chuỗi con, không phân biệt hoa thường, trên `ntk` |
| AC-ITEM-13 | ✅ | **Lọc PO:** chip "Tất cả PO" + mỗi PO riêng lẻ (tách `po` theo `+`, loại trùng). Mã hàng khớp nếu `po.split('+')` chứa PO đang chọn |
| AC-ITEM-14 | ✅ | **Lọc trạng thái:** `Tất cả` / `Chưa hoàn thành` / `Đã xong`. "Đã xong" nghĩa là `target > 0 && produced ≥ target` |
| AC-ITEM-15 | ✅ | Ba bộ lọc kết hợp bằng **AND**. Không có kết quả hiện "Không tìm thấy mã hàng nào." |

### 7.2 Tab "Container" (`ContainersScreen`, `PalletRow`, `ArchiveCard`)

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-CONT-01 | ✅ | Chip lọc PO (từ `containersData`). Container hiện khi `po.split('+')` chứa PO đang chọn |
| AC-CONT-02 | ✅ | **Kiện 1 loại hàng:** chạm cả dòng để đổi trạng thái, luôn hỏi xác nhận. Đang xong → hỏi "bỏ đánh dấu"; chưa xong → hỏi "đã đóng xong". Huỷ = không đổi. Key: `${cid}-${no}` |
| AC-CONT-03 | ✅ | **Kiện nhiều loại hàng:** tick từng loại (key `${cid}-${no}-${idx}`), mỗi lần đều xác nhận. Kiện được coi là **xong khi mọi loại con đã tick** (`isPalletDone`). Không tick trực tiếp cả kiện |
| AC-CONT-04 | ✅ | **Thống kê container:** `done/total kiện`; `% = Math.round(done/total*1000)/10`; `doneQty/totalQty pcs` (chỉ cộng kiện đã xong); khi đủ kiện hiện "Sẵn sàng đóng container ✓" và thanh chuyển màu `good` |
| AC-CONT-05 | ✅ | Mở/đóng container bằng chạm tiêu đề. State cục bộ |
| AC-CONT-06 | ✅ | **Hoàn tất đơn hàng:** hộp cuối trang hiện `done/total` kiện (toàn cục, **không** phụ thuộc bộ lọc PO). Bấm nút → xác nhận với 2 mẫu thông điệp (chưa đủ kiện: cảnh báo số kiện; đủ kiện: xác nhận thường). Huỷ = không đổi |
| AC-CONT-07 | ✅ | **Sau khi xác nhận hoàn tất:** (a) batch cũ → `archived` cùng `finished_date`, `total_target/produced/defect`, `pallets_done/total`; (b) tạo batch active mới với `seedItems` và 0 nhật ký; (c) `palletDoneMap` rỗng; (d) danh sách lưu trữ có thêm đơn mới nhất ở đầu; (e) **không mất dòng lịch sử nào** |
| AC-CONT-08 | ✅ | **Đơn đã lưu trữ:** thẻ `Hoàn tất ngày {finished_date}`, dòng phụ `produced/target pcs · done/total kiện · Lỗi n`; chạm để mở danh sách `Mã {ntk}: produced/target pcs · Lỗi n` |

### 7.3 Tab "Lịch sử" (`HistoryScreen`)

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-HIST-01 | ✅ | Nhóm theo **ngày** (`YYYY-MM-DD`), **tháng** (`Tháng MM/YYYY`), **năm** (`Năm YYYY`), tính bằng SQL (`substr(date,…)`, `GROUP BY`), sắp giảm dần theo khoá |
| AC-HIST-02 | ✅ | Mỗi nhóm hiện tổng pcs, `Thủ công`, `Tự động`, `Lỗi` (Σ`defect_qty`). Bao gồm entries của **mọi batch** (đang chạy và đã lưu trữ) |
| AC-HIST-03 | ✅ | Mở nhóm: `day` → từng dòng (`Mã {ntk} — {qty} pcs`, lỗi nếu có); `month`/`year` → gộp theo `ntk` (`{qty} pcs · Lỗi n`) |
| AC-HIST-04 | ✅ | Đổi kiểu nhóm thì xoá `historyFilterValue` và trạng thái mở |
| AC-HIST-05 | ✅ | Không có dữ liệu hiện "Chưa có dữ liệu sản xuất nào được ghi nhận." |
| AC-HIST-06 | ⬜ | Lọc theo một ngày/tháng/năm cụ thể (FEAT-02). `historyFilterValue` và `fetchHistoryGrouped(groupBy, filterValue)` đã hỗ trợ, thiếu UI |
| AC-HIST-07 | ⬜ | Tab Lịch sử phải **tự cập nhật** khi có dữ liệu mới (xem BUG-05) |

### 7.4 Toàn cục

| ID | Trạng thái | Hành vi |
|---|---|---|
| AC-APP-01 | ✅ | Khởi động: hiện màn "Đang tải dữ liệu..." cho tới khi `init()` xong |
| AC-APP-02 | ✅ | Lần chạy đầu tự tạo batch active và nạp `seedItems` (8 mã hàng, 0 sản lượng) |
| AC-APP-03 | ✅ | Tắt hẳn app rồi mở lại: mọi dữ liệu còn nguyên |
| AC-APP-04 | ✅ | Giao diện theo hệ thống sáng/tối bằng `useColorScheme()` và `theme` |
| AC-APP-05 | ✅ | Hoạt động hoàn toàn không cần mạng |

---

## 8. Bất biến (Invariants), không được phá

| ID | Bất biến |
|---|---|
| INV-B1 | Luôn có đúng 1 dòng `order_batches.status='active'` sau mọi thao tác |
| INV-B2 | Dữ liệu của batch `archived` không bị sửa/xoá từ giao diện |
| INV-B3 | `finishOrder` không được để hệ thống ở trạng thái nửa vời (cần chạy trong transaction, xem BUG-03) |
| INV-D1 | **Nhất quán seed:** với mỗi `ntk`, tổng `qty` của mọi kiện trong `containersData` phải **bằng** `target` trong `seedItems`. Tổng toàn bộ = 8.030. Sửa `seed.js` xong phải kiểm tra lại |
| INV-D2 | `date` luôn là chuỗi `YYYY-MM-DD` (sắp xếp theo chữ cái = sắp xếp theo thời gian) |
| INV-D3 | `line ∈ {manual, auto}`; `defect_types` chỉ chứa `yellow`/`red`/`tear`, cách nhau dấu phẩy |
| INV-D4 | Định dạng key pallet ở mục 5.2 không đổi; không đổi thứ tự `items` trong pallet đã có |
| INV-D5 | Không có `entries` mồ côi (`order_batch_id` phải tồn tại) |
| INV-U1 | Hành động phá huỷ/đảo trạng thái luôn có bước xác nhận |
| INV-U2 | Chuỗi giao diện bằng tiếng Việt, giữ nguyên các nhãn ở mục 7 |
| INV-A1 | Dữ liệu nghiệp vụ chỉ ở SQLite; không có network |
| INV-A2 | Chiều phụ thuộc giữa các tầng theo mục 3 |

---

## 9. Lỗi đã biết và nợ kỹ thuật

> Các lỗi dưới đây được phát hiện khi đối chiếu code với hành vi mong muốn. **Nên xử lý theo thứ tự ưu tiên trước khi thêm tính năng lớn** vì chúng ảnh hưởng độ tin cậy dữ liệu. Sửa lỗi cũng phải theo quy trình mục 0.1.

| ID | Ưu tiên | Mô tả | Hướng sửa |
|---|---|---|---|
| **BUG-01** | 🔴 P0 | `pallet_status.key` là PRIMARY KEY **một mình**, còn `setPalletStatus` upsert `ON CONFLICT(key)`. Sau khi hoàn tất đơn, key `'c1-1'`… của batch mới trùng key cũ: `done` bị ghi đè vào dòng của **batch cũ** (giữ nguyên `order_batch_id` cũ), nên `fetchPalletStatus(batchMới)` không thấy. Hệ quả: đơn thứ hai không tick lại được các kiện đã từng tick ở đơn trước, và dòng dữ liệu batch archived bị sửa (vi phạm INV-B2) | Migration v2: tạo lại bảng với `PRIMARY KEY (key, order_batch_id)` và đổi upsert thành `ON CONFLICT(key, order_batch_id)` (mã ở 10.2) |
| **BUG-02** | 🟠 P1 | Ngày được lấy bằng `new Date().toISOString().slice(0,10)` (giờ UTC). Ở Việt Nam (UTC+7), nhập từ 00:00 đến 06:59 sáng bị ghi thành **ngày hôm trước**. Cũng sai cho `finished_date` | Tạo `src/utils/date.js` với `todayLocal()` (mã ở mục 10.3), dùng ở `ItemCard.handleAdd` và `queries.finishOrder` |
| **BUG-03** | 🟠 P1 | `finishOrder` gồm nhiều lệnh ghi liên tiếp nhưng **không nằm trong transaction**. Nếu app bị tắt giữa chừng có thể không có batch active (vi phạm INV-B1) | Bọc thân hàm trong `db.withTransactionAsync(async () => { ... })` |
| **BUG-04** | 🟡 P2 | `ItemCard.handleAdd` vẫn lưu `defectTypes` khi `defectQty = 0` (bản HTML gốc chỉ lưu khi `defectQty > 0`) | `defectTypes: dq > 0 ? types : []` |
| **BUG-05** | 🟠 P1 | `HistoryScreen` chỉ nạp lại khi đổi `historyGroup`/`historyFilterValue`. Tab trong Expo Router vẫn được giữ mounted, nên sau khi nhập thêm ở tab Mã hàng, quay lại Lịch sử thấy **số cũ** | Thêm `dataVersion` (số nguyên) vào store, tăng sau mỗi action ghi (`addEntry`, `updateEntry`, `removeEntry`, `finishOrder`), và thêm `dataVersion` vào dependency của `useEffect` trong `HistoryScreen` |
| **BUG-06** | 🟡 P2 | `ItemsScreen` dùng `key={item.ntk}`. Sau `finishOrder`, `ItemCard` cũ được tái sử dụng nên khung nhật ký (state cục bộ) có thể còn hiện dòng của đơn đã lưu trữ | Đổi thành `` key={`${item.order_batch_id}-${item.ntk}`} `` |
| **UX-01** | 🟢 P3 | `HistoryScreen` dùng `onTouchEnd` trên `View` để mở/đóng nhóm (kém tin cậy, không có phản hồi chạm) | Đổi sang `TouchableOpacity`/`Pressable` |
| **DEBT-01** | 🟢 P3 | `PRAGMA journal_mode = WAL` nằm trong `CREATE_TABLES_SQL`. Khi chuyển sang migration trong transaction, lệnh này phải chuyển ra ngoài transaction | Chạy `PRAGMA journal_mode = WAL` riêng trong `getDb()` trước khi chạy migration |
| **DEBT-02** | 🟢 P3 | `containersData` nằm cứng trong code; đơn hàng mới có container khác phải sửa code | Xem FEAT-07 (cần thiết kế riêng, Cấp 3) |
| **DEBT-03** | 🟢 P3 | Chưa có test tự động | Xem mục 11.2 |

---

## 10. Quy trình thay đổi

### 10.1 Phân cấp thay đổi

| Cấp | Loại | Ví dụ | Yêu cầu |
|---|---|---|---|
| **0** | Văn bản/kiểu dáng thuần | Sửa chữ, chỉnh khoảng cách | Không cần spec tính năng; vẫn chạy checklist nhanh |
| **1** | Thêm mới, không đụng hành vi cũ | Thêm component, màn hình, tab mới, hàm tiện ích, hàm query mới | Spec tính năng + checklist hồi quy đầy đủ. Chỉ sửa file 🟡 để đăng ký (thêm tab, thêm nút) |
| **2** | Thay đổi dữ liệu | Thêm bảng/cột/index | Tất cả của Cấp 1 + **migration** (10.2) + kiểm thử nâng cấp từ DB có dữ liệu |
| **3** | Sửa hành vi đã có / sửa file 🔒 / sửa lỗi ở mục 9 | Đổi công thức %, đổi luồng hoàn tất đơn | **Bắt buộc có chỉ đạo rõ của chủ dự án.** Sửa spec (AC) trước, code sau, cập nhật changelog |

### 10.2 Quy trình migration (bắt buộc khi đụng schema)

Hiện tại DB dùng `CREATE TABLE IF NOT EXISTS` và **chưa có version**. Bước đầu tiên (một lần, Cấp 2) là thêm cơ chế migration, giữ nguyên `schema.js` làm baseline v1.

```js
// src/db/migrations.js  (🟢 file mới)
import { CREATE_TABLES_SQL } from './schema';

// Quy tắc: KHÔNG sửa migration đã phát hành. Chỉ thêm migration mới ở cuối, version tăng dần.
export const MIGRATIONS = [
  {
    version: 1, // baseline: schema hiện tại (IF NOT EXISTS nên an toàn với DB đã có dữ liệu)
    up: async (db) => { await db.execAsync(CREATE_TABLES_SQL_WITHOUT_PRAGMA); },
  },
  {
    version: 2, // BUG-01: khoá chính pallet_status phải gồm cả order_batch_id
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE pallet_status_new (
          key TEXT NOT NULL,
          order_batch_id INTEGER NOT NULL,
          done INTEGER DEFAULT 0,
          PRIMARY KEY (key, order_batch_id)
        );
        INSERT INTO pallet_status_new (key, order_batch_id, done)
          SELECT key, order_batch_id, done FROM pallet_status;
        DROP TABLE pallet_status;
        ALTER TABLE pallet_status_new RENAME TO pallet_status;
        CREATE INDEX IF NOT EXISTS idx_pallet_batch ON pallet_status(order_batch_id);
      `);
    },
  },
];

export async function runMigrations(db) {
  const row = await db.getFirstAsync('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      await db.withTransactionAsync(async () => {
        await m.up(db);
        await db.execAsync(`PRAGMA user_version = ${m.version}`);
      });
    }
  }
}
```

Ghi chú áp dụng:

- `CREATE_TABLES_SQL_WITHOUT_PRAGMA` là `CREATE_TABLES_SQL` đã bỏ dòng `PRAGMA journal_mode = WAL;`. Lệnh WAL chạy riêng trong `getDb()` **trước** `runMigrations` (DEBT-01).
- Trong `getDb()`: mở DB, chạy WAL, gọi `runMigrations(db)`, rồi `ensureActiveBatch(db)`.
- Khi thêm cột: dùng `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` (an toàn, giữ dữ liệu). Không xoá/đổi tên cột đang dùng trong migration thông thường.
- Sau khi cài migration v2, đổi `setPalletStatus` sang `ON CONFLICT(key, order_batch_id) DO UPDATE SET done = excluded.done`.
- **Bắt buộc kiểm thử nâng cấp:** tạo dữ liệu bằng bản cũ (nhập nhật ký, tick kiện, hoàn tất 1 đơn), cài bản mới, mở app, xác nhận toàn bộ dữ liệu còn nguyên.

### 10.3 Mã sửa lỗi mẫu

```js
// src/utils/date.js  (BUG-02)
export function todayLocal() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
```

```js
// BUG-05: store
dataVersion: 0,
// trong mỗi action ghi, sau khi refresh:
set((s) => ({ dataVersion: s.dataVersion + 1 }));

// HistoryScreen: useEffect(..., [historyGroup, historyFilterValue, dataVersion]);
```

### 10.4 Định nghĩa hoàn thành (Definition of Done)

Một thay đổi chỉ hoàn thành khi **tất cả** đúng:

- [ ] Có spec tính năng (Cấp ≥1) và mọi AC mới đều kiểm chứng được.
- [ ] Không vi phạm 10 quy tắc vàng (0.2) và các bất biến (mục 8).
- [ ] Không sửa file 🔒 ngoài phạm vi được phép; không đổi chữ ký API mục 6.
- [ ] Import nội bộ dùng `@/`; đúng chiều phụ thuộc (mục 3).
- [ ] Nếu đụng schema: có migration + đã kiểm thử nâng cấp.
- [ ] App khởi động không lỗi (`npx expo start -c`), không có cảnh báo/lỗi đỏ mới trong Metro.
- [ ] Checklist hồi quy mục 11.1 chạy đủ, kết quả ghi trong phần trả lời (RC nào đạt, RC nào không chạy được và vì sao).
- [ ] Spec này đã cập nhật: mục 12 (Registry), mục 15 (Changelog), AC nếu hành vi đổi có chủ đích.

---

## 11. Kiểm thử hồi quy

### 11.1 Checklist thủ công (chạy trên DB mới, sau mỗi thay đổi)

| ID | Bước | Kết quả mong đợi |
|---|---|---|
| RC-01 | Cài mới, mở app | Loading rồi 4 ô: Kế hoạch `8.030`, Đã SX `0`, `0%`, Lỗi `0`; 8 mã hàng |
| RC-02 | Mã `106160`: mở thẻ, nhập `100`, Thủ công, bấm Thêm | Đã làm `100`, Còn lại `900`, `10%` (màu `bad`). Tổng quan: Đã SX `100`, `1.2%`. Nhật ký hiện `{hôm nay} — 100 pcs · Thủ công` |
| RC-03 | Nhập `50`, Tự động, lỗi `5`, chọn "Thẻ vàng", Thêm | Đã làm `150`; Lỗi `5` (thẻ và tổng quan); dòng nhật ký mới hiện `· Lỗi 5 (Thẻ vàng)`, nằm trên dòng cũ |
| RC-04 | Nhập `0` (lỗi để trống), Thêm | Không có gì thay đổi, không lỗi (AC-ITEM-05) |
| RC-05 | Xoá dòng `50`, bấm Huỷ rồi Xoá lại và xác nhận | Huỷ: không đổi. Xác nhận: Đã làm `100`, lỗi `0` |
| RC-06 | Tìm `1063`, lọc PO `2600168`, lọc "Chưa hoàn thành" | Chỉ các mã chứa `1063` thuộc PO 2600168; bỏ từng bộ lọc thì danh sách nới ra |
| RC-07 | Tab Container → Container 1 → Kiện 1 (1 loại) → Xác nhận | `1/10 kiện`, `10%`, `660/3.540 pcs đã đóng` |
| RC-08 | Bấm lại Kiện 1 → Huỷ; rồi bấm lại → Xác nhận | Huỷ: giữ nguyên. Xác nhận bỏ tick: `0/10 kiện` |
| RC-09 | Kiện 2 (2 loại): tick chỉ loại đầu | Kiện chưa xong; `0/10` (nếu Kiện 1 chưa tick). Tick nốt loại còn lại: kiện xong, `doneQty` cộng `340` |
| RC-10 | Tick đủ mọi kiện của Container 2 (5 kiện) | `5/5 kiện`, `100%`, thanh xanh, hiện "Sẵn sàng đóng container ✓" |
| RC-11 | Tab Lịch sử → Theo ngày | Có nhóm hôm nay, tổng khớp tổng nhật ký; Thủ công/Tự động/Lỗi đúng |
| RC-12 | Quay lại tab Mã hàng nhập thêm `10`, rồi sang Lịch sử (không đổi nhóm) | Số liệu **đã cập nhật** (AC-HIST-07) |
| RC-13 | Theo tháng / Theo năm, mở nhóm | Nhãn `Tháng MM/YYYY` / `Năm YYYY`; chi tiết gộp theo mã hàng |
| RC-14 | Tab Container → "Hoàn tất đơn hàng hiện tại" → Huỷ | Không đổi gì |
| RC-15 | Như RC-14 nhưng Xác nhận | Màn hình về 0 (Đã SX `0`, mọi kiện chưa tick); có thẻ "Hoàn tất ngày {hôm nay}" ở mục lưu trữ; mở thẻ thấy đúng `produced/target` từng mã |
| RC-16 | Sau RC-15, sang Lịch sử | Các nhật ký của đơn cũ **vẫn còn** (AC-CONT-07e) |
| RC-17 | Sau RC-15, tick lại Kiện 1 của Container 1 (**hồi quy BUG-01**) | Tick thành công, hiển thị `1/10 kiện`; thẻ lưu trữ không đổi |
| RC-18 | Sau RC-15, mở nhật ký của một mã hàng | Nhật ký **trống** (không hiện dòng của đơn cũ, hồi quy BUG-06) |
| RC-19 | Nhập sản lượng trước 07:00 sáng giờ Việt Nam (hoặc đổi giờ máy) | Ngày ghi là ngày **địa phương** (hồi quy BUG-02) |
| RC-20 | Vuốt tắt hẳn app rồi mở lại | Mọi dữ liệu còn nguyên (AC-APP-03) |
| RC-21 | Bật chế độ sáng và tối của hệ điều hành | Cả hai đều đọc rõ, đúng token màu |
| RC-22 | (Nếu đã có migration) nâng cấp từ DB bản cũ có dữ liệu | Mọi dữ liệu còn nguyên, các RC-02..RC-17 vẫn đạt |

### 11.2 Kiểm thử tự động (khuyến nghị bổ sung, Cấp 1)

Cài `jest-expo` và viết test cho **hàm thuần** trước (không cần DB):

| Hàm | Ca kiểm thử tối thiểu |
|---|---|
| `pctClass` | `100→'ok'`, `99.9→'mid'`, `60→'mid'`, `59.9→'low'`, `0→'low'` |
| `summaryTotals` | Danh sách rỗng → `overallPct = 0`; `target=8030, produced=100` → `overallPct = 1.2` |
| `filteredItems` | Kết hợp PO + tìm kiếm + trạng thái (AND); `target=0` không bao giờ là "done" |
| `isPalletDone` | Kiện 1 loại theo key `c1-1`; kiện nhiều loại chỉ true khi đủ mọi key con `c1-2-0`, `c1-2-1` |
| `countPalletsDone` | Map rỗng → `{done:0,total:26}` |
| **Dữ liệu seed (INV-D1)** | Với mỗi `ntk`: Σ qty trên kiện = `target`; tổng = 8030; số kiện = 26; mỗi `containerId` là duy nhất |

Sau đó có thể thêm test truy vấn với SQLite trong bộ nhớ khi cần.

---

## 12. Registry tính năng và Backlog

### 12.1 Đã cài đặt

`F-ITEMS` (tổng quan, thẻ mã hàng, nhập sản lượng/lỗi, nhật ký, lọc/tìm) · `F-CONT` (container/kiện, hoàn tất đơn, lưu trữ) · `F-HIST` (lịch sử ngày/tháng/năm) · `F-APP` (init, persist, theme sáng/tối).

### 12.2 Backlog (thứ tự đề xuất)

| ID | Ưu tiên | Cấp | Tính năng | Ràng buộc chính |
|---|---|---|---|---|
| BUG-01, 03, 02, 05 | P0/P1 | 2–3 | Sửa lỗi mục 9 (làm trước khi thêm tính năng) | Cần chỉ đạo Cấp 3; BUG-01 cần migration |
| FEAT-01 | P1 | 1 | **Form sửa nhật ký** (Modal): sửa `date`, `qty`, `line`, `defectQty`, `defectTypes` | Dùng sẵn `updateEntry`/`updateEntry` của store; lưu phải xác nhận; validate như AC-ITEM-05; chỉ sửa entry của batch active; cập nhật tổng ngay |
| FEAT-02 | P2 | 1 | **Lọc lịch sử** theo ngày/tháng/năm cụ thể | Dùng `setHistoryFilterValue`; ngày `YYYY-MM-DD`, tháng `YYYY-MM`, năm `YYYY` phải khớp `groupKey`; có nút "Xoá lọc"; đổi nhóm thì reset lọc (AC-HIST-04) |
| FEAT-03 | P2 | 1 | **Sao lưu/xuất dữ liệu** (CSV từ `entries` và/hoặc chép file `production_tracker.db` qua `expo-file-system` + `expo-sharing`) | Chỉ đọc DB; thư viện mới phải `expo install`; nêu rõ có phải native module hay không |
| FEAT-04 | P3 | 1 | Nút chọn giao diện Sáng/Tối/Theo hệ thống | Lưu bằng `AsyncStorage` (chỉ tuỳ chọn UI); mặc định = theo hệ thống (không đổi AC-APP-04) |
| FEAT-05 | P3 | 0–1 | Hiệu ứng mở/đóng thẻ | `LayoutAnimation` hoặc `reanimated`; không đổi hành vi |
| FEAT-06 | P3 | 1 | Dùng `FlatList` khi danh sách dài (>50) | Giữ nguyên AC-ITEM-04, 12–15 |
| FEAT-07 | P3 | 3 | Container/kế hoạch động (nhập đơn mới không sửa code) | **Thiết kế riêng, cần duyệt:** bảng mới cho containers/pallets/items, giữ định dạng key pallet (5.2), giữ INV-D1, migration từ `seed.js` |
| PARITY-01 | P3 | 1 | Các điểm bản HTML gốc có mà RN chưa có: nút ✕ xoá ô tìm kiếm; thẻ "Đã lưu trữ" trong lịch sử; nhãn màu cho loại lỗi (chip màu như HTML); nhóm theo **tuần** | Chỉ làm khi được yêu cầu, không tự ý thêm |

---

## 13. Mẫu tài liệu cho tính năng mới

Lưu tại `specs/features/FEAT-xxx-ten-ngan.md`. **Không viết code trước khi mục 1 đến 5 được chủ dự án đồng ý.**

```markdown
# FEAT-xxx — <Tên tính năng>

## 1. Bối cảnh & mục tiêu
- Vấn đề người dùng gặp:
- Kết quả mong muốn (đo được):

## 2. Phạm vi
- Làm: 
- KHÔNG làm (non-goals):
- Cấp thay đổi (0/1/2/3):

## 3. Acceptance Criteria (Given / When / Then, có ID)
- AC-<TAB>-xx: Khi ..., thì ...

## 4. Ảnh hưởng dữ liệu
- Bảng/cột mới hoặc đổi: (nếu có → viết migration version N)
- Ảnh hưởng tới dữ liệu cũ: (không / mô tả cách bảo toàn)

## 5. Kế hoạch file
| File | Mức bảo vệ | Hành động (thêm/sửa) | Lý do |
|---|---|---|---|

## 6. Thiết kế
- Luồng dữ liệu (UI → store action → query):
- Hàm/props mới (chữ ký):
- Văn bản UI (tiếng Việt):

## 7. Rủi ro hồi quy
- AC/INV có thể bị ảnh hưởng và cách bảo vệ:

## 8. Kế hoạch kiểm thử
- RC nào phải chạy lại:
- RC mới cần thêm:

## 9. Tiêu chí xong
- [ ] Toàn bộ mục 10.4 của SPEC.md
```

### 13.1 Prompt mẫu giao việc cho AI agent

```
Bạn đang làm việc trên dự án Expo (SDK 57) "Theo dõi sản xuất hàng ngày".
1. Đọc kỹ SPEC.md ở gốc repo, đặc biệt mục 0, 3, 4.2, 5, 8, 9, 10, 11.
2. Nhiệm vụ: <mô tả tính năng / mã FEAT-xxx>.
3. Trước khi viết code: tạo specs/features/FEAT-xxx-*.md theo mẫu ở SPEC.md mục 13 và
   dừng lại chờ tôi duyệt các mục 1-5.
4. Sau khi được duyệt: cài đặt theo từng bước nhỏ, chỉ sửa file trong "Kế hoạch file".
5. Không sửa file 🔒, không đổi chữ ký hàm ở mục 6, không phá bất kỳ AC/INV nào.
6. Kết thúc: chạy checklist hồi quy mục 11.1, báo cáo từng RC (đạt / không chạy được và lý do),
   cập nhật SPEC.md (mục 12, mục 15).
Nếu phát hiện spec mâu thuẫn với code hoặc yêu cầu, DỪNG và hỏi tôi.
```

### 13.2 Gắn spec vào công cụ AI

Tạo file `AGENTS.md` (và/hoặc `CLAUDE.md`) ở gốc repo với nội dung:

```
Đọc SPEC.md trước mọi thay đổi. SPEC.md là nguồn sự thật; tuân thủ mục 0 (quy tắc vàng),
mục 4.2 (mức bảo vệ file) và mục 10 (quy trình thay đổi). Xong việc phải chạy mục 11.1.
```

---

## 14. Nhật ký quyết định kiến trúc (ADR)

| ID | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| ADR-01 | Dùng `expo-sqlite`, không dùng `AsyncStorage` cho dữ liệu nghiệp vụ | Dữ liệu tăng theo năm; cần truy vấn/nhóm/tổng hợp; ghi theo dòng thay vì ghi lại cả blob JSON | Mọi thao tác dữ liệu là async; cần migration khi đổi schema |
| ADR-02 | Lưu trữ đơn hàng bằng `order_batch_id`, không copy dữ liệu | Không phình dung lượng; lịch sử luôn truy vấn được | Mọi bảng dữ liệu đơn đều phải có `order_batch_id` (lưu ý BUG-01) |
| ADR-03 | Expo Router với `src/app/`, route chỉ re-export màn hình | Khớp template SDK 57; giữ logic ngoài thư mục route | Không tạo `App.js`; thêm tab = thêm file route + `Tabs.Screen` |
| ADR-04 | Alias `@/` cho import nội bộ | Tránh sai số cấp `../` khi cấu trúc lồng nhau (đã từng gây lỗi bundling) | Không được xoá `paths` trong `tsconfig.json` |
| ADR-05 | Một store `zustand`, DB là nguồn sự thật | Đơn giản, dễ theo dõi; tránh lệch giữa bộ nhớ và DB | Sau mỗi ghi phải nạp lại từ DB |
| ADR-06 | Seed (`containersData`, `seedItems`) nằm trong code | Dữ liệu đơn hàng hiện tại cố định, ít đổi | Đơn mới cần đổi code (DEBT-02/FEAT-07) |
| ADR-07 | `Alert.alert` cho mọi xác nhận | Tương đương `window.confirm` của bản HTML; tránh chạm nhầm | Callback bất đồng bộ, không trả về boolean |

---

## 15. Changelog

| Ngày | Phiên bản | Thay đổi |
|---|---|---|
| 2026-09-28 | 1.0 | Lập spec ban đầu từ bản HTML gốc và bản cài đặt Expo SDK 57. Ghi nhận BUG-01..06, UX-01, DEBT-01..03 và backlog FEAT-01..07 |

> Mỗi thay đổi sau này: thêm một dòng ở đây, cập nhật mục 12 và các AC liên quan.
