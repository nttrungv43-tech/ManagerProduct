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

`src/data/seed.js` chứa `seedItems` (8 mã hàng + kế hoạch) và `containersData` (3 container, 26 kiện). Đây là dữ liệu mặc định. Khi import packing list JSON, cả `items` **và** container/pallet structure được lưu vào DB (`container_data`); `ContainersScreen` dùng DB data, fallback seed khi chưa có.

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
├── utils/                     hàm thuần dùng chung (🟢: validateQty.js — FEAT-09)
├── db/
│   ├── index.js               getDb(), getActiveBatchId(), ensureActiveBatch()
│   ├── schema.js              CREATE_TABLES_SQL
│   └── queries.js             truy vấn + pallet helpers
├── store/useAppStore.js       useAppStore + selectors
├── components/                ProgressBar, FilterChips, SummaryCards,
│                              ItemCard, EntryLogRow, PalletRow, ArchiveCard,
│                              ImportJsonButton
└── screens/                   ItemsScreen, ContainersScreen, HistoryScreen
```

---

## §9. Lỗi đã biết và nợ kỹ thuật

> Nên xử lý theo thứ tự ưu tiên trước khi thêm tính năng lớn.

| ID | Ưu tiên | Mô tả | Hướng sửa |
|---|---|---|---|
| **BUG-01** | ✅ | `pallet_status.key` PK một mình; `ON CONFLICT(key)` ghi đè batch cũ. Sau finishOrder, key `c1-1` batch mới trùng cũ | ✅ Fix: migration v2 (`src/db/migrations.js`) — `PRIMARY KEY (key, order_batch_id)`, `ON CONFLICT(key, order_batch_id)` |
| **BUG-02** | 🟠 P1 | `new Date().toISOString()` dùng giờ UTC; nhập 00:00–06:59 sáng VN bị thành ngày trước | `src/utils/date.js` với `todayLocal()` |
| **BUG-03** | 🟠 P1 | `finishOrder` không trong transaction | Bọc trong `db.withTransactionAsync` |
| **BUG-04** | 🟡 P2 | `ItemCard.handleAdd` lưu `defectTypes` khi `defectQty = 0` | `defectTypes: dq > 0 ? types : []` |
| **BUG-05** | 🟠 P1 | HistoryScreen không refresh khi data mới | ✅ Fix: `dataVersion` trong store + useEffect deps |
| **BUG-06** | 🟡 P2 | `ItemsScreen` key=`item.ntk` → ItemCard cũ có thể còn state cũ | `key={`${item.order_batch_id}-${item.ntk}`}` |
| **UX-01** | 🟢 P3 | HistoryScreen `onTouchEnd` unreliable | Đổi `TouchableOpacity`/`Pressable` |
| **DEBT-01** | 🟢 P3 | WAL trong `CREATE_TABLES_SQL` | Chạy WAL riêng trong `getDb()` |
| **DEBT-02** | 🟡 P3 | `containersData` cứng trong code | ✅ Đang giải quyết: FEAT-08 phase 2 thêm `container_data` |
| **DEBT-03** | 🟢 P3 | Chưa có test tự động | 🟡 Một phần: `npm test` chạy 2 script hàm thuần (`test-validateQty.mjs` FEAT-09, `test-palletKey.mjs` FEAT-10 — 72 ca). Chưa có `jest-expo`; xem §11.2 |

---

## §12. Registry & Backlog

### §12.1 Đã cài đặt
`F-ITEMS` · `F-CONT` · `F-HIST` · `F-APP` · `F-IMPORT` · `FEAT-01` (form sửa nhật ký inline) · `FEAT-09` (hạn mức đơn đặt hàng + validate số) · `FEAT-10` (thêm/sửa/xoá sản phẩm, số lượng, kiện) · `FEAT-11` (nút xoá mã trực tiếp trên thẻ) · `FEAT-12` (tổng số lượng theo từng PO)

### §12.2 Backlog
| ID | Ưu tiên | Cấp | Tính năng | Ràng buộc |
|---|---|---|---|---|
| **FEAT-11** | ✅ P3 | **1** | **Nút xoá mã hàng trực tiếp trên thẻ** (tab Mã hàng) | ✅ Xong. Tái dùng `removeItem` của FEAT-10; helper `utils/deleteItem.js`; thêm `INV-V3`. Spec: `specs/features/FEAT-11-delete-item-quick.md` |
| **FEAT-12** | ✅ P3 | **1** | **Bảng tổng theo PO** (Tổng / Đã SX / Còn lại) ở tab Mã hàng | ✅ Xong. `utils/poSummary.js` + `PoSummaryTable`; thêm `INV-D6`. Spec: `specs/features/FEAT-12-po-summary.md` |
| BUG-03, 02 | P0/P1 | 2–3 | Sửa lỗi mục 9 | Cần chỉ đạo Cấp 3 |
| BUG-01 | — | 2 | ✅ Fix trong migration v2 của FEAT-10 | PK `(key, order_batch_id)` + khoá theo `ntk` |
| BUG-05 | P1 | 1 | ✅ Fix: `dataVersion` | — |
| FEAT-02 | P2 | 1 | Lọc lịch sử theo ngày/tháng/năm | `setHistoryFilterValue`; `YYYY-MM` khớp `groupKey` |
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
