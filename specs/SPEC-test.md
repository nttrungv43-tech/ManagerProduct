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
| RC-15 | RC-14 nhưng Xác nhận | Về `0`; có thẻ lưu trữ; mở thấy `produced/target` đúng; đơn mới **trắng** (FEAT-14: không seed) |
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
| RC-63 | *(FEAT-13)* Bấm `🗑 Xoá theo PO`, chọn PO có 3 mã sạch | Preview: `Xoá 3 mã · giảm {tổng} pcs`, liệt kê đúng 3 mã, nút `Xoá cả PO` bật |
| RC-64 | *(FEAT-13)* Bấm `Xoá cả PO` → **Huỷ** | Không xoá gì, không báo lỗi, `dataVersion` không tăng |
| RC-65 | *(FEAT-13)* `Xoá cả PO` → **Xoá** | PO rỗng mã: mã biến mất, `Kế hoạch` giảm đúng bằng tổng `target` đã báo, bảng PO cập nhật ngay |
| RC-66 | *(FEAT-13)* Chọn PO có mã **đã có nhật ký** | Alert liệt kê mã + số pcs nhật ký; **không** mất mã nào của PO đó; nút Xoá bị khoá ngay từ preview |
| RC-67 | *(FEAT-13)* Chọn PO có mã **còn trong kiện** | Alert nêu số kiện từng mã; dữ liệu nguyên vẹn |
| RC-68 | *(FEAT-13)* PO có mã **thuộc nhiều PO** (`A+B`) | Mã đó **không** bị xoá; preview/Alert ghi `Bỏ qua 1 mã thuộc nhiều PO`; xoá mã `A+B` từ PO khác thì PO này vẫn còn mã |
| RC-69 | *(FEAT-13)* Đang lọc PO X rồi xoá hết mã của PO X | Chip tự trở về `Tất cả PO`, không kẹt màn hình trống |
| RC-70 | *(FEAT-13)* Xoá xong PO bị hết mã | PO biến mất khỏi chip lọc **và** dòng bảng `Tổng theo PO`; các PO khác không đổi; `Σ` bảng vẫn khớp `Kế hoạch` |
| RC-71 | *(FEAT-13)* Xoá xong → tắt app, mở lại | Mã đã xoá vẫn mất; `order_batches.total_target` khớp `Σ items.target` |
| RC-72 | *(FEAT-13)* Xoá xong → `Hoàn tất` đơn | Batch `archived` giữ nguyên dữ liệu đã xoá; batch mới **trắng** (không seed — FEAT-14) |
| RC-73 | *(BUGFIX-03)* Hoàn tất đơn rồi **tắt app ngay** (giữa lúc ghi) | Mở lại: đúng **một** batch `active`, batch mới **rỗng** (`total_target = 0`, `pallets_total = 0`, `container_data = '[]'`, 0 dòng `items` — FEAT-14); không mất dữ liệu batch cũ |
| RC-74 | *(BUGFIX-03)* Bấm "Xác nhận" 2 lần liên tiếp | Nút khoá + nhãn `⏳ Đang hoàn tất…`; lần gọi thứ hai bị từ chối; cuối cùng chỉ có **1** batch mới |
| RC-75 | *(BUGFIX-03)* Hoàn tất lúc **00:00–06:59 giờ VN** | `finished_date` và ngày nhật ký ghi **đúng ngày địa phương** (không lùi 1 ngày) |
| RC-76 | *(BUGFIX-03)* Hoàn tất lỗi (đóng app khi đang xác nhận, hoặc dữ liệu lỗi) | `Alert` tiếng Việt; batch cũ **vẫn còn** `active`, dữ liệu nguyên vẹn |
| RC-77 | *(BUGFIX-03)* Hoàn tất ở DB có sẵn 2 batch active (cách hiệu ứng) | Mở app: giữ batch mới nhất, batch kia vào "Đơn hàng đã lưu trữ"; nhật ký vẫn xem được |
| RC-78 | *(BUGFIX-03)* Hoàn tất xong → Lịch sử | Lịch sử không đổi, nhóm mới nhất theo ngày đúng |
| RC-79 | *(FEAT-14)* Hoàn tất đơn → tab Mã hàng | **Không** có mã seed: 4 ô = `0`, bảng PO `Chưa có mã hàng.`, danh sách `Chưa có mã hàng nào trong đơn hàng này…` (AC-ITEM-30) |
| RC-80 | *(FEAT-14)* Hoàn tất đơn → tab Container | `Chưa có container trong đơn hàng này.` + gợi ý nhập packing list; **không** có 26 kiện mẫu; chip lọc PO ẩn (AC-CONT-09) |
| RC-81 | *(FEAT-14)* Trên đơn trắng, tắt app rồi mở lại | Vẫn trắng (không fallback seed 26 kiện); thống kê `0/0`, `0%`, không crash |
| RC-82 | *(FEAT-14)* Đơn trắng → `Nhập JSON` packing list thật | `container_data = []` bị ghi đè; container + kiện + mã hàng xuất hiện ngay ở cả hai tab (AC-IMP-14) |
| RC-83 | *(FEAT-14)* **Cài mới** (xoá toàn bộ dữ liệu app) rồi mở lần đầu | Vẫn có seed: Kế hoạch `8.030`, 3 container 26 kiện (AC-APP-02 — seed chỉ ở lần chạy đầu) |
| RC-90 | *(FEAT-15)* Xoá hẳn 1 đơn lưu trữ | Thẻ biến mất khỏi danh sách; **Lịch sử giảm** đúng số nhật ký đã xoá (AC-HIST-08) |
| RC-91 | *(FEAT-15)* Xoá hẳn ⇒ mở xem chi tiết đơn đó ở tab khác | Không còn dữ liệu của đơn đó ở bất kỳ đâu (AC-ARCH-05) |
| RC-92 | *(FEAT-15)* Đơn lưu trữ có mã trùng tên với đơn khác ⇒ xoá hẳn đơn này | Dữ liệu của đơn còn lại **không** bị ảnh hưởng (mọi `DELETE` lọc theo `order_batch_id`) |
| RC-93 | *(FEAT-15)* Bấm `🗑` rồi chọn `Huỷ` | Không đổi gì cả (INV-U1) |
| RC-94 | *(FEAT-15)* `👁 Ẩn nội dung` rồi `👁 Hiện nội dung` | Mọi thẻ cùng thu gọn/mở; mỗi thẻ chỉ nạp chi tiết 1 lần |
| RC-95 | *(FEAT-15)* Đang thu gọn tất cả thì chạm `▾` trên một thẻ | Chuyển sang điều khiển từng thẻ, đúng thẻ đó mở (AC-ARCH-03) |
| RC-96 | *(FEAT-15)* Xoá hẳn xong, tắt app mở lại | Đơn đã xoá không quay lại; dữ liệu còn lại nguyên vẹn |
| RC-97 | *(FEAT-15)* Xoá hẳn lúc đang mở nội dung thẻ | Không crash; sau khi nạp lại danh sách, thẻ đã xoá biến mất |
| RC-98 | *(FEAT-15)* Bấm `🗑` 2 lần nhanh / app tắt giữa lúc xoá | Nút khoá (`archivesBusy`), lần 2 bị từ chối `BUSY`; lỗi ⇒ rollback, không mất dữ liệu nửa vời |
| RC-105 | *(BUGFIX-07)* Bấm `📥 Nhập JSON` trên **Android** | **Không** còn log `readAsStringAsync ... is deprecated`; nạp được file (đọc qua `new File(uri).text()`) |
| RC-110 | *(FEAT-17)* Nhập `src/data/packing_data.json` vào đơn trắng | 64 mã · Σ Kế hoạch **51.568** · PO đúng từng mã _(máy thật)_ |
| RC-111 | *(FEAT-17)* Tab Container sau khi nạp | 26 container · 468 kiện · tick 1 kiện hoạt động, không mất trạng thái _(máy thật)_ |
| RC-112 | *(FEAT-17)* `ItemCard` sau import | Dòng `KL / TKL / m³ / kiện` hiện đúng số _(máy thật)_ |
| RC-113 | *(FEAT-17)* Mã thêm tay (`＋ Thêm mã hàng`) | **Không** hiện dòng thông tin (cột `NULL`) _(máy thật)_ |
| RC-114 | *(FEAT-17)* Nhập 2 lần cùng file | Không nhân bản mã/kiện; `total_target` không nhân đôi _(máy thật)_ |
| RC-115 | *(FEAT-17)* Nhập lại định dạng cũ (`總表`) | Hành vi như trước (`AC-IMP-18`) _(máy thật)_ |
| RC-116 | *(FEAT-17)* File `packing_v1` lỗi (PO không ép được / mã sai) | `Alert` liệt kê lý do; **không** gì thay đổi trong DB _(máy thật)_ |
| RC-120 | *(BUGFIX-08)* Mở app trên DB cũ (`user_version = 2`) | **Không** còn lỗi `no such column: nw_kg`; app vào được màn hình chính _(máy thật)_ |
| RC-121 | *(BUGFIX-08)* `PRAGMA table_info(items)` sau khi mở app | Có đủ `nw_kg`, `gw_kg`, `volume_cbm`, `package_count`; `user_version = 3` _(máy thật)_ |
| RC-122 | *(BUGFIX-08)* Mở app khi DB đã đóng dấu `user_version = 3` nhưng **thiếu** 4 cột (file DB của máy đang lỗi) | App **vẫn vào được** màn hình chính, không `no such column` _(máy thật)_ |
| RC-123 | *(BUGFIX-08)* Log Metro lúc mở app | Có dòng `[db] user_version=… · items=[…]`; nếu có `đã vá thêm: …` ⇒ xác nhận đúng nguyên nhân (số phiên bản lệch schema). **Không** có dòng `[db]` ⇒ đang chạy bundle cũ, phải `npx expo start -c` rồi tải lại app _(máy thật)_ |
| RC-124 | *(FEAT-18)* Mở app trên DB đã có dữ liệu (đơn có mã thuộc nhiều PO) | `PRAGMA user_version = 4`; bảng `item_po` tồn tại; app **không** lỗi _(máy thật)_ |
| RC-125 | *(FEAT-18)* `SELECT ntk, po, qty FROM item_po` sau khi mở app | Mỗi mã **một PO** có đúng 1 dòng với `qty = items.target`; `po` đã `TRIM`; mã `po` có `+` **không** có dòng (chưa tách được) _(máy thật)_ |
| RC-126 | *(FEAT-18)* Bảng `Tổng theo PO` | Mỗi PO có `Tổng` **riêng**; PO không có mã riêng hiện `0`; **`Σ` cột `Tổng` == ô `Kế hoạch`** (AC-PO-03, `INV-D6`) _(máy thật)_ |
| RC-127 | *(FEAT-18)* Mở app lần thứ hai (DB đã `user_version = 4`) | Không lỗi, `item_po` **không** nhân bản dòng (migration v4 idempotent) _(máy thật)_ |
| RC-128 | *(FEAT-19)* Nhập `packing_data.json` rồi mở tab Mã hàng | Mã `106167GF` hiện **hai thẻ**: `PO 2922` kế hoạch 270, `PO 2923` kế hoạch 135 — **không** còn thẻ `PO 2922+2923` _(máy thật)_ |
| RC-129 | *(FEAT-19)* Thẻ tách | Có ghi chú *"Dùng chung với n PO khác…"*; mọi thẻ của mã hiện **cùng** số đã làm; 4 trường KL/TKL/Thể tích/Kiện chỉ ở **thẻ đầu**; **không** có nút Sửa/Xoá _(máy thật)_ |
| RC-130 | *(FEAT-19)* Bấm chip lọc từng PO | Chỉ hiện thẻ của PO đó, không lẫn thẻ PO khác của cùng mã; `Σ` cột `Kế hoạch` của tab Mã hàng vẫn khớp ô `Kế hoạch` ở `SummaryCards` (INV-D7) _(máy thật)_ |
| RC-131 | *(FEAT-19)* DB cũ **chưa** nhập lại file nguồn | Thẻ gộp `PO 2922+2923` **vẫn còn** kèm ghi chú *"Chưa tách được theo PO — nhập lại file nguồn…"*; **không** mất dữ liệu, mọi thao tác cũ vẫn chạy _(máy thật)_ |
| RC-117 | *(FEAT-17)* Mở app trên DB cũ (`user_version = 2`) | v3 chạy; dữ liệu cũ nguyên vẹn; 4 cột mới `NULL` _(máy thật)_ |
| RC-106 | *(BUGFIX-07)* Nhập file JSON hợp lệ / file sai cú pháp / file rỗng | `Alert` xác nhận với **đúng số lượng** như trước; file lỗi ⇒ báo tiếng Việt, không crash, **không** ghi gì vào DB (AC-FS-04/05) |

