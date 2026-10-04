# BUGFIX-07 — Import JSON: `readAsStringAsync` đã bị xoá khỏi `expo-file-system`

> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-acceptance.md](../SPEC-acceptance.md) | [SPEC-test.md](../SPEC-test.md)

## 1. Bối cảnh & mục tiêu

Khi bấm **📥 Nhập JSON**, app in ra log:

```
Method readAsStringAsync imported from "expo-file-system" is deprecated.
You can migrate to the new filesystem API using "File" and "Directory" classes
or import the legacy API from "expo-file-system/legacy".
```

Đây **không** phải cảnh báo vô hại. Đọc mã nguồn `expo-file-system@57.0.7` cho thấy hàm ở gói
gốc **ném lỗi ngay**:

| Mức độ | Bằng chứng |
|---|---|
| Không chỉ deprecated — **hỏng thật** | `node_modules/expo-file-system/src/legacyWarnings.ts` L32-39: `readAsStringAsync` → `throw errorOnLegacyMethodUse('readAsStringAsync')` |
| Đường cứu hiện tại yếu | `ImportJsonButton.js` L41-47 rơi vào `fetch(asset.uri)` với URI `file://` — OkHttp (Android) **không** hỗ trợ scheme `file://` ⇒ báo *"Không thể đọc nội dung file"* |
| Chỉ 1 chỗ dùng | `grep -rn "expo-file-system" src` ⇒ chỉ `src/components/ImportJsonButton.js` |

⇒ **Trên Android, tính năng Nhập JSON hiện không dùng được**; mọi file đều bị từ chối ở bước
đọc nội dung, trước cả bước `JSON.parse`.

Mục tiêu: đọc file bằng API chính thức của SDK 57, không còn log deprecated, không phụ thuộc
`fetch` với `file://` làm đường cứu chính.

## 2. Phạm vi

- **Làm:** thay `import * as FileSystem from 'expo-file-system'` bằng `import { File } from 'expo-file-system'`;
  đọc nội dung qua `new File(asset.uri).text()`.
- **KHÔNG làm:** không đổi `copyToCacheDirectory: true` (bản sao cục bộ là điều kiện để `File` đọc được);
  không đổi props `ImportJsonButton`, không đổi chuỗi `Alert`, không đụng `queries.js`/`store`,
  không đụng luồng `detectFormat` (việc đó thuộc FEAT-16 `AC-FMT-01/02`, làm riêng).
- **Cấp thay đổi:** **Cấp 1** (thay lệnh gọi thư viện để sửa lỗi, không đổi hành vi quan sát được
  của tính năng). Không đổi schema, không migration, không đổi dữ liệu.

## 3. Acceptance Criteria

| ID | Hành vi |
|---|---|
| AC-FS-01 | `src/components/ImportJsonButton.js` **không** import `readAsStringAsync`/`* as FileSystem` từ gói gốc `expo-file-system` |
| AC-FS-02 | Đọc nội dung file bằng `new File(asset.uri).text()` (API không deprecated của SDK 57) |
| AC-FS-03 | Mở app và bấm **📥 Nhập JSON** ⇒ **không** còn log `... is deprecated` |
| AC-FS-04 | Chọn file JSON hợp lệ ⇒ vẫn hiện `Alert` xác nhận với **đúng số lượng** như trước (không hồi quy AC-FMT-03) |
| AC-FS-05 | File không đọc được / sai cú pháp ⇒ vẫn báo lỗi **tiếng Việt** như cũ, không crash, không ghi gì vào DB |
| AC-FS-06 | `fetch` chỉ còn là **lưới an toàn cuối cùng**, không phải đường đọc chính |

## 4. Ảnh hưởng dữ liệu

- **Không** đụng SQLite. Import vẫn đi qua `queries.js` với transaction sẵn có (quy tắc vàng #1, #6 giữ nguyên).
- `copyToCacheDirectory: true` giữ nguyên ⇒ file trong cache của app vẫn tồn tại suốt phiên làm việc.

## 5. Kế hoạch file

| File | Mức bảo vệ | Hành động | Lý do |
|---|---|---|---|
| `src/components/ImportJsonButton.js` | 🟢 | sửa import + lệnh đọc file | Bản gốc của lỗi |
| `specs/features/BUGFIX-07-file-system-read.md` | 🟢 | thêm | Spec tính năng (bắt buộc Cấp ≥1) |
| `specs/SPEC-reference.md` §12/§13, `specs/SPEC-test.md`, `SPEC.md` | 🟢 | thêm dòng | Registry + RC + changelog |

## 6. Thiết kế

Luồng đọc file (mới):

```
DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
  → asset.uri  (file:// trong cache của app)
  → new File(asset.uri).text()        // API chính thức SDK 57, không deprecated
  → (nếu lỗi) fetch(asset.uri).text() // lưới an toàn, giữ nguyên từ v1.2
  → JSON.parse → detectFormat → Alert xác nhận
```

`File` được export từ gói gốc (`node_modules/expo-file-system/build/index.d.ts`: `export { File }`),
và `text()` khai báo trong `internal/NativeFileSystem.types.ts` L169-172.

## 7. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| `text()` trả chuỗi rỗng nếu URI sai | `JSON.parse('')` ném ⇒ rơi vào `Alert` "File JSON không hợp lệ" như cũ (AC-FS-05) |
| Hồi quy nhận diện định dạng | Không sửa `detectFormat`; `npm test` phải xanh |
| Bản `expo-file-system` cũ hơn không có `File` | `package.json` khoá `~57.0.7`; có `fetch` fallback |

## 8. Kiểm thử

- `npm test` — không hỏng ca cũ.
- `npx expo lint` · `npx tsc --noEmit` — 0 lỗi mới.
- `grep -rn "readAsStringAsync" src` ⇒ **rỗng**.
- RC-105 (máy thật): bấm **📥 Nhập JSON** trên **Android** ⇒ nhập được file `packing_legacy.json`
  (FEAT-16), log sạch.
