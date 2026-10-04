# SPEC-Rules — Quy trình, Quy tắc & Bảo vệ

> **Từ SPEC.md §0, §4.2, §8, §10.4** — [Quay lại SPEC.md](SPEC.md) | [SPEC-api.md](SPEC-api.md) | [SPEC-data.md](SPEC-data.md)

⚠️ **Bắt buộc đọc trước khi thay đổi code.** Vi phạm bất kỳ quy tắc này = hỏng dự án.

---

## §0.1 Quy trình bắt buộc cho mọi thay đổi

1. **Đọc** mục 0, 3, 5, 8 và 9 của file này. Đọc thêm các mục liên quan đến phần bạn định sửa.
2. **Phân loại** thay đổi theo §10.1 (Cấp 0 đến Cấp 3) — xem `SPEC-data.md`.
3. **Viết spec tính năng** vào `specs/features/FEAT-xxx.md` theo mẫu ở `SPEC-template.md` **trước khi viết code**.
4. **Liệt kê file sẽ sửa** và đối chiếu với bảng mức bảo vệ ở §4.2. Không đụng vào file 🔒 nếu chưa được phép.
5. **Cài đặt theo bước nhỏ**, mỗi bước chạy được.
6. **Chạy checklist hồi quy** — xem `SPEC-test.md`. Ghi kết quả vào phần trả lời.
7. **Cập nhật spec** (§12 Registry, §15 Changelog — xem `SPEC-changelog.md`, và Acceptance Criteria nếu hành vi đổi có chủ đích).

---

## §0.2 Mười quy tắc vàng (vi phạm = hỏng dự án)

1. **Không phá dữ liệu người dùng.** Không `DROP`/`DELETE`/`ALTER` phá huỷ trên bảng có dữ liệu thật nếu không có migration an toàn.
2. **Chỉ thay đổi schema qua migration có đánh số phiên bản** bằng `PRAGMA user_version`. Không sửa migration đã phát hành.
2b. **Ngày ghi phải theo giờ cục bộ.** Dùng `todayLocal()` (`src/utils/date.js`); cấm `new Date().toISOString().slice(0, 10)` (BUG-02 — lệch ngày 00:00–06:59 giờ VN).
3. **Không đổi chữ ký (signature) hàm** trong `src/db/queries.js` và `src/store/useAppStore.js`. Muốn mở rộng thì thêm hàm mới hoặc thêm tham số tuỳ chọn có giá trị mặc định.
4. **Mọi import nội bộ khác thư mục dùng alias `@/`**. Không dùng `../src/...` hay đếm `../` để trỏ ra ngoài thư mục hiện tại.
5. **Logic nghiệp vụ không nằm trong file route** (`src/app/**`). File route chỉ `export { default } from '@/screens/...'` hoặc khai báo layout.
6. **Mọi thao tác ghi dữ liệu đi qua store action → `queries.js` → SQLite.** Không viết SQL trong component/screen.
7. **SQL luôn dùng tham số `?`.** Chỉ nội suy chuỗi với hằng số có trong whitelist.
8. **Mọi hành động phá huỷ hoặc đảo trạng thái phải hỏi xác nhận bằng `Alert.alert`** (xoá nhật ký, tick/bỏ tick kiện, hoàn tất đơn, lưu chỉnh sửa). Không dùng `window.confirm`.
9. **Không dùng `localStorage`/`AsyncStorage` cho dữ liệu nghiệp vụ.** Dữ liệu nghiệp vụ chỉ ở SQLite.
10. **Không nâng SDK, không thêm thư viện native, không đổi cấu trúc `src/app/`** khi chưa được phép.

---

## §0.3 Điều agent KHÔNG được làm

