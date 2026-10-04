# SPEC-REFERENCE — Công nghệ, Kiến trúc, Bugs, Registry

> **Từ SPEC.md §1, §2, §3, §4.1, §9, §12, §13.2** — [Quay lại SPEC.md](SPEC.md) | [SPEC-rules.md](SPEC-rules.md) | [SPEC-api.md](SPEC-api.md) | [SPEC-data.md](SPEC-data.md)

---

## §1.1 Mục đích

Công cụ cho xưởng sản xuất theo dõi tiến độ đơn hàng xuất khẩu (PO2600168, PO2600189):

1. **Nhập sản lượng hàng ngày** cho từng mã hàng, tách dây chuyền thủ công/tự động, kèm lỗi.
2. **Theo dõi đóng kiện (pallet)** theo từng container, đánh dấu đã xong.
3. **Xem lịch sử** sản lượng theo ngày/tháng/năm.
4. **Hoàn tất đơn hàng:** lưu trữ đơn hiện tại, dọn màn hình cho đơn mới, không mất lịch sử.

---

## §1.2 Glossary

| Thuật ngữ | Trong code | Ý nghĩa |
|---|---|---|
| Mã hàng | `ntk` (string, `'106160'`) | Mã sản phẩm, từ cột "NTK No." trong packing list |
| Kế hoạch | `target` | Số lượng cần sản xuất trong một đơn |
| Đã sản xuất | `produced` | Tổng `qty` của mọi `entries` thuộc mã hàng + batch |
| Hàng lỗi | `defect` / `defect_qty` | Số lượng lỗi, kèm loại lỗi |
| Loại lỗi | `defect_types` | `yellow` (Thẻ vàng), `red` (Thẻ đỏ), `tear` (Rách bọc) |
| Dây chuyền | `line` | `manual` (Thủ công) hoặc `auto` (Tự động) |
| PO | `po` | Số đơn đặt hàng. Một mã hàng có thể thuộc nhiều PO, nối `+`. Ví dụ `'2600168+2600189'` |
| Container | `containersData[]` | Chứa các kiện. Có `id` (`c1`, `c2`, `c3`) hoặc `HFMU2620080` (imported), `label`, `po` |
| Kiện / Pallet | `pallets[]`, `no` | Một pallet trong container. Có thể chứa 1 hoặc nhiều loại hàng |
| Entry | bảng `entries` | Một lần nhập sản lượng |
| Batch | bảng `order_batches` | Một chu kỳ. Có `status`: `active` hoặc `archived` |
| Archive | `status = 'archived'` | Batch đã hoàn tất, chỉ đọc |

---

## §1.3 Dữ liệu tĩnh (seed)

`src/data/seed.js` chứa `seedItems` (8 mã hàng + kế hoạch) và `containersData` (3 container, 26 kiện). Đây là dữ liệu mặc định của **lần chạy đầu** (`AC-APP-02`). Khi import packing list JSON, cả `items` **và** container/pallet structure được lưu vào DB (`container_data`); `ContainersScreen` dùng DB data, fallback seed khi **chưa có** hàng `container_data` — đơn mới sau `finishOrder` có `data='[]'` nên **không** fallback (`FEAT-14`).

**Fixture numbers (seed):**

| Chỉ số | Giá trị |
|---|---|
| Tổng kế hoạch (8 mã) | **8.030** |
| Tổng số kiện | **26** (c1: 10, c2: 5, c3: 11) |
| Tổng pcs | c1 = 3.540, c2 = 1.260, c3 = 3.230 |

---

## §2. Công nghệ và ràng buộc

| Hạng mục | Quyết định |
|---|---|
| Framework | Expo SDK 57, React Native, Expo Router (`src/app/`) |
| Ngôn ngữ | Route `.tsx` (template); còn lại `.js`/`.jsx` |
| CSDL | `expo-sqlite` (async: `execAsync`, `runAsync`, `getFirstAsync`, `getAllAsync`, `withTransactionAsync`) |
| State | `zustand` (một store: `useAppStore`) |
| Điều hướng | Bottom tabs: `index` (Mã hàng), `containers`, `history` |
| Alias | `@/*` → `./src/*` (tsconfig.json, KHÔNG xoá) |
| Picker | `@react-native-picker/picker` |
| Theme | `src/theme.js`: light/dark, `useColorScheme()` |
| Chạy | `npx expo start`; cache: `npx expo start -c` |

**Thêm thư viện:** dùng `npx expo install` (đúng version SDK); ghi chú nếu là native module.

---

## §3. Kiến trúc và quy tắc phân tầng

