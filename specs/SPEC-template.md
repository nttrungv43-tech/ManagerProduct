# SPEC-Template — Mẫu tài liệu cho tính năng mới

> **Từ SPEC.md §13** — [Quay lại SPEC.md](SPEC.md) | [SPEC-rules.md](SPEC-rules.md) | [SPEC-data.md](SPEC-data.md)

Lưu tại `specs/features/FEAT-xxx-ten-ngan.md`. **Không viết code trước khi mục 1 đến 5 được chủ dự án đồng ý.**

---

## Mẫu tài liệu

```markdown
# FEAT-xxx — <Tên tính năng>

## 1. Bối cảnh & mục tiêu
- Vấn đề người dùng gặp:
- Kết quả mong muốn (đo được):

## 2. Phạm vi
- Làm:
- KHÔNG làm (non-goals):
- Cấp thay đổi (0/1/2/3):

## 3. Acceptance Criteria (Given / When / Then, có ID)
- AC-<TAB>-xx: Khi ..., thì ...

## 4. Ảnh hươngs dữ liệu
- Bảng/cột mới hoặc thay đổi: (nếu có → migration version N)
- Ảnh hưởng tới dữ liệu cũ: (không / cách bảo toàn)

## 5. Kế hoạch file
| File | Mức bảo vệ | Hành động (thêm/sửa) | Lý do |
|---|---|---|---|

## 6. Thiết kế
- Luồng dữ liệu (UI → store action → query):
- Hàm/props mới (chữ ký):
- Văn bản UI (tiếng Việt):

## 7. Rủi ro hồi quy
- AC/INV có thể bị ảnh hưởng và cách bảo vệ:

## 8. Kế hoạch kiểm thử
- RC nào phải chạy lại:
- RC mới cần thêm:

## 9. Tiêu chí xong
- [ ] Toàn bộ mục 10.4 của SPEC-rules.md
```

---

## §13.1 Prompt mẫu giao việc cho AI agent

```
Bạn đang làm việc trên dự án Expo (SDK 57) "Theo dõi sản xuất hàng ngày".
1. Đọc kỹ specs/SPEC-rules.md trước tiên. Sau đó đọc thêm:
   specs/SPEC-api.md, specs/SPEC-data.md, specs/SPEC-acceptance.md, specs/SPEC-test.md.
2. Nhiệm vụ: <mô tả tính năng / mã FEAT-xxx>.
3. Trước khi viết code: tạo specs/features/FEAT-xxx-*.md theo mẫu và
   dừng lại chờ chủ dự án duyệt các mục 1-5.
4. Sau khi được duyệt: cài đặt theo từng bước nhỏ, chỉ sửa file trong "Kế hoạch file".
5. Không sửa file 🔒, không đổi chữ ký hàm ở §6, không phá AC/INV nào.
6. Kết thúc: chạy checklist hồi quy (§11), báo cáo từng RC (đạt / không chạy được và lý do),
   cập nhật SPEC-changelog.md + §12 Registry.
Nếu phát hiện spec mâu thuẫn với code hoặc yêu cầu, DỪNG và hỏi chủ dự án.
```