---

## §11.2 Kiểm thử tự động

### Chạy test tự động

```bash
npm test              # 13 script — 725 ca (hàm thuần + migration trên SQLite thật)
npm run test:migrations   # chỉ test chuỗi migration (FEAT-18) — 31 ca
npm run test:itemRows     # chỉ test tách dòng mã nhiều PO (FEAT-19) — 72 ca
npm run test:dbInit       # E2E tầng DB (BUGFIX-08) — 6 kịch bản / 26 assert
```

Script dùng `node:assert` (không cài thêm thư viện), **không** cần Expo hay máy thật. Ba tầng:

| Tầng | Cách chạy | Chạy code thật ở đâu | Cái gì được kiểm thật |
|---|---|---|---|
| Hàm thuần | `scripts/test-*.mjs` | `src/utils/*.js` nguyên bản | Logic nghiệp vụ, không cần DB |
| Migration | `scripts/test-migrations.mjs` | `src/db/migrations.js` nguyên bản trên **SQLite thật** (`node:sqlite`, in-memory) qua adapter đúng API `expo-sqlite` | SQL thật, PK, tính idempotent, backfill — **không** phải so chuỗi |
| E2E DB | `scripts/db-init-e2e/` | `src/db/index.js` + `src/db/queries.js` nguyên bản với `expo-sqlite` giả ném lỗi y hệt SQLite | Thứ tự migrate/guard, truy vấn trước–sau `ALTER` |