```
src/app/**         → route: chỉ re-export màn hình, khai báo tab
     ↓
src/screens/**     → ghép component, đọc state từ store
src/components/**  → hiển thị + form cục bộ
     ↓  (ghi: qua store action)
src/store/**       → state + action async + selector
     ↓
src/db/queries.js  → SQL + hàm pallet
src/db/index.js    → mở DB, khởi tạo, seed
src/db/schema.js   → CREATE TABLE
     ↓
src/data/seed.js   → dữ liệu tĩnh
src/theme.js       → token màu
```

**Chiều import chỉ đi xuống:**
- `db/*` không import `store`/`screens`/`components`/`app`
- `store` không import `screens`/`components`/`app`
- Component được phép gọi `fetch*` (read) của `queries.js`; **không gọi** hàm ghi (`addEntry`, `setPalletStatus`, …) — phải qua store

---

## §4.1 Bản đồ file

```
src/
├── app/
│   ├── _layout.tsx          Root layout: init DB, loading screen, Stack
│   └── (tabs)/
│       ├── _layout.tsx        3 tab
│       ├── index.tsx          → ItemsScreen
│       ├── containers.tsx     → ContainersScreen
│       └── history.tsx        → HistoryScreen
├── theme.js                   token màu
├── data/seed.js               seedItems, containersData
├── utils/                     hàm thuần dùng chung (🟢: validateQty.js — FEAT-09,
│                              palletKey.js — FEAT-10, deleteItem.js — FEAT-11,
│                              poSummary.js — FEAT-12, deleteItemsByPo.js — FEAT-13,
│                              date.js — BUGFIX-02,
│                              archiveDelete.js — FEAT-15,
│                              schemaColumns.js — BUGFIX-08,
│                              packingV1.js / importFormat.js — FEAT-16,
│                              packingV1Import.js — FEAT-17,
│                              itemRows.js — FEAT-19)
├── db/
│   ├── index.js               getDb() (cache promise + schema guard), getActiveBatchId(),
│   │                          ensureActiveBatch()
│   ├── schema.js              CREATE_TABLES_SQL  🔒 (KHÔNG sửa — cài mới đi v1→v2→v3→v4)
│   ├── migrations.js          v1 baseline · v2 PK pallet_status · v3 cột items (FEAT-17) ·
│   │                          v4 bảng item_po (FEAT-18)
│   └── queries.js             truy vấn + pallet helpers
├── store/useAppStore.js       useAppStore + selectors
├── components/                ProgressBar, FilterChips, SummaryCards,
│                              ItemCard, EntryLogRow, PalletRow, ArchiveCard,
│                              ImportJsonButton, PoSummaryTable,
│                              ItemEditSheet, PalletEditSheet, PoDeleteSheet
└── screens/                   ItemsScreen, ContainersScreen, HistoryScreen
```

---

## §9. Lỗi đã biết và nợ kỹ thuật

> Nên xử lý theo thứ tự ưu tiên trước khi thêm tính năng lớn.

