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

---

## §11.2 Kiểm thử tự động (khuyến nghị, Cấp 1)

Cài `jest-expo`, test **hàm thuần** trước:

| Hàm | Ca kiểm thử tối thiểu |
|---|---|
| `pctClass` | `100→'ok'`, `99.9→'mid'`, `60→'mid'`, `59.9→'low'`, `0→'low'` |
| `summaryTotals` | Rỗng → `overallPct = 0`; `target=8030, produced=100` → `overallPct = 1.2` |
| `filteredItems` | AND PO + tìm kiếm + trạng thái; `target=0` không bao giờ "done" |
| `isPalletDone` | 1 loại: key `c1-1`; nhiều loại: true khi đủ `c1-2-0`, `c1-2-1` |
| `countPalletsDone` / `countPalletsDoneWithData` | Map rỗng → `{done:0,total:26}`; imported → 51 |
| **Seed (INV-D1)** | Σ qty trên kiện = target; tổng = 8030; số kiện = 26 |
