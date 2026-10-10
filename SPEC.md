# SPEC — Ứng dụng "Theo dõi sản xuất hàng ngày"

> ⚠️ **Đã chia thành module.** Nội dung chi tiết đã chuyển sang các file con trong `specs/`. Đọc file phù hợp với nhu cầu của bạn:

| Mục tiêu | File |
|---|---|
| **Trước khi thay đổi code** | [`SPEC-rules.md`](SPEC-rules.md) — quy trình, 10 quy tắc vàng, mức bảo vệ, invariants, DoD |
| **Kiểm tra signature hàm / state / props** | [`SPEC-api.md`](SPEC-api.md) — hợp đồng API queries.js, store, component |
| **Hiểu Acceptance Criteria** | [`SPEC-acceptance.md`](SPEC-acceptance.md) — AC-ITEM, AC-CONT, AC-HIST, AC-APP, AC-IMP |
| **Hiểu schema, key pallet, migration** | [`SPEC-data.md`](SPEC-data.md) — bảng, key format, phân cấp thay đổi, migration |
| **Chạy checklist hồi quo** | [`SPEC-test.md`](SPEC-test.md) — RC-01..RC-22 + unit test plan |
| **Tham khảo chung** | [`SPEC-reference.md`](SPEC-reference.md) — tech stack, architecture, bugs, ADR, registry |
| **Changelog** | [`SPEC-changelog.md`](SPEC-changelog.md) |
| **Template tính năng mới** | [`SPEC-template.md`](SPEC-template.md) |

---

## Thông tin dự án

| Mục | Giá trị |
|---|---|
| Phiên bản spec | 1.17 (modular) |
| Nền tảng | Expo SDK 57 (Expo Router `src/app/`) + `expo-sqlite` + `zustand` |
| Chế độ | 100% offline, một thiết bị, không server |
| Ngôn ngữ | Tiếng Việt |

> **Nguồn sự thật duy nhất.** Nếu code và spec mâu thuằn, dừng lại và hỏi chủ dự án. Xem `AGENTS.md` để biết cách truy cập spec nhanh.

---

## Quick start cho AI agent

1. **Đọc** [`SPEC-rules.md`](SPEC-rules.md) trước bất kỳ thay đổi nào — đặc biệt §0.2 (10 quy tắc vàng) và §4.2 (mức bảo vệ file).
2. **Xác định file sẽ sửa** — kiểm tra mức bảo vệ (🔒/🟡/🟢) trong `SPEC-rules.md` §4.2.
3. **Tra cứu signature** trong [`SPEC-api.md`](SPEC-api.md).
4. **Kiểm chứng hành vi** trong [`SPEC-acceptance.md`](SPEC-acceptance.md).
5. **Sau khi xong** — chạy checklist trong `SPEC-test.md`, cập nhật `SPEC-changelog.md`.

---

## Registry tính năng

Xem đầy đủ trong [`SPEC-reference.md`](SPEC-reference.md) §12:

| Tính năng | Trạng thái |
|---|---|
| F-ITEMS | ✅ |
| F-CONT | ✅ |
| F-HIST | ✅ |
| F-APP | ✅ |
| F-IMPORT | ✅ items/entries; 🟡 container/pallet |
| FEAT-01 | ✅ Form sửa nhật ký |
| FEAT-08 | ✅ items/entries; 🟡 container/pallet |
| FEAT-09 | ✅ Hạn mức đơn đặt hàng + validate dữ liệu số |
| FEAT-10 | ✅ Thêm/sửa/xoá sản phẩm, số lượng, kiện |
| FEAT-11 | ✅ Nút xoá mã hàng trực tiếp trên thẻ (Cấp 1, UI-only) |
| FEAT-12 | ✅ Bảng tổng số lượng theo từng PO (Cấp 1, dữ liệu dẫn xuất) |
| FEAT-13 | ✅ Xoá toàn bộ mã hàng của một PO (Cấp 1, có xem trước + chặn an toàn) |
| BUG-02/03 | ✅ Hoàn tất đơn hàng: transaction + chống gọi song song + ngày cục bộ |
| FEAT-14 | ✅ Đơn mới sau khi hoàn tất luôn **trắng** (không nạp dữ liệu mẫu) |
| FEAT-15 | ✅ Xoá hẳn đơn hàng lưu trữ + ẩn/hiện nội dung (Cấp 3, có `Alert` xác nhận) |
| BUG-01/04/05 | ✅ Đã sửa (PK pallet, defectTypes, dataVersion) |
| BUG-07 | ✅ Đã sửa (Nhập JSON: `readAsStringAsync` đã bị xoá → dùng `new File(uri).text()`) |
| BUG-08 | ✅ Đã sửa (app không khởi động: `getDb()` trả DB chưa migrate → `no such column: nw_kg`) |
| BUGFIX-23 | ✅ Đã sửa (app không khởi động: DB của **build trung gian** thiếu cột → `no such column: order_line_id`) |
| FEAT-16 | ✅ Converter `packing_data.json` → file app import được (`npm run convert:packing`) + báo lỗi rõ khi sai định dạng |
| FEAT-17 | ✅ Nhập thẳng `packing_data.json` + hiển thị KL/TKL/thể tích/số kiện theo mỗi mã (migration v3, không breaking) |
| FEAT-18 | ✅ Số lượng **riêng cho từng PO** kể cả mã dùng chung (`item_po`, migration v4, không breaking) |
| FEAT-19 | ✅ Tách mã nhiều PO thành từng thẻ riêng (`106167GF` → PO 2922 + PO 2923), không gộp `A+B` (không migration) |
| FEAT-20 | ✅ **Đã sản xuất / Còn lại theo từng PO** trong bảng "Tổng theo PO" (`entries.po`, migration v5, không breaking) |
| FEAT-22 | ✅ Số hiệu nhà máy `order_ref` theo **PO × mã** (bảng `order_line_refs`) + ẩn `KL`/`TKL`/`Thể tích`, giữ `Kiện` |
| FEAT-23 | ✅ Nhập số lượng **theo từng `order_ref`** (bảng `production_entry_refs`), phương án A — thẻ cha giữ nguyên, ref là dòng con |
| FEAT-02..07 | 📋 Backlog |

> ✅ **`BUG-N1` đã sửa:** `checkLineTarget` đã được chuyển sang gọi `checkQtyLimit` đúng dạng object
> `{ target, produced, incomingQty }`, khôi phục kiểm tra hạn mức kế hoạch `INV-V1` ở tầng cơ sở dữ liệu.

> **Lưu ý khi nhập JSON:** app nhập được **3** định dạng — `entries` (nhật ký sản xuất), packing list phẳng
> (`總表` + `Column1..Column10`) và **`packing_data.json`** (`schema_version: 1`, FEAT-17).
> Lệnh `npm run convert:packing` vẫn chạy được để sinh file phẳng dùng đối chiếu/backup.
> Xem [`FEAT-17`](specs/features/FEAT-17-import-packing-v1.md) và [`FEAT-16`](specs/features/FEAT-16-convert-packing-data-v1.md).

---

## Lịch sử chia module

| Ngày | Phiên bản | Thay đổi |
|---|---|---|
| 2026-09-29 | 1.0-modular | Split SPEC.md 708 dòng thành 8 file module |
| 2026-09-28 | 1.0 | Lập spec ban đầu |

Chi tiết lịch sử: [SPEC-changelog.md](SPEC-changelog.md)
