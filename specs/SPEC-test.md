# SPEC-TEST — Checklist hồi quy & Unit test

> **Từ SPEC.md §11** — [Quay lại SPEC.md](SPEC.md) | [SPEC-AC.md](SPEC-acceptance.md) | [SPEC-rules.md](SPEC-rules.md)

---

## §11.1 Checklist thủ công (chạy trên DB mới, sau mỗi thay đổi)

| ID | Bước | Kết quả mong đợi |
|---|---|---|
| RC-01 | Cài mới, mở app | Loading → 4 ô: Kế hoạch `8.030`, Đã SX `0`, `0%`, Lỗi `0`; 8 mã hàng |
| RC-02 | Mã `106160`: mở thẻ, nhập `100`, Thủ công → Thêm | Đã làm `100`, Còn lại `900`, `10%` (`bad`). Tổng: Đã SX `100`, `1.2%`. Nhật ký: `{hôm nay} — 100 pcs · Thủ công` |
| RC-03 | Nhập `50`, Tự động, lỗi `5`, "Thẻ vàng" → Thêm | Đã làm `150`; Lỗi `5`; dòng mới có `· Lỗi 5 (Thẻ vàng)`, nằm trên dòng cũ |
| RC-04 | Nhập `0` (lỗi để trống) → Thêm | Không có gì thay đổi, không lỗi (AC-ITEM-05) |
| RC-05 | Xoá dòng `50` → Huỷ → Xác nhận lại | Huỷ: không đổi. Xác nhận: Đã làm `100`, Lỗi `0` |
| RC-06 | Tìm `1063`, lọc PO `2600168`, lọc "Chưa xong" | Chỉ mã chứa `1063` thuộc PO 2600168; bỏ lọc → danh sách nới ra |
| RC-07 | Container → Container 1 → Kiện 1 → Xác nhận | `1/10`, `10%`, `660/3.540 pcs` |
| RC-08 | Bấm lại Kiện 1 → Huỷ; bấm lại → Xác nhận | Huỷ: giữ nguyên. Xác nhận bỏ tick: `0/10` |
| RC-09 | Kiện 2 (2 loại): tick chỉ loại đầu | Kiện chưa xong. Tick nốt: kiện xong, `doneQty` cộng `340` |
| RC-10 | Tick đủ Container 2 (5 kiện) | `5/5`, `100%`, thanh xanh, "Sẵn sàng đóng container ✓" |
| RC-11 | Lịch sử → Theo ngày | Có nhóm hôm nay, tổng khớp; Thủ công/Tự động/Lỗi đúng |
| RC-12 | Quay lại nhập thêm `10`, sang Lịch sử (không đổi nhóm) | Số liệu **cập nhật** (AC-HIST-07) |
| RC-13 | Theo tháng/Năm, mở nhóm | Nhãn `Tháng MM/YYYY` / `Năm YYYY`; chi tiết gộp theo mã |
| RC-14 | Container → "Hoàn tất" → Huỷ | Không đổi |
| RC-15 | RC-14 nhưng Xác nhận | Về 0; có thẻ lưu trữ; mở thấy `produced/target` đúng |
| RC-16 | Sau RC-15, sang Lịch sử | Nhật ký cũ **vẫn còn** (AC-CONT-07e) |
| RC-17 | Sau RC-15, tick lại Kiện 1 | Tick thành công, `1/10`; thẻ lưu trữ không đổi (BUG-01) |
| RC-18 | Sau RC-15, mở nhật ký | Nhật ký **trống** (BUG-06) |
| RC-19 | Nhập trước 07:00 giờ VN | Ngày ghi = ngày địa phương (BUG-02) |
| RC-20 | Tắt app, mở lại | Mọi dữ liệu còn nguyên |
| RC-21 | Chuyển sáng/tối | Đọc rõ, đúng token màu |
| RC-22 | (Migration) nâng cấp từ DB cũ | Dữ liệu còn nguyên; RC-02..17 vẫn đạt |
| RC-23 | *(FEAT-09)* Mã `106160` (`target=1000`): nhập `900` → Thêm | Đã làm `900`, `Còn lại 100` |
| RC-24 | *(FEAT-09)* Nhập `200` → Thêm | Alert "Vượt đơn đặt hàng"; Đã làm vẫn `900`; ô nhập **còn nguyên** `200` |
| RC-25 | *(FEAT-09)* Sửa ô thành `100` → Thêm | Đã làm `1000`, `Còn lại 0`, `100%` |
| RC-26 | *(FEAT-09)* Nhập `1` → Thêm | Alert chặn (hạn mức = 0 còn lại) |
| RC-27 | *(FEAT-09)* Sửa dòng `900` → `1200` → Lưu | Alert chặn; form sửa **vẫn mở**; dòng vẫn `900` |
| RC-28 | *(FEAT-09)* Sửa dòng `900` → `800` → Lưu → Xác nhận | Đã làm giữ nguyên `900` (giảm được phép) |
| RC-29 | *(FEAT-09)* Nhập `abc`, `-5`, `1.5` lần lượt | Không ghi; đúng thông báo lỗi giá trị số |
| RC-30 | *(FEAT-09)* Import JSON vượt hạn mức | Alert kết quả có dòng "Vượt đơn đặt hàng: N mục bị bỏ qua" |
| RC-31 | *(FEAT-09)* Tắt app, mở lại | Dữ liệu nguyên vẹn; `SUM(qty) ≤ target` |
| RC-32 | *(FEAT-10)* Thêm mã hàng `TEST001`, PO đang lọc, `target 500` | Xuất hiện trong danh sách, `Kế hoạch` tổng +500, chip PO cập nhật |
| RC-33 | *(FEAT-10)* Thêm lại `TEST001` | Alert "đã tồn tại", không tạo dòng trùng |
| RC-34 | *(FEAT-10)* Sửa `TEST001` → `target 800` | Tổng cập nhật; `Đã làm` giữ nguyên |
| RC-35 | *(FEAT-10)* Sửa `target` xuống dưới số đã sản xuất | Alert chặn (AC-EDIT-06) |
| RC-36 | *(FEAT-10)* Thêm kiện mới vào Container 1 | `done/total` +1, `pallets_total` +1, thống kê `pcs` cập nhật |
| RC-37 | *(FEAT-10)* Tick kiện vừa thêm | Tick được, tính vào thống kê |
| RC-38 | *(FEAT-10)* Sửa số lượng 1 dòng hàng trong kiện đã tick | `pcs` đổi, **tick vẫn còn** |
| RC-39 | *(FEAT-10)* Xoá 1 dòng hàng khỏi kiện đã tick 2 dòng | Tick của dòng còn lại **không mất** (kiểm chứng Q1) |
| RC-40 | *(FEAT-10)* Thêm dòng hàng thứ 2 vào kiện 1 loại đã tick | Thành nhiều loại, **tick không mất** |
| RC-41 | *(FEAT-10)* Xoá kiện giữa dãy | Số hiệu kiện còn lại không đổi; `done/total` giảm; xoá luôn dòng `pallet_status` |
| RC-42 | *(FEAT-10)* Xoá mã hàng đã có nhật ký | Alert chặn, dữ liệu nguyên vẹn |
| RC-43 | *(FEAT-10)* Xoá mã hàng chưa có nhật ký nhưng có trong kiện | Alert chặn, nêu số kiện |
| RC-44 | *(FEAT-10)* Tắt app, mở lại | Mọi thay đổi còn nguyên; `pallets_total`/`total_target` khớp |
| RC-45 | *(FEAT-10)* Sửa kiện tay rồi import lại packing list | Cảnh báo ghi đè trước khi import |
| RC-46 | *(FEAT-10, nếu có migration)* Nâng cấp từ DB cũ có tick cũ | Tick cũ **giữ nguyên**; RC-07..10 vẫn đạt |