- Tạo `App.js` ở gốc dự án (dự án dùng Expo Router, `main` là `expo-router/entry`).
- Đổi tên bảng, cột, key pallet, hay giá trị enum đang dùng.
- Sửa `src/data/seed.js` mà không kiểm tra tính nhất quản dữ liệu (INV-D1).
- Ghi/**sửa** dữ liệu của batch đã `archived` từ giao diện. *(Xoá hẳn được phép theo `INV-B2` bản FEAT-15, chỉ qua `deleteArchive` + `Alert` xác nhận.)*
- Gọi `getDb()` trong lúc render component. Chỉ gọi trong action hoặc `useEffect`.
- Đưa màu hard-code vào component (dùng token của `theme`, ngoại lệ duy nhất: chữ trắng `#fff` trên nền `accent`/`good`/`bad`).
- "Tiện tay" refactor, đổi tên, format lại file không liên quan tới yêu cầu.
- Xoá các ghi chú/hàm "chưa dùng". Chúng là điểm mở rộng đã dự trù.

---

## §4.2 Mức bảo vệ

| Ký hiệu | Ý nghĩa | File |
|---|---|---|
| 🔒 **Đóng băng** | Không sửa hành vi/chữ ký/cấu trúc nếu chưa có spec Cấp 3. Chỉ được **thêm** | `db/schema.js`, `data/seed.js` (cấu trúc), `db/queries.js` (chữ ký hiện có), `store/useAppStore.js` (tên state/action hiện có) |
| 🟡 **Cẩn trọng** | Được sửa để thêm tính năng, phải giữ mọi AC hiện có | `db/index.js`, `screens/*`, `components/ItemCard.js`, `components/PalletRow.js`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx` |
| 🟢 **Tự do** | Sửa/thêm thoải mái trong phạm vi tính năng | `components/*` còn lại (trừ ItemCard/PalletRow), `theme.js` (thêm token), file mới (`utils/*`, `specs/*`) |

> Route `src/app/(tabs)/*.tsx` là 🔒: mỗi file đúng 1 dòng re-export.

---

## §8. Bất biến (Invariants), không được phá

| ID | Bất biến |
|---|---|
| **INV-B1** | Luôn có đúng 1 dòng `order_batches.status='active'` sau mọi thao tác. *Cơ chế bảo vệ 3 lớp (BUGFIX-03):* (1) `finishOrder` bọc **một** transaction + `UPDATE … AND status='active'`; (2) store khoá bằng cờ `finishing` (lần gọi thứ hai trả `BUSY`); (3) `ensureActiveBatch` tự archive các batch active thừa, giữ batch mới nhất |
| **INV-B2** | Dữ liệu của batch `archived` **không được sửa** từ giao diện. *(FEAT-15, Cấp 3 — chủ dự án chỉ đạo 2026-10-02)* **Xoá hẳn được phép** nhưng chỉ qua `deleteArchive`: một `withTransactionAsync`, xoá kèm `entries`/`items`/`pallet_status`/`container_data`, chỉ nhắm `status='archived'` (batch `active` ⇒ `BATCH_ACTIVE`), và phải có `Alert` xác nhận nêu rõ Lịch sử sẽ giảm. Mọi thao tác khác lên batch `archived` vẫn cấm |
| **INV-B3** | *(đã đạt sau BUGFIX-03)* `finishOrder` không được để hệ thống ở trạng thái nửa vời — toàn bộ phần ghi nằm trong **một** `withTransactionAsync`; lỗi bất kỳ ⇒ rollback |
| **INV-D1** | Nhất quán seed: với mỗi `ntk`, tổng `qty` của mọi kiện trong `containersData` = `target` trong `seedItems`. Tổng = 8.030. *(FEAT-14: seed chỉ là dữ liệu lần chạy đầu — đơn tạo sau `finishOrder` là **trắng**, không suy ra `INV-D1`.)* |
| **INV-D2** | `date` luôn là chuỗi `YYYY-MM-DD` theo **giờ cục bộ** — dùng `todayLocal()` (`src/utils/date.js`), **không** dùng `toISOString()` (giờ UTC, BUG-02) |
| **INV-D3** | `line ∈ {manual, auto}`; `defect_types` chỉ chứa `yellow`/`red`/`tear`, cách nhau dấu phẩy |
| **INV-D4** | *(FEAT-10 đã cập nhật)* Định dạng key pallet: kiện 1 loại → `` `${cid}-${no}` ``; kiện nhiều loại → `` `${cid}-${no}-${ntk}` `` (**theo mã hàng**, không theo chỉ số). Xem `SPEC-data.md` §5.2, §5.5.2 |
| **INV-D5** | Không có `entries` mồ côi (`order_batch_id` phải tồn tại) |
| **INV-B4** | *(FEAT-15)* Xoá hẳn đơn lưu trữ phải **cảnh báo trước** trong `Alert` rằng số liệu tab Lịch sử sẽ giảm (vì `entries` bị xoá là hệ quả trực tiếp) |
| **INV-U1** | Hành động phá huỷ/đảo trạng thái luôn có bước xác nhận (`Alert.alert`) |
| **INV-U2** | Chuỗi giao diện bằng tiếng Việt, giữ nguyên các nhãn trong §7 |
| **INV-A1** | Dữ liệu nghiệp vụ chỉ ở SQLite; không có network |
| **INV-A2** | Chiều phụ thuộc giữa các tầng theo §3 (`SPEC-reference.md`) |
| **INV-V1** | *(FEAT-09)* Với mọi `ntk` có `items.target > 0` trong batch `active`: `SUM(entries.qty) ≤ items.target`. Mọi `INSERT`/`UPDATE` vào `entries` **phải** kiểm tra ở `queries.js` — không được chỉ kiểm ở UI. Xem `SPEC-data.md` §5.4 |
| **INV-V2** | *(FEAT-10)* Mọi `ntk` xuất hiện trong `container_data` của batch `active` phải tồn tại trong `items` cùng batch. Xoá/sửa `items` phải kiểm tra ngược lại |
| **INV-V3** | *(FEAT-11)* Mọi thao tác xoá/sửa mã hàng phải nhắm **batch `active`**. Store luôn lấy `getActiveBatchId()`; UI chỉ truyền callback khi batch `active`. Nếu về sau `ItemsScreen` hiển thị batch `archived`, thao tác sẽ xoá nhầm dòng cùng `ntk` ở batch **active** — phải chặn ở tầng UI trước (AC-EDIT-32) |
| **INV-D6** | *(FEAT-12, **đổi ở FEAT-18**)* **Σ cột "Tổng" của bảng PO luôn == tổng toàn đơn.** Từ FEAT-18, bảng `item_po` lưu **phần của từng PO** (`qty`) nên mỗi PO có số lượng riêng mà tổng vẫn khớp: `Σ item_po.qty == Σ items.target` cho mỗi batch. PO không có dòng nào ⇒ `Tổng = 0` (**không phải** `NULL`), vẫn là hệ quả hợp lệ. Mã thuộc nhiều PO **không được** cộng trọn `target` vào mọi PO (sẽ vi phạm chính INV này). Xem `SPEC-data.md` §5.6b |
| **INV-D7** | *(FEAT-19)* `Σ Kế hoạch` của các thẻ tách của **một mã** luôn bằng `items.target` của mã đó ⇒ danh sách mã hàng **không được** cộng trùng. Mỗi thẻ chỉ nhận `item_po.qty` của **riêng** PO nó; `items.target` **vẫn là tổng** (không được đổi, vì `entries` và `INV-V1` phụ thuộc vào nó). `SummaryCards`/`PoSummaryTable` tính từ `items` nên không nhân đôi. Xem `SPEC-data.md` §5.6b |
| **INV-D8** | *(FEAT-20)* **Mỗi dòng `entries` thuộc nhiều nhất một PO** ⇒ `Σ` cột "Đã sản xuất" của bảng "Tổng theo PO" **không bao giờ vượt** `Σ entries.qty` của cùng batch; và `Σ` cột "Kế hoạch" vẫn bằng `Σ items.target` (INV-D6). Vì `entries.po` nullable nên sản lượng **chưa gắn PO** phải được báo riêng (`unattributedProduced`), **không** gán tự ý vào PO nào và **không** hiện `0` giả. Xem `SPEC-data.md` §5.3, `features/FEAT-20-entry-po-attr.md` |
| **INV-V4** | *(FEAT-13)* Xoá mã hàng **hàng loạt theo PO**: (a) chỉ nhắm batch `active` — store luôn lấy `getActiveBatchId()`, UI chỉ truyền callback khi có batch active; (b) **all-or-nothing**: có bất kỳ mã nào đã có nhật ký hoặc còn trong kiện thì **không xoá dòng nào**; (c) mã **thuộc nhiều PO** (`po` có `+`) **không** bị xoá bởi thao tác xoá theo một PO; (d) `total_target` phải khớp `Σ items.target` sau thao tác — ghi cùng transaction với `DELETE` |
| **INV-DB1** | *(BUGFIX-08)* **Không** truy vấn bảng nào trước khi `runMigrations` xong **và** schema đã được xác minh. `getDb()` phải cache **promise** khởi tạo (không cache instance đã mở) để mọi lời gọi — kể cả chạy song song — đều chờ migration; lỗi khởi tạo ⇒ xoá cache để lần sau thử lại. `PRAGMA user_version` là **ý định, không phải sự thật** ⇒ sau `runMigrations` phải kiểm chứng schema thật bằng `PRAGMA table_info` và vá phần thiếu (guard `ensureItemMetricColumns`), **không** tin `user_version`. Mọi migration `ADD COLUMN` phải **idempotent** (kiểm `PRAGMA table_info` trước) để chạy lại không `duplicate column name`, và **không** được đóng dấu `user_version` khi vá chưa xong |
| **INV-I1** | *(FEAT-17)* 4 cột `items.nw_kg/gw_kg/volume_cbm/package_count` (`NULL` = không có dữ liệu) — UI **ẩn** dòng, không hiện `0`. **INV-I2**: **chỉ đọc**, nguồn sự thật là packing list — `addItem`/`updateItem`/`ItemEditSheet` không sửa. **INV-I4**: import định dạng mới là **all-or-nothing**, lỗi ⇒ 0 lệnh ghi DB. Xem `SPEC-data.md` §5.8 |
| **INV-P1** | *(FEAT-10)* Khoá `pallet_status` phải **ổn định**: thay đổi thành phần kiện phải di chuyển trạng thái `done` sang khoá mới trong cùng transaction — không được làm mất trạng thái tick âm thầm |

---

## §10.1 Phân cấp thay đổi (xem đầy đủ `SPEC-data.md`)

| Cấp | Loại | Ví dụ | Yêu cầu |
|---|---|---|---|
| **0** | Văn bản/kiểu dáng | Sửa chữ, chỉnh khoảng cách | Checklist nhanh |
| **1** | Thêm mới | Thêm component, hàm query mới | Spec tính năng + checklist hồi quy |
| **2** | Thay đổi dữ liệu | Thêm bảng/cột/index | Cấp 1 + migration + kiểm thử nâng cấp |
| **3** | Sửa hành vi đã có | Đổi công thức, đổi flow | Chỉ đạo rõ chủ dự án; sửa spec trước, code sau |

---

## §10.4 Định nghĩa hoàn thành (Definition of Done)

Một thay đổi chỉ hoàn thành khi **tất cả** đúng:

- [ ] Có spec tính năng (Cấp ≥1) và mọi AC mới đều kiểm chứng được.
- [ ] Không vi phạm 10 quy tắc vàng (§0.2) và các bất biến (§8).
- [ ] Không sửa file 🔒 ngoài phạm vi được phép; không đổi chữ ký API (§6).
- [ ] Import nội bộ dùng `@/`; đúng chiều phụ thuộc (§3).
- [ ] Nếu đụng schema: có migration + đã kiểm thử nâng cấp.
- [ ] App khởi động không lỗi (`npx expo start -c`), không có cảnh báo/lỗi mới trong Metro.
- [ ] Checklist hồi quy (`SPEC-test.md`) chạy đủ, kết quả ghi trong phần trả lời.
- [ ] Spec này đã cập nhật: `SPEC-changelog.md`, `SPEC-data.md` §12, AC nếu hành vi đổi.
