# FEAT-15 — Xoá đơn hàng lưu trữ & ẩn/hiện nội dung đơn lưu trữ

> **Quyết định chủ dự án (2026-10-02):** **chỉ XOÁ HẲN** (không có trạng thái ẩn mềm) + **xoá kèm `entries`**
> và **cảnh báo "Lịch sử sẽ giảm"**; phạm vi gồm **cả A (quản lý đơn lưu trữ) và B (thu gọn/hiện nội dung)**;
> đơn đã ẩn — *không còn khái niệm* ⇒ câu hỏi Q7 trở nên không áp dụng.
> **Hệ quả:** **không thêm cột, KHÔNG migration**, chữ ký hàm nào cũng không đổi.
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-acceptance.md](../SPEC-acceptance.md) | [SPEC-test.md](../SPEC-test.md)

## 1. Bối cảnh

Mục "📁 Đơn hàng đã lưu trữ" ở tab **Container** hiện chỉ **xem** (`AC-CONT-08`): mỗi thẻ hiện
`Hoàn tất ngày …` + tổng số liệu, chạm để bung chi tiết theo mã hàng. Người dùng **không có cách nào**
dọn đơn cũ — đơn sai, đơn nhập nhầm, đơn trùng vẫn nằm vĩnh viễn trong danh sách và vẫn cộng vào
tab **Lịch sử** (`AC-HIST-02` "bao gồm mọi batch").

## 2. Phạm vi

**Có (2 nhóm):**
- **A — Xoá đơn lưu trữ:** xoá hẳn **một** đơn `archived` (mã hàng, nhật ký, kiện, container, bản ghi batch)
  sau hộp thoại xác nhận có cảnh báo.
