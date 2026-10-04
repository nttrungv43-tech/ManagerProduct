# FEAT-14 — Đơn hàng mới luôn **trắng** (không nạp dữ liệu mẫu)

> Đã bỏ nhãn DRAFT (chủ dự án đã chọn hướng *"Luôn tạo đơn mới trắng"* — 2026-10-02).
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-acceptance.md](../SPEC-acceptance.md) | [SPEC-test.md](../SPEC-test.md)

## 1. Bối cảnh & mục tiêu

Sau khi bấm **Hoàn tất đơn hàng**, app tự nạp lại dữ liệu mẫu (`seed.js`): 8 mã hàng thuộc
`PO 2600168 / 2600189` (tổng 8.030) và 3 container 26 kiện. Người dùng phải xoá tay từng PO mới
làm việc được với đơn thật — và tưởng như dữ liệu cũ bị "trở lại".

Hành vi này **có ghi trong spec** (`AC-CONT-07b`, `AC-APP-02`) nhưng là **nợ kỹ thuật đã biết**:
`ADR-06` (seed nằm trong code) · `DEBT-02` 🟡 · backlog `FEAT-07` (Cấp 3). FEAT-14 đóng lại nợ này.

**Mục tiêu:** bấm Hoàn tất ⇒ màn hình làm việc **hoàn toàn trống**, người dùng bắt đầu đơn mới bằng
dữ liệu thật (nhập packing list hoặc thêm tay).

## 2. Phạm vi

- **Làm:**
  1. Batch mới: **0** dòng `items`, `total_target = 0`, `pallets_total = 0`.
  2. Batch mới có `container_data = '[]'` ⇒ tab Container hiện **rỗng**, **không** fallback 26 kiện mẫu.
  3. Empty state rõ ràng ở cả hai tab, kèm hướng dẫn cách bắt đầu đơn mới.
- **KHÔNG làm:** không bỏ `seed` khỏi app — **lần chạy đầu** vẫn nạp mẫu (`AC-APP-02`); không xoá dữ liệu batch cũ; không migration.
- **Cấp thay đổi:** **Cấp 3** (đổi `AC-CONT-07b`, `AC-IMP-12`) + **Cấp 1** (empty state). Không đổi chữ ký `finishOrder(containers)`.

## 3. Acceptance Criteria

| ID | Hành vi |
|---|---|
| AC-CONT-07b *(đổi)* | Sau xác nhận: batch cũ → `archived` (như cũ); batch mới **hoàn toàn rỗng**: `items` = 0 dòng, `total_target = 0`, `pallets_total = 0`, `container_data = '[]'`; **không** nạp `seedItems`, **không** nạp `containersData` |
| AC-IMP-12 *(⬜→✅)* | Sau `finishOrder`: batch `archived` **giữ** `container_data` cũ; batch mới có `container_data = []` ⇒ hiển thị rỗng, **không** fallback seed |
| AC-CONT-09 | Batch mới rỗng ⇒ tab Container hiện `Chưa có container trong đơn hàng này.` + gợi ý nhập packing list; **không** render 26 kiện mẫu; chip lọc PO ẩn khi không có container |
| AC-ITEM-30 | Batch mới rỗng ⇒ tab Mã hàng: 4 ô tổng = `0`, bảng PO hiện `Chưa có mã hàng.` (`AC-ITEM-27`), danh sách hiện `Chưa có mã hàng nào trong đơn hàng này. Bấm ＋ Thêm mã hàng hoặc Nhập JSON để bắt đầu` |
| AC-CONT-10 | Thống kê `done/total` = `0/0`, thanh tiến độ `0%`, **không** chia/chia-cho-0; nút `Hoàn tất đơn hàng hiện tại` vẫn dùng được (cho phép hoàn tất đơn rỗng) |
| AC-APP-02 *(giữ nguyên)* | **Lần chạy đầu** vẫn tạo batch active + `seedItems` + 3 container mẫu (RC-01: Kế hoạch `8.030`). Chỉ các đơn **sau** khi Hoàn tất mới rỗng |
| AC-IMPORT-01 | Import packing list vào đơn rỗng ⇒ `INSERT OR REPLACE` ghi đè `container_data = []`, chèn `items`, `pallets_total` cập nhật ⇒ cả hai tab có dữ liệu ngay |
| AC-CONT-07a/c/d/e *(giữ nguyên)* | Batch cũ: tổng chốt, `pallets_done/total`, `container_data`, `pallet_status`, `entries` đều giữ nguyên; nhật ký cũ không mất |

