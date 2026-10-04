# BUGFIX-02/03 — Sửa "Hoàn tất đơn hàng": transaction, chống gọi song song, ngày cục bộ

> Đã bỏ nhãn DRAFT (chủ dự án đã chỉ đạo: *tiến hành sửa chữa tất cả* — 2026-10-02).
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-acceptance.md](../SPEC-acceptance.md) | [SPEC-test.md](../SPEC-test.md)

## 1. Bối cảnh & mục tiêu

Rà soát tính năng **Hoàn tất đơn hàng** phát hiện 4 vấn đề, tất cả đều làm hỏng bất biến đã ghi trong spec:

| Vấn đề | Bằng chứng | Bất biến bị phạm |
|---|---|---|
| **BUG-03** — `finishOrder` chạy 11 câu lệnh rời rạc, **không** transaction | `queries.js` cũ L693-738 | `INV-B3`, `INV-B1` |
| **Gọi song song** — không khoá nút, không cờ busy | store `finishOrder`, `ContainersScreen.handleFinish` | `INV-B1` |
| **BUG-02** — `finished_date` (và 5 chỗ khác) dùng giờ UTC | `toISOString()` × 6 | `INV-D2` (ngày địa phương), AC-HIST/AC-APP |
| **`INSERT` seed không an toàn** + tổng cộng tay | `queries.js` cũ L729-735 | `INV-D6` |

Mục tiêu: `finishOrder` **hoặc** thành công trọn vẹn, **hoặc** không đổi gì; ngày ghi đúng ngày cục bộ; không bao giờ có 2 batch `active`.

## 2. Phạm vi

- **Làm:** transaction cho `finishOrder`; `AND status='active'` + kiểm tra `changes`; `INSERT OR IGNORE` + `recalcBatchTargetInTx`; cờ `finishing` ở store khoá nút; `src/utils/date.js` `todayLocal()` thay cho `toISOString` ở **6** chỗ; `ensureActiveBatch` tự phục hồi khi DB lỡ có nhiều batch active.
- **KHÔNG làm:** không đổi flow xác nhận, không đổi chữ ký hàm hiện có (`finishOrder(containers)`), không xoá dữ liệu, không migration.
- **Cấp thay đổi:** **Cấp 3** (sửa hành vi của `finishOrder`/`ensureActiveBatch` — chủ dự án đã chỉ đạo) + **Cấp 1** cho phần UI khoá nút.

## 3. Acceptance Criteria

| ID | Hành vi |
|---|---|
| AC-FIN-01 | Toàn bộ phần **ghi** của `finishOrder` nằm trong **một** `withTransactionAsync`. Lỗi bất kỳ giữa chừng ⇒ rollback, batch cũ **không** bị archive (INV-B3) |
| AC-FIN-02 | `UPDATE … WHERE id=? AND status='active'`; `changes = 0` ⇒ ném lỗi `Đơn hàng hiện tại đã được hoàn tất trước đó.` và rollback |
| AC-FIN-03 | Store có cờ `finishing`; gọi `finishOrder()` lần thứ hai khi đang chạy ⇒ trả `{ok:false, error:{code:'BUSY'}}` ngay, **không** tạo batch thứ hai |
| AC-FIN-04 | Nút `✅ Hoàn tất đơn hàng hiện tại` bị khoá và đổi nhãn `⏳ Đang hoàn tất…` khi `finishing` |
| AC-FIN-05 | Lỗi trong `runFinish` ⇒ `Alert` tiếng Việt; dữ liệu còn nguyên (rollback) |
| AC-FIN-06 | `finished_date` và mọi ngày ghi mới dùng **ngày cục bộ** (`todayLocal()`), khớp `YYYY-MM-DD` (INV-D2) |
| AC-FIN-07 | `ensureActiveBatch`: nếu DB có > 1 batch `active`, giữ batch **mới nhất**, chuyển các batch còn lại sang `archived` với `finished_date = COALESCE(finished_date, today)`; **không** xoá `entries`/`items`/`pallet_status`/`container_data` |
| AC-FIN-08 | Tạo batch mới dùng `INSERT OR IGNORE` + `recalcBatchTargetInTx` ⇒ `total_target` luôn khớp `Σ items.target` |
| AC-FIN-09 | Hành vi cũ giữ nguyên: không copy dữ liệu (AC-CONT-07), tổng chốt đúng, `pallet_status`/`container_data` của batch cũ giữ nguyên |
| AC-FIN-10 | Chữ ký `finishOrder(containers)` và tên state/action cũ **không** đổi; `finishOrder` **thêm** giá trị trả về `{ok, batchId}` (caller cũ bỏ qua vẫn chạy) |

## 4. Ảnh hưởng dữ liệu