- **B — Ẩn/hiện nội dung:** nút `👁 Ẩn nội dung` / `👁 Hiện nội dung` thu gọn/mở **tất cả** thẻ mục
  lưu trữ; trạng thái **cục bộ component**, không lưu (`§0.2` #9).

**KHÔNG làm (đã chốt):**
- ❌ Trạng thái **ẩn mềm** (`is_hidden`) ⇒ **không có** khái niệm "đơn đã ẩn", **không** migration,
  **không** đổi chữ ký `fetchArchives()`.
- ❌ Xoá hàng loạt / "Xoá tất cả" (v1 chỉ **1** đơn mỗi lần — giống FEAT-13 Q4).
- ❌ Sửa nội dung đơn lưu trữ (vẫn **chỉ xem**).
- ❌ Xoá/thao tác lên batch `active` (`BATCH_ACTIVE`).

## 3. Quyết định của chủ dự án (đã chốt)

| # | Câu hỏi | Trả lời | Hệ quả kỹ thuật |
|---|---|---|---|
| Q1 | Xoá hẳn hay ẩn? | **Chỉ xoá hẳn** | Bỏ `is_hidden`/`hidden_at` ⇒ **Cấp 2 → không cần migration**; `Alert` chỉ 2 nút |
| Q2 | Có xoá `entries` không? | **Có** + cảnh báo "Lịch sử sẽ giảm" | Bắt buộc theo `INV-D5`; `AC-HIST-02` cần ghi nhận thay đổi ⇒ `AC-HIST-08` |
| Q3 | Xoá nhiều đơn? | **Không** — 1 đơn/lần | `deleteArchive(batchId)` không nhận mảng |
| Q4 | Đơn `active`? | **Chặn** | `BATCH_ACTIVE` ở `queries.js` + ẩn nút ở UI ⇒ `INV-B1` nguyên vẹn |
| Q5 | Lưu trạng thái thu gọn? | **Không** | state cục bộ `ContainersScreen` |
| Q6 | Phạm vi? | **Cả A và B** | — |
| Q7 | Đơn ẩn có tính vào Lịch sử? | *Không áp dụng* (đã bỏ khái niệm ẩn) | Xoá hẳn ⇒ Lịch sử giảm, `AC-HIST-08` |

## 4. Đề xuất thay đổi spec

### 4.1 Functional Requirements → `SPEC-acceptance.md` §7.9

| ID | Hành vi |
|---|---|
| AC-ARCH-01 | Tiêu đề mục lưu trữ có **thanh công cụ** với nút `👁 Ẩn nội dung` / `👁 Hiện nội dung` (nhãn đổi theo trạng thái). Chỉ hiện khi có ít nhất 1 đơn lưu trữ |
| AC-ARCH-02 | Mỗi thẻ đơn lưu trữ có **2 vùng chạm tách biệt**: mũi tên `▾/▴` (mở/đóng nội dung — giữ nguyên `AC-CONT-08`) và nút **`🗑`** ở góc phải. Nút `🗑` **không** nằm trong vùng chạm mở nội dung ⇒ không xoá nhầm khi chỉ muốn xem |
| AC-ARCH-03 | `👁 Ẩn nội dung`: **mọi** thẻ cùng thu gọn (không gọi DB); `👁 Hiện nội dung`: mọi thẻ cùng mở, mỗi thẻ nạp chi tiết **một lần** (`fetchArchiveItems`). Chạm `▾` trên một thẻ khi đang thu gọn tất cả ⇒ chuyển sang điều khiển từng thẻ và mở đúng thẻ đó |
| AC-ARCH-04 | Bấm `🗑` ⇒ `Alert.alert` **2 nút** `Huỷ` · `Xoá hẳn` (tiêu đề `Xoá đơn hàng đã lưu trữ?`). Nội dung nêu: ngày hoàn tất, `sản lượng/kế hoạch`, số mã hàng, số nhật ký, số kiện, và cảnh báo *"Xoá hẳn sẽ xoá vĩnh viễn dữ liệu đơn này. Số liệu ở tab Lịch sử cũng sẽ giảm theo."* (`INV-U1`) |
| AC-ARCH-05 | **Xoá hẳn:** xoá `entries` → `items` → `pallet_status` → `container_data` → `order_batches` trong **một** `withTransactionAsync` (all-or-nothing, `INV-D5`); chỉ nhắm `status='archived'`; không có dòng ⇒ rollback + `{ok:false, error:{code:'ARCHIVE_NOT_FOUND'}}` ⇒ `Alert` tiếng Việt |
| AC-ARCH-06 | Đơn `active` không có nút `🗑`; nếu gọi `deleteArchive(activeId)` ⇒ `{ok:false, error:{code:'BATCH_ACTIVE'}}`, **không** xoá gì (`INV-B1`) |
| AC-ARCH-07 | Sau khi xoá: danh sách lưu trữ cập nhật ngay (`refreshArchives()`), tab **Lịch sử** tự cập nhật qua `dataVersion++` (`AC-HIST-07`) |
| AC-ARCH-08 | Không còn đơn lưu trữ nào ⇒ mục lưu trữ biến mất, không còn vùng trống vô nghĩa |
| AC-HIST-08 | **Xoá hẳn** đơn lưu trữ ⇒ nhóm Lịch sử chứa ngày đó **giảm** tương ứng (tổng / Thủ công / Tự động / Lỗi và dòng chi tiết); đây là hệ quả **có chủ ý** đã được chủ dự án chấp thuận, không phải lỗi |

> **Sửa `AC-CONT-08`:** thẻ đơn lưu trữ nay có thêm nút `🗑`; giữ nguyên nhãn `Hoàn tất ngày {finished_date}`
> và hành vi mở/đóng chi tiết.
> **Sửa `INV-B2`** (`SPEC-rules.md`): dữ liệu `archived` **vẫn cấm sửa**, nhưng được phép **xoá hẳn có kiểm soát**
> (xác nhận `Alert`, một transaction) — thay đổi **Cấp 3**, chủ dự án đã chỉ đạo (2026-10-02).

### 4.2 Data Model → `SPEC-data.md`

**Không thay đổi schema. KHÔNG migration.** `PRAGMA user_version` giữ nguyên **2**.

Bảng bị **xoá dữ liệu** khi xoá hẳn một batch (soft FK ⇒ xoá tay trong transaction, `INV-D5`):

| Bảng | Điều kiện | Ghi chú |
|---|---|---|
| `entries` | `order_batch_id = ?` | nhật ký sản xuất ⇒ **Lịch sử thay đổi** (`AC-HIST-08`) |
| `items` | `order_batch_id = ?` | |
| `pallet_status` | `order_batch_id = ?` | |
| `container_data` | `batch_id = ?` | cột FK tên khác (`batch_id`) |
| `order_batches` | `id = ? AND status='archived'` | `changes = 0` ⇒ lỗi ⇒ rollback |

> Không đụng `pallet_status_bak_v1` (bảng sao lưu đường lùi của migration v2).
> `AUTOINCREMENT` ⇒ id đã xoá không tái sử dụng.
> Mã `ntk` **trùng tên ở batch khác** không bị ảnh hưởng (mọi bảng con đều lọc theo `order_batch_id`).

### 4.3 API Endpoints → `SPEC-api.md`

| Hàm | Tham số | Trả về | Ghi chú |
|---|---|---|---|
| `previewArchiveDelete(batchId)` | `batchId` | `{ok, finishedDate, produced, target, defect, itemCount, entryCount, palletCount}` \| `{ok:false, error}` | Chỉ đọc; dựng nội dung `Alert` (`AC-ARCH-04`) |
| `deleteArchive(batchId)` | `batchId` | `{ok, deleted:{entries,items,pallets}}` \| `{ok:false, error}` | **Hàm mới** ⇒ chữ ký cũ không đổi (quy tắc #3). Một `withTransactionAsync`; chặn `active` (`BATCH_ACTIVE`) |
| `fetchArchives()` | — | `batch[]` | **không đổi** (đã bỏ phương án `is_hidden`) |
| `fetchArchiveItems(batchId)` | — | `[{ntk,target,produced,defect}]` | **không đổi** |

Mã lỗi: `INVALID_BATCH_ID` · `BATCH_ACTIVE` · `ARCHIVE_NOT_FOUND` · `BUSY` · `DB_ERROR`.

**Store** (`useAppStore.js` — chỉ **thêm**):

| Bổ sung | Ghi chú |
|---|---|
| `archivesBusy` (boolean) | khoá nút `🗑` khi đang ghi, giống `finishing` (BUGFIX-03); lần gọi thứ hai trả `BUSY` |
| `refreshArchives()` | nạp lại danh sách lưu trữ |
| `deleteArchive(batchId)` | `q.deleteArchive` ⇒ `refreshArchives()` + `dataVersion++` |

**Hàm thuần mới** `src/utils/archiveDelete.js` (🟢, theo khuôn FEAT-11/FEAT-13):
`archiveDeleteConfirmMessage(preview)` · `archiveDeleteErrorMessage(code)` · `archiveDeleteErrorCode(err)`
⇒ dịch thông điệp tiếng Việt, test được không cần SQLite/Expo.

### 4.4 Bất biến

| ID | Nội dung |
|---|---|
| **INV-B2** *(sửa)* | Dữ liệu batch `archived` **không được sửa** từ giao diện. **Xoá hẳn được phép** nhưng chỉ qua `deleteArchive` (một transaction, xoá kèm `entries`/`items`/`pallet_status`/`container_data`, chỉ nhắm `status='archived'`, có `Alert` xác nhận). Mọi thao tác khác lên batch `archived` vẫn bị cấm |
| **INV-D6** *(bổ sung)* | Xoá hẳn đơn lưu trữ phải **cảnh báo trước** trong `Alert` rằng số liệu Lịch sử sẽ giảm — vì `entries` bị xoá là hệ quả trực tiếp |

## 5. Kế hoạch file

| File | Mức | Hành động |
|---|---|---|
| `src/utils/archiveDelete.js` | 🟢 mới | dịch thông điệp xác nhận/lỗi (hàm thuần) |
| `scripts/test-archiveDelete.mjs` | 🟢 mới | unit test hàm thuần |
| `src/db/queries.js` | 🔒 | **thêm** `previewArchiveDelete`, `deleteArchive` (không sửa hàm cũ) |
| `src/store/useAppStore.js` | 🔒 | **thêm** `archivesBusy`, `refreshArchives`, `deleteArchive` |
| `src/components/ArchiveCard.js` | 🟢 | thêm nút `🗑`; chuyển trạng thái mở/đóng ra cha (điều khiển được) |
| `src/screens/ContainersScreen.js` | 🟡 | thanh công cụ `👁 Ẩn/Hiện nội dung`, `Alert` xác nhận, khoá nút, empty state |
| `package.json` | 🟢 | thêm `test:archive` vào `npm test` |
| `specs/*`, `SPEC.md`, `tasks.md` | 🟢 | AC, API, rules, RC, changelog, registry, checklist |

## 6. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| Xoá nhầm nhóm ngày trong Lịch sử | `Alert` 2 nút nêu rõ số liệu + câu cảnh báo Lịch sử (`AC-ARCH-04`) |
| Xoá dở dang (app tắt) | **Một** `withTransactionAsync` ⇒ tự rollback (`INV-B3` cùng cơ chế với `finishOrder`) |
| Xoá nhầm batch `active` | `BATCH_ACTIVE` ở `queries.js` + không render nút `🗑` cho đơn active |
| `entries` mồ côi | Xoá `entries` **cùng transaction** (`INV-D5`) |
| Mất nhật ký của batch khác cùng `ntk` | Mọi `DELETE` lọc theo `order_batch_id` |
| Bấm `🗑` 2 lần nhanh | `archivesBusy` khoá nút, lần 2 trả `BUSY` (khuôn `BUGFIX-03`) |

## 7. Kế hoạch kiểm thử

- **Unit test:** `scripts/test-archiveDelete.mjs` (hàm thuần) + giữ nguyên 254 ca cũ.
- **RC mới:** `RC-90..RC-98` (xem `SPEC-test.md` §11.1).
- **Hồi quy bắt buộc:** `AC-CONT-07/08`, `AC-HIST-01..03/07`, `AC-APP-02/03`, `INV-B1`, `INV-D5`.

## 8. Tiêu chí xong

- [x] Q1–Q7 đã có câu trả lời của chủ dự án (2026-10-02)
- [x] `INV-B2` sửa cho phép xoá có kiểm soát (vẫn cấm sửa)
- [x] Toàn bộ mục §10.4 `SPEC-rules.md`
- [x] `npm test` / `npx expo lint` / `npx tsc --noEmit` — 0 lỗi mới
- [ ] RC-90..98 + hồi quy AC-HIST/AC-CONT (cần máy/emulator thật)