| ID | Ưu tiên | Mô tả | Hướng sửa |
|---|---|---|---|
| **BUG-01** | ✅ | `pallet_status.key` PK một mình; `ON CONFLICT(key)` ghi đè batch cũ. Sau finishOrder, key `c1-1` batch mới trùng cũ | ✅ Fix: migration v2 (`src/db/migrations.js`) — `PRIMARY KEY (key, order_batch_id)`, `ON CONFLICT(key, order_batch_id)` |
| **BUG-02** | ✅ | `new Date().toISOString()` dùng giờ UTC; nhập 00:00–06:59 sáng VN bị thành ngày trước | ✅ Fix (v1.7): `src/utils/date.js` `todayLocal()`; thay **6** chỗ (`queries.js` ×4, `migrations.js`, `ItemCard.js`); `npm run test:date` 19 ca |
| **BUG-03** | ✅ | `finishOrder` không trong transaction; tắt app giữa chừng ⇒ mất INV-B1, mất một phần `items` | ✅ Fix (v1.7): toàn bộ phần ghi trong **một** `withTransactionAsync` + `AND status='active'` + cờ `finishing` chống gọi song song + `ensureActiveBatch` tự phục hồi. Xem `features/BUGFIX-02-03-finish-order.md` |
| **BUG-04** | ✅ | `ItemCard.handleAdd` lưu `defectTypes` khi `defectQty = 0` | ✅ Fix (FEAT-01): `defectTypes: dq > 0 ? types : []` |
| **BUG-05** | 🟠 P1 | HistoryScreen không refresh khi data mới | ✅ Fix: `dataVersion` trong store + useEffect deps |
| **BUG-06** | ✅ | `ItemsScreen` key=`item.ntk` → ItemCard cũ có thể còn state cũ | ✅ Fix (FEAT-19): `key={row.rowKey}` = `${item.order_batch_id}-${ntk}-${po}` — cần kèm `po` vì một mã nhiều PO nay tách thành nhiều thẻ |
| **BUG-08** | 🔴 P0 | `SELECT nw_kg` chạy trên schema chưa có cột. **Nguyên nhân gốc:** `runMigrations` chỉ chạy migration khi `version > user_version`; nếu DB đã bị đóng dấu `user_version = 3` mà `ALTER TABLE` chưa từng có hiệu lực ⇒ v3 **không bao giờ chạy lại** ⇒ `no such column: nw_kg` **vĩnh viễn** ở mọi lần mở. (Còn một đường phụ: `getDb()` trả instance **chưa migrate** khi gọi song song) | 🟡 Fix đã triển khai, **chờ xác nhận máy thật** (RC-122/123): cache **promise** (`src/db/index.js`) + `migration v3` idempotent + **schema guard** `ensureItemMetricColumns()` kiểm chứng schema bằng `PRAGMA table_info`, **không tin `user_version`** (`utils/schemaColumns.js`). E2E 6 kịch bản tái hiện đúng lỗi gốc. Xem `features/BUGFIX-08-db-init-race.md` |
| **BUG-07** | 🔴 P0 | `ImportJsonButton` gọi `FileSystem.readAsStringAsync` — hàm này ở gói gốc `expo-file-system` 57 **đã bị xoá và ném lỗi** (`legacyWarnings.ts`), nên **Nhập JSON hỏng trên Android** (rơi vào `fetch` với URI `file://` ⇒ OkHttp không đọc được) | ✅ Fix (BUGFIX-07): `new File(asset.uri).text()`; `fetch` chỉ còn lưới an toàn. Xem `features/BUGFIX-07-file-system-read.md` |
| **UX-01** | 🟢 P3 | HistoryScreen `onTouchEnd` unreliable | Đổi `TouchableOpacity`/`Pressable` |
| **DEBT-01** | 🟢 P3 | WAL trong `CREATE_TABLES_SQL` | Chạy WAL riêng trong `getDb()` |
| **DEBT-02** | 🟡 P3 | `containersData` cứng trong code | ✅ Đã thu hẹp: FEAT-08 phase 2 thêm `container_data`; **FEAT-14** chặn fallback seed ở đơn mới (`container_data='[]'`). Seed còn áp dụng cho **lần chạy đầu** (`AC-APP-02`) và batch cũ chưa có hàng |
| **DEBT-03** | 🟢 P3 | Chưa có test tự động | 🟡 Một phần: `npm test` chạy 13 script hàm thuần (`test-validateQty.mjs` FEAT-09, `test-palletKey.mjs` FEAT-10, `test-deleteItem.mjs` FEAT-11, `test-poSummary.mjs` FEAT-12, `test-deleteItemsByPo.mjs` FEAT-13, `test-date.mjs` BUGFIX-02, `test-archiveDelete.mjs` FEAT-15, `test-packingV1.mjs` + `test-importFormat.mjs` FEAT-16, `test-packingV1Import.mjs` FEAT-17, `test-schemaColumns.mjs` BUGFIX-08, `test-migrations.mjs` FEAT-18, `test-itemRows.mjs` FEAT-19 — 725 ca) + E2E tầng DB `test-dbInit.mjs` (6 kịch bản/26 assert, chạy `src/db/index.js` nguyên bản với `expo-sqlite` giả) + `test-migrations.mjs` chạy `MIGRATIONS` nguyên bản trên **SQLite thật** (`node:sqlite`) nên kiểm được SQL/PK/idempotent thay vì chỉ so chuỗi. Chưa có `jest-expo`; xem §11.2 |

---

## §12. Registry & Backlog

### §12.1 Đã cài đặt
`F-ITEMS` · `F-CONT` · `F-HIST` · `F-APP` · `F-IMPORT` · `FEAT-01` (form sửa nhật ký inline) · `FEAT-09` (hạn mức đơn đặt hàng + validate số) · `FEAT-10` (thêm/sửa/xoá sản phẩm, số lượng, kiện) · `FEAT-11` (nút xoá mã trực tiếp trên thẻ) · `FEAT-12` (tổng số lượng theo từng PO) · `FEAT-13` (xoá toàn bộ mã hàng của một PO)

