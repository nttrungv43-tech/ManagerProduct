# SPEC-Changelog

> **Từ SPEC.md §15** — [Quay lại SPEC.md](SPEC.md) | [SPEC-reference.md](SPEC-reference.md)

Mỗi thay đổi sau này: thêm một dòng ở đây, cập nhật `§12` Registry và các AC liên quan.

| Ngày | Phiên bản | Thay đổi |
|---|---|---|
| 2026-10-01 | 1.5 | **FEAT-12:** Bảng `Tổng theo PO` ở tab Mã hàng — mỗi PO một dòng: Tổng / Đã sản xuất / Còn lại. Quy tắc chủ dự án chốt: **mã thuộc nhiều PO (`po` có `+`) gom nhóm `Nhiều PO`**, không cộng vào từng PO ⇒ **Σ dòng luôn khớp tổng toàn đơn**. Thêm `src/utils/poSummary.js` + `src/components/PoSummaryTable.js`. AC-ITEM-20..29 ✅ · `INV-D6` · `SPEC-data.md` §5.6 · `scripts/test-poSummary.mjs` (56 ca) → `npm test` **170 ca đạt**. **Cấp 1** — dữ liệu dẫn xuất, không schema, không migration, không đổi chữ ký. **Không có breaking change.** |
| 2026-09-30 | 1.5 | **FEAT-11:** Nút `✕ Xoá mã hàng` trực tiếp trên thẻ ở tab Mã hàng — rút từ **4 chạm** (Sửa → cuộn → Xoá → Alert) xuống **2 chạm**. Tách `Alert` xác nhận + bảng dịch lỗi ra `src/utils/deleteItem.js` để sheet và thẻ dùng chung. AC-EDIT-26..36 ✅ · `INV-V3` (chỉ ghi vào batch `active`) · `scripts/test-deleteItem.mjs` (39 ca) → `npm test` **111 ca đạt**. **Cấp 1** — không schema, không migration, không đổi chữ ký. **Không có breaking change.** |
| 2026-09-30 | 1.5 | **FEAT-10:** Thêm/sửa/xoá **sản phẩm** (`items`) và **kiện** (`container_data`) theo PO & container. Thêm `src/utils/palletKey.js` (hàm thuần), `src/db/migrations.js` (migration v2), `ItemEditSheet`/`PalletEditSheet`. **Đổi định dạng khoá pallet: `${cid}-${no}-${idx}` → `${cid}-${no}-${ntk}`** và sửa PK `pallet_status` (**BUG-01**). AC-EDIT-01..25 ✅. INV-V2/INV-P1. `SPEC-data.md` §5.2/§5.5. `npm test` 72 ca đạt. **Không đổi chữ ký hàm nào.** |
|---|---|---|
| 2026-09-30 | 1.4 | **FEAT-09:** Kiểm tra hạn mức đơn đặt hàng — `SUM(entries.qty) ≤ items.target` cho mọi `ntk` có `target>0` trong batch `active`, + validate/chuẩn hoá giá trị số. Thêm `src/utils/validateQty.js` (hàm thuần: `parseQty`, `checkQtyLimit`, `formatQtyError`) và `queries.getItemTargetUsage`. `addEntry`/`updateEntry` (queries + store) trả `{ok, error?}`; `importEntriesFromJson` thêm khoá `skippedOver`. AC-ITEM-17/18/19, AC-IMP-13 ✅. INV-V1. `SPEC-data.md` §5.4. RC-23..31. Unit test: `npm test` (44 ca đạt). **Không migration, không đổi chữ ký.** |
| 2026-09-29 | 1.3 | **FEAT-08 phase 2:** Thêm bảng `container_data` (Cấp 2), hàm `importContainerData`/`fetchContainerData`/`countPalletsDoneWithData` trong queries.js. Packing list import cả container/pallet structure; `ContainersScreen` dùng DB data thay seed, fallback khi null. `finishOrder` chấp nhận optional `containers` param. AC-IMP-10..12 🟡. DEBT-02 → 🟡. Chia SPEC.md thành module (v1.0 modular). |
| 2026-09-28 | 1.2 | **Fix:** `ImportJsonButton` — `copyToCacheDirectory: true` + `fetch` fallback. Lint fix: `_layout.tsx` deps `init`; `ContainersScreen.js` ternary→if/else; `ItemsScreen.js` xóa `View` unused; eslint-disable. |
| 2026-09-28 | 1.1 | **FEAT-08:** Import JSON. 2 format: (1) Entries — `importEntriesFromJson`; (2) Packing list — `importItemsFromJson`, INSERT OR REPLACE + `total_target`. **BUG-05 fix:** `dataVersion` trong store + `HistoryScreen` useEffect deps. AC-HIST-07 → ✅. |
| 2026-09-28 | 1.0 | Lập spec ban đầu từ HTML gốc + Expo SDK 57. BUG-01..06, UX-01, DEBT-01..03, backlog FEAT-01..07 |
| 2026-09-29 | 1.0-modular | **Chia SPEC.md:** Split thành 8 file module trong `specs/` (SPEC-rules, SPEC-api, SPEC-acceptance, SPEC-data, SPEC-test, SPEC-reference, SPEC-changelog, SPEC-template). Cập nhật AGENTS.md trỏ tới module files. |
