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
| Phiên bản spec | 1.3 (modular) |
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
| BUG-01/02/03 | ⏳ P0/P1 (cần chỉ đạo Cấp 3) |
| FEAT-01..06, FEAT-07 | 📋 Backlog |

---

## Lịch sử chia module

| Ngày | Phiên bản | Thay đổi |
|---|---|---|
| 2026-09-29 | 1.0-modular | Split SPEC.md 708 dòng thành 8 file module |
| 2026-09-28 | 1.0 | Lập spec ban đầu |

Chi tiết lịch sử: [SPEC-changelog.md](SPEC-changelog.md)