- **Không** migration, **không** xoá dữ liệu nào (quy tắc vàng #1). Migration đã phát hành (v1, v2) **không** bị sửa.
- `ensureActiveBatch` chỉ **chuyển trạng thái** các batch active thừa sang `archived`; mọi dữ liệu gắn vẫn còn và xem được ở "Đơn hàng đã lưu trữ".
- Hệ quả tích cực: DB lỡ hỏng (nhiều batch active) tự phục hồi khi mở app thay vì ghi nhật ký vào nhầm batch.

## 5. Kế hoạch file

| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `src/utils/date.js` | 🟢 mới | thêm | `todayLocal()`, `isDateString()` — hàm thuần, test được |
| `src/db/queries.js` | 🔒 | sửa `finishOrder` (thân), import | Transaction, guard, `OR IGNORE`, `recalcBatchTargetInTx`, `todayLocal` (4 chỗ) |
| `src/db/index.js` | 🟡 | sửa `ensureActiveBatch`, `getActiveBatchId` | Phục hồi INV-B1, transaction khi tạo batch đầu, `ORDER BY id DESC` |
| `src/db/migrations.js` | 🔒 | chỉ thay `toISOString` → `todayLocal` | Ngày cục bộ |
| `src/store/useAppStore.js` | 🔒 | thêm state `finishing`, sửa `finishOrder` | Chống gọi song song |
| `src/screens/ContainersScreen.js` | 🟡 | khoá nút, `runFinish` bắt lỗi | AC-FIN-04/05 |
| `src/components/ItemCard.js` | 🟡 | chỉ thay ngày | BUG-02 |
| `scripts/test-date.mjs` + `package.json` | 🟢 | thêm | 19 ca cho `todayLocal`/`isDateString` |

## 6. Thiết kế

```
ContainersScreen.handleFinish → Alert → runFinish
   └→ store.finishOrder()            [khoá: finishing = true]
        └→ queries.finishOrder(containers)
             ├ đọc totals/target/pallet (ngoài transaction)
             └ withTransactionAsync:
                1. UPDATE archived … WHERE id=? AND status='active'  (changes = 0 ⇒ ném)
                2. INSERT order_batches (status='active')
                3. INSERT OR IGNORE items × seedItems
                4. recalcBatchTargetInTx(newBatchId)
        └→ refresh items + archives, palletDoneMap {}, containerData null, dataVersion++
```

- `todayLocal()` = `getFullYear/getMonth/getDate` (không dùng `getUTC*`) ⇒ nhập lúc 00:00–06:59 VN vẫn ghi đúng ngày.
- `expo lint` có `--cache` tại `.expo/cache/eslint/`; khi lint báo lỗi `Parse errors in imported module` ở file **không** sửa, hãy `rm -rf .expo/cache/eslint` rồi lint lại (cache bị bẩn).

## 7. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| AC-CONT-07a/b/c/d/e | Không đổi logic tổng, không copy dữ liệu, `pallet_status`/`container_data` batch cũ giữ nguyên |
| AC-CONT-06 (2 mẫu thông điệp) | Không sửa `handleFinish` phần message |
| INV-B1 | Transaction + `AND status='active'` + khoá `finishing` + `ensureActiveBatch` phục hồi |
| AC-IMP-12 (batch mới fallback seed) | Không đổi: `containerData: null` sau `finishOrder` |
| Lịch sử (AC-HIST-01/02) | `date` giữ đúng `YYYY-MM-DD`; ngày cục bộ **sửa** lỗi lệch ngày chứ không phá |
| `todayLocal` trong migration v2 | Migration đã chạy không bị chạy lại (`PRAGMA user_version`); ảnh hưởng mới chỉ cho DB chưa nâng cấp |

## 8. Kế hoạch kiểm thử

- **Unit test:** `npm run test:date` (19 ca): định dạng `YYYY-MM-DD`, không lệch ở 00:30/23:59, không tràn tháng/năm, `isDateString` bắt `2026-13-01`, `2026-02-31`, `2028-02-29`.
- **RC cũ phải chạy lại:** RC-14, RC-15, RC-16, RC-17, RC-18, **RC-19** (ngày nhập trước 07:00 VN), RC-20, RC-72 (FEAT-13), AC-APP-02/03.
- **RC mới:** `RC-73..RC-78` (xem `SPEC-test.md` §11.1).

## 9. Tiêu chí xong

- [x] Toàn bộ mục §10.4 của [`SPEC-rules.md`](../SPEC-rules.md)
- [x] `npm test` / `npx expo lint` / `npx tsc --noEmit` — 0 lỗi mới
- [x] **Không có breaking change**: không migration, không đổi chữ ký, không xoá dữ liệu
- [ ] RC-73..78 + RC-14..20, RC-72 (cần máy/emulator thật)