> **Hệ quả nghiệp vụ (ghi rõ để không bị coi là bug):** đơn mới rỗng nên **không có container để thêm kiện tay**
> (`＋ Thêm kiện` cần container có sẵn). Muốn có kiện phải **Nhập packing list** trước — đúng nhu cầu vì
> kiện luôn đến từ packing list.

## 4. Ảnh hưởng dữ liệu

- **Không** migration, **không** xoá dữ liệu. `container_data` vẫn là `0..1` hàng mỗi batch (§5.1).
- Dấu hiệu "batch không có container" = **JSON rỗng `[]`**, phân biệt được với "chưa có hàng `container_data`"
  (trường hợp này mới fallback seed). Không cần cột/cờ mới ⇒ **không migration**.
- `seedItems`/`containersData` vẫn dùng cho: lần chạy đầu (`ensureActiveBatch`), `materializeContainers`,
  `countPalletsDone`/`fetchContainersView` fallback. `INV-D1` chỉ còn ý nghĩa cho seed tĩnh (đã ghi ở §5.5.4).

## 5. Kế hoạch file

| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `src/db/queries.js` | 🔒 | sửa `finishOrder`: bỏ nạp seed, thêm `INSERT container_data '[]'` | Đơn mới rỗng |
| `src/store/useAppStore.js` | 🔒 | `containerData: []` sau `finishOrder` | Không fallback seed |
| `src/screens/ContainersScreen.js` | 🟡 | empty state + ẩn chip PO khi rỗng | AC-CONT-09 |
| `src/screens/ItemsScreen.js` | 🟡 | phân biệt "đơn rỗng" với "lọc không ra kết quả" | AC-ITEM-30 |
| `specs/*.md`, `SPEC.md`, `tasks.md` | 🟢 | AC, data model, registry, changelog v1.8 | Quy trình Cấp 3 |

## 6. Thiết kế

```
finishOrder(containers)
  └ withTransactionAsync:
     1. UPDATE batch cũ → archived (+ tổng, ngày cục bộ)   [BUGFIX-03 giữ nguyên]
     2. INSERT order_batches (status='active', total_target=0, ..., pallets_total=0)
     3. INSERT OR REPLACE container_data (batch_id, '[]', today)   ← đánh dấu "không có container"
     (không INSERT items)

fetchContainerData(batchId) → '[]' ⇒ []   (mảng rỗng là truthy)
ContainersScreen: containers = containerData || containersData   ⇒ [] được giữ, KHÔNG fallback
store.finishOrder(): set({ containerData: [] })
```

> `[]` là truthy trong JS nên `containerData || containersData` tự động giữ `[]` — không cần đổi
> biểu thức đó, chỉ cần `fetchContainerData` trả `[]` thay vì `null` cho batch rỗng.

## 7. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| `AC-APP-02` + RC-01 (fresh install) | `ensureActiveBatch` **không** đổi — lần chạy đầu vẫn có 8.030 |
| `AC-CONT-04` (thống kê) | `total = 0` ⇒ `pct = 0`, không chia; thêm AC-CONT-10 |
| `AC-EDIT-14` (`＋ Thêm kiện`) | Nút nằm trong từng container; đơn rỗng không có container ⇒ nút không hiện (đã ghi ở §3) |
| `materializeContainers` | Chỉ chạy khi **thiếu** hàng `container_data`; batch rỗng đã có hàng `[]` ⇒ không bị nạp seed ngầm |
| `importContainerData` | `INSERT OR REPLACE` ghi đè `[]` bằng dữ liệu thật (AC-IMPORT-01) |
| `countPalletsDoneWithData(map, [])` | `{done:0,total:0}`, không crash |
| FEAT-13 "Xoá theo PO" trên đơn rỗng | preview `itemCount 0` ⇒ hiện `BULK_EMPTY_TEXT`, nút xoá khoá |

## 8. Kế hoạch kiểm thử

- **Unit test:** không có hàm thuần mới ⇒ chạy lại `npm test` (254 ca) để chắc không hỏng.
- **RC mới:** `RC-79..RC-83` (xem `SPEC-test.md` §11.1).
- **RC cũ phải chạy lại:** RC-01 (fresh install vẫn 8.030), RC-15, RC-20, RC-72 (đổi kỳ vọng), RC-14..18.

## 9. Tiêu chí xong

- [x] Toàn bộ mục §10.4 của [`SPEC-rules.md`](../SPEC-rules.md)
- [x] `npm test` / `npx expo lint` / `npx tsc --noEmit` — 0 lỗi mới
- [x] **Không có breaking change**: không migration, không đổi chữ ký
- [ ] RC-79..83 + RC-01/14..18/20/72 (cần máy/emulator thật)