---

## §11.2 Kiểm thử tự động

### Chạy test tự động

```bash
npm test     # = node --no-warnings scripts/test-validateQty.mjs
```

Script dùng `node:assert` (không cài thêm thư viện), chỉ test **hàm thuần** trong `src/utils/validateQty.js` — không cần Expo/SQLite/máy thật. Chạy được ở mọi môi trường Node ≥ 20. Thêm test mới bằng cách thêm `test('tên', () => {...})` trong script.

**Khi sửa logic nghiệp vụ, chạy `npm test` + `npx expo lint` + `npx tsc --noEmit` trước khi kết luận xong.**

### Cài `jest-expo` (khuyến nghị, Cấp 1) — chưa làm

| Hàm | Ca kiểm thử tối thiểu |
|---|---|
|---|---|
| `pctClass` | `100→'ok'`, `99.9→'mid'`, `60→'mid'`, `59.9→'low'`, `0→'low'` |
| `summaryTotals` | Rỗng → `overallPct = 0`; `target=8030, produced=100` → `overallPct = 1.2` |
| `filteredItems` | AND PO + tìm kiếm + trạng thái; `target=0` không bao giờ "done" |
| `isPalletDone` | 1 loại: key `c1-1`; nhiều loại: true khi đủ `c1-2-0`, `c1-2-1` |
| `countPalletsDone` / `countPalletsDoneWithData` | Map rỗng → `{done:0,total:26}`; imported → 51 |
| **`parseQty`** *(FEAT-09)* | `'120'→120`; `' 120 '→120`; `'1.200'→1200`; `'1 200'→1200`; `''→null`; `'abc'→null`; `'12abc'→null`; `'-5'→null`; `'1.5'→null`; `'1e3'→null` |
| **`checkQtyLimit`** *(FEAT-09)* | `hasLimit:false` → luôn `ok`; `produced+incoming === target` → `ok`; `>` → `OVER_TARGET` với `remaining`/`overBy` đúng; `incoming=0` → `ok` |
| **`formatQtyError`** *(FEAT-09)* | Chuỗi có `ntk`, `target`, `produced`, `remaining`, `overBy`; tiếng Việt có dấu |
| **Seed (INV-D1)** | Σ qty trên kiện = target; tổng = 8030; số kiện = 26 |
