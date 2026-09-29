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
- Ghi/sửa/xoá dữ liệu của batch đã `archived` từ giao diện.
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
| 🟢 **Tự do** | Sửa/thêm thoải mái trong phạm vi tính năng | `components/*` còn lại (trừ ItemCard/PalletRow), `theme.js` (thêm token), file mới |

> Route `src/app/(tabs)/*.tsx` là 🔒: mỗi file đúng 1 dòng re-export.

---

## §8. Bất biến (Invariants), không được phá

| ID | Bất biến |
|---|---|
| **INV-B1** | Luôn có đúng 1 dòng `order_batches.status='active'` sau mọi thao tác |
| **INV-B2** | Dữ liệu của batch `archived` không bị sửa/xoá từ giao diện |
| **INV-B3** | `finishOrder` không được để hệ thống ở trạng thái nửa vời (cần transaction, xem §10.2) |
| **INV-D1** | Nhất quán seed: với mỗi `ntk`, tổng `qty` của mọi kiện trong `containersData` = `target` trong `seedItems`. Tổng = 8.030. |
| **INV-D2** | `date` luôn là chuỗi `YYYY-MM-DD` |
| **INV-D3** | `line ∈ {manual, auto}`; `defect_types` chỉ chứa `yellow`/`red`/`tear`, cách nhau dấu phẩy |
| **INV-D4** | Định dạng key pallet (§5.2 trong `SPEC-data.md`) không đổi; không đổi thứ tự `items` trong pallet |
| **INV-D5** | Không có `entries` mồ côi (`order_batch_id` phải tồn tại) |
| **INV-U1** | Hành động phá huỷ/đảo trạng thái luôn có bước xác nhận (`Alert.alert`) |
| **INV-U2** | Chuỗi giao diện bằng tiếng Việt, giữ nguyên các nhãn trong §7 |
| **INV-A1** | Dữ liệu nghiệp vụ chỉ ở SQLite; không có network |
| **INV-A2** | Chiều phụ thuộc giữa các tầng theo §3 (`SPEC-reference.md`) |

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