> ⚠️ Vì sao tầng migration dùng `node:sqlite`: stub chỉ **ghi lại** SQL nên **không** phát hiện được SQL sai. `node:sqlite` là
> SQLite thật ⇒ `INSTR(po,'+') = 0`, `INSERT OR IGNORE`, khoá chính và idempotent đều được kiểm như trên máy.
> Mọi kịch bản E2E chạy **1 process** vì `dbReady` cache ở phạm vi module.

Thêm test mới bằng cách thêm `test('tên', () => {...})` trong script, hoặc thêm kịch bản trong `scripts/db-init-e2e/scenario.mjs`.

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
| **`todayLocal`** *(BUGFIX-02)* | `YYYY-MM-DD`; tháng 1 → `01`, ngày 9 → `09`; **00:30 sáng vẫn là ngày hôm đó** (không lùi 1 ngày như `toISOString`); 23:59 vẫn ngày hôm đó; ngày 1 tháng 1 không tràn tháng trước |
| **`poSummaries` + `itemPoRows`** *(FEAT-18)* | Mã đa PO có dòng ⇒ cộng **đúng PO của nó**, không cộng trọn `target` vào cả hai; `Σ` mọi dòng == Σ `target`; PO không có dòng ⇒ `Tổng = 0`; **không** truyền `itemPoRows` ⇒ kết quả y hệt FEAT-12 (không breaking) |
| **`splitItemRows`** *(FEAT-19)* | Mã đa PO có `item_po` ⇒ tách N dòng, mỗi dòng **một** PO, `target` per-PO đúng; `Σ` dòng của một mã == `items.target` (**INV-D7**); mã một PO không đổi; 4 trường FEAT-17 chỉ ở dòng đầu, dòng sau `null`; `rowKey` duy nhất (kể cả khác batch); mã đa PO **không** có `item_po` ⇒ 1 dòng gộp + `mergedMultiPo` |
| **`filterItemRows`** *(FEAT-19)* | Lọc PO chỉ ra thẻ của PO đó; tìm kiếm ra **mọi** thẻ của mã; trạng thái tính theo **mã** (`produced >= items.target`) chứ không theo kế hoạch per-PO; `items`/`rows` null ⇒ không lỗi |
| **`MIGRATIONS` v4** *(FEAT-18)* | Cài mới v1→v4: `user_version = 4`, `item_po` có PK `(ntk, po, order_batch_id)`; nâng cấp v3→v4: mã một PO backfill `qty = target` + `TRIM`, mã đa PO/rỗng/`NULL` **không** có dòng; chạy lại **không** nhân bản; trùng `(ntk, po, batch)` bị từ chối |
| **`isDateString`** *(BUGFIX-02)* | `'2026-09-02'` hợp lệ; `'2026-13-01'`, `'2026-02-31'`, `'2026-09'`, `'2026-09-02T00:00'`, số, `null` đều `false`; `'2028-02-29'` hợp lệ, `'2027-02-29'` không |
| **`splitPo`** *(FEAT-13)* | `'A'`→`['A']`; `'A+B'`→`['A','B']`; `' A + B '`→`['A','B']`; `''`/`undefined`→`[]` |
| **`selectItemsByPo`** *(FEAT-13)* | Khớp PO con của `A+B`; `excludeMulti=true` ⇒ mã nhiều PO nằm ở `multi` **không** nằm ở `matched`; `totalTarget` chỉ tính `matched`; PO rỗng ⇒ `itemCount 0`; `items` không phải mảng ⇒ không crash |
| **`poFilterNeedsReset`** *(FEAT-13)* | `all` ⇒ `false`; PO còn mã ⇒ `false`; PO hết mã ⇒ `true` |
| **`bulkDeleteConfirmMessage`** *(FEAT-13)* | Có tên PO, số mã, tổng pcs phân tách nghìn kiểu VN (`8.030`), câu "không thể hoàn tác"; thêm dòng "Bỏ qua n mã thuộc nhiều PO" khi có |
| **`formatBulkDeleteError`** *(FEAT-13)* | `PO_NO_ITEMS`/`INVALID_PO` có tiếng Việt đúng; danh sách mã bị chặn dịch qua `itemErrorMessage`; > 3 mã ⇒ `… và N mã khác.`; mã lạ ⇒ thông báo chung |
| **`confirmDeleteItemsByPo`** *(FEAT-13)* | Đủ 2 nút `Huỷ`(cancel)/`Xoá`(destructive); Huỷ ⇒ không gọi `onDelete`, `{ok:false, code:'CANCELLED'}`; `{ok:false}` ⇒ `Alert` tiêu đề `DELETE_ERROR_TITLE` + `formatBulkDeleteError`, không gọi `onSuccess`; hồi quy: truyền `Alert` dạng **class** vẫn chạy |
