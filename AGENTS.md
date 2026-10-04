This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
npm test                    # 13 script unit + 7 kịch bản E2E / 825 ca: unit test hàm thuần (utils/validateQty.js, utils/palletKey.js, utils/deleteItem.js, utils/poSummary.js, utils/itemRows.js, utils/deleteItemsByPo.js, utils/date.js, utils/archiveDelete.js, utils/packingV1.js, utils/importFormat.js, utils/packingV1Import.js, utils/schemaColumns.js) + schema mới trên SQLite thật (scripts/test-schemaV2.mjs) + 2 kịch bản E2E khởi tạo DB (scripts/test-dbInit.mjs), không cần Expo/máy thật
npm run test:pallet         # chỉ test khoá pallet / remap trạng thái tick (FEAT-10)
npm run test:deletePo       # chỉ test xoá hàng loạt theo PO (FEAT-13)
npm run test:date           # chỉ test ngày cục bộ (BUG-02)
npm run test:archive        # chỉ test thông báo xoá đơn lưu trữ (FEAT-15)
npm run test:packing        # chỉ test converter packing list schema_version 1 → legacy (FEAT-16)
npm run test:format         # chỉ test nhận diện/đếm định dạng file import (FEAT-16)
npm run test:packingImport  # chỉ test kế hoạch import packing_data.json + 4 trường mỗi mã (FEAT-17)
npm run test:schema         # chỉ test cột migration idempotent / an toàn tên cột (BUGFIX-08)
npm run test:migrations     # ⚠️ TẠM GỎ (FEAT-21 pha 6): test chuỗi migration cũ, đã bị bỏ hẳn. Đã gỡ khỏi `npm test`
npm run test:schemaV2       # schema mới (9 bảng + 2 view) trên SQLite thật + Dmac.json thật — 39 ca (FEAT-21)
npm run test:itemRows       # chỉ test tách dòng mã nhiều PO + bộ lọc (FEAT-19)
npm run test:dbInit         # E2E tầng khởi tạo DB: chạy src/db/index.js nguyên bản với expo-sqlite giả (BUGFIX-08)
npm run convert:packing      # packing_data.json → src/data/packing_legacy/packing_legacy.json (file ĐỂ IMPORT VÀO APP)
```

Run lint and typecheck before declaring any task done.

> Lỗi `Parse errors in imported module '@/db/queries'` ở file **không** sửa ⇒ cache ESLint bị bẩn
> (`expo lint` dùng `--cache` trong `.expo/cache/eslint/`). Chạy `rm -rf .expo/cache/eslint` rồi lint lại.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

---

## Dự án: "Theo dõi sản xuất hàng ngày"

Dự án này là ứng dụng Expo (SDK 57) "Theo dõi sản xuất hàng ngày". Trước khi thay đổi code:

1. Đọc **`specs/SPEC-rules.md`** — quy trình, 10 quy tắc vàng, mức bảo vệ file, invariants, Definition of Done
2. Truy cập nhanh theo nhu cầu:
   - **`specs/SPEC-api.md`** — signature hàm queries.js, state/action store, props component
   - **`specs/SPEC-acceptance.md`** — Acceptance Criteria (AC-ITEM, AC-CONT, AC-HIST, AC-IMP)
   - **`specs/SPEC-data.md`** — schema bảng, định dạng key pallet, migration
   - **`specs/SPEC-test.md`** — checklist hồi quy (RC-01..RC-22) + unit test plan
3. `SPEC.md` (root) là trang chủ với quick-start và liên kết tới tất cả module.