### §12.2 Backlog
| ID | Ưu tiên | Cấp | Tính năng | Ràng buộc |
|---|---|---|---|---|
| **FEAT-11** | ✅ P3 | **1** | **Nút xoá mã hàng trực tiếp trên thẻ** (tab Mã hàng) | ✅ Xong. Tái dùng `removeItem` của FEAT-10; helper `utils/deleteItem.js`; thêm `INV-V3`. Spec: `specs/features/FEAT-11-delete-item-quick.md` |
| **FEAT-12** | ✅ P3 | **1** | **Bảng tổng theo PO** (Tổng / Đã SX / Còn lại) ở tab Mã hàng | ✅ Xong. `utils/poSummary.js` + `PoSummaryTable`; thêm `INV-D6`. Spec: `specs/features/FEAT-12-po-summary.md` |
| BUG-03, 02 | ✅ v1.7 | 2–3 | Sửa lỗi mục 9 | ✅ Xong — `features/BUGFIX-02-03-finish-order.md`; AC-FIN-01..09, RC-73..78 |
| BUG-01 | — | 2 | ✅ Fix trong migration v2 của FEAT-10 | PK `(key, order_batch_id)` + khoá theo `ntk` |
| BUG-05 | P1 | 1 | ✅ Fix: `dataVersion` | — |
| FEAT-02 | P2 | 1 | Lọc lịch sử theo ngày/tháng/năm | `setHistoryFilterValue`; `YYYY-MM` khớp `groupKey` |
| **FEAT-13** | ✅ P3 | **1** | **Xoá toàn bộ mã hàng của một PO** (tab Mã hàng) | ✅ Xong. `utils/deleteItemsByPo.js` + `queries.previewItemsByPo/removeItemsByPo` + `PoDeleteSheet`; thêm `INV-V4`. Spec: `specs/features/FEAT-13-delete-items-by-po.md` |
| FEAT-03 | P2 | 1 | Sao lưu/xuất CSV | `expo-file-system` + `expo-sharing`; chỉ đọc DB |
| FEAT-04 | P3 | 1 | Chế độ sáng/tối/theo hệ thống | AsyncStorage (chỉ UI); mặc định = theo hệ thống |
| FEAT-05 | P3 | 0–1 | Hiệu ứng mở/đóng thẻ | LayoutAnimation/reanimated; không đổi hành vi |
| FEAT-06 | P3 | 1 | FlatList khi danh sách dài | Giữ nguyên AC-ITEM-04, 12–15 |
| FEAT-07 | P3 | 3 | Container/kế hoạch động | FEAT-08 phase 2 giải quyết một phần |
| FEAT-08 | P2 | 1–2 | Import JSON (entries/items ✅; container/pallet 🟡) | expo-document-picker + expo-file-system |
| PARITY-01 | P3 | 1 | Các tính năng bản HTML chưa có | Chỉ làm khi được yêu cầu |

---

## §13.2 Gắn spec vào công cụ AI (AGENTS.md)

`AGENTS.md` nên chứa:
```
Đọc specs/SPEC-rules.md + specs/SPEC-api.md trước mọi thay đổi.
Tùy nhu cầu: specs/SPEC-data.md, specs/SPEC-acceptance.md, specs/SPEC-test.md.
Tuân thủ mục 0 (quy tắc vàng), §4.2 (mức bảo vệ), §10 (quy trình thay đổi).
Xong việc phải chạy §11 (checklist hồi quy).
```

---

## §14. ADR (Nhật ký quyết định kiến trúc)

| ID | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| ADR-01 | expo-sqlite, không AsyncStorage cho data nghiệp vụ | Dữ liệu tăng; cần query/group/total; ghi dòng | Async, cần migration |
| ADR-02 | Lưu batch bằng `order_batch_id`, không copy | Không tăng dung lượng; lịch sử luôn truy vấn được | Mọi bảng data phải có `order_batch_id` |
| ADR-03 | Expo Router `src/app/`, route chỉ re-export | Khớp template SDK 57 | Không tạo `App.js`; thêm tab = file route + `Tabs.Screen` |
| ADR-04 | Alias `@/` cho import nội bộ | Tránh lỗi `../` khi lồng nhau | Không xoá `paths` trong tsconfig |
| ADR-05 | Một store zustand, DB là nguồn sự thật | Đơn giản, dễ theo dõi | Sau mỗi ghi phải nạp lại từ DB |
| ADR-06 | Seed nằm trong code | Dữ liệu đơn hiện tại cố định | Đơn mới cần đổi code (DEBT-02/FEAT-07) |
| ADR-07 | `Alert.alert` cho xác nhận | Tương đương `window.confirm` | Callback async, không trả về boolean |
