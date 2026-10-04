// src/db/schema.js
// FEAT-21 — THIẾT KẾ LẠI TOÀN BỘ CƠ SỞ DỮ LIỆU (Cấp 3, chỉ đạo chủ dự án 2026-10-04).
// Xem specs/PLAN-db-redesign.md để biết vì sao bản cũ bị thay.
//
// ============================================================================
// VÌ SAO THIẾT KẾ LẠI
// ============================================================================
// Bản cũ để `items.po` là **chuỗi PO nối bằng `+`** và `items.target` là **tổng** của mọi PO
// của mã đó. Hệ quả đo được trên `src/data/Dmac.json`:
//
//   49 mã hàng, trong đó **15 mã thuộc nhiều PO**.
//   `1072017GF` thuộc **6 PO** (2919, 2920, 2923, 2928, 2929, 2930) với 2.808 pcs.
//
// Một số không biểu diễn được quan hệ đó ⇒ app không tách được số lượng theo từng PO, và bảng
// "Tổng theo PO" mất trắng cột "Đã sản xuất"/"Còn lại" (12/12 dòng hiện `-` trên `Dmac.json`).
// Ba tính năng vá liên tiếp đều do một quyết định thiết kế này: FEAT-18 (`item_po`),
// FEAT-19 (tách thẻ), FEAT-20 (`entries.po` nullable ⇒ trạng thái "chưa gắn PO").
//
// File nguồn `Dmac.json` **đã có sẵn** thứ cần: mỗi PO có `item_summary[]` với `qty` riêng cho
// từng `item_code`. Bản cũ nhập `target` tổng rồi tự suy diễn; bản này lưu thẳng cái có sẵn đó.
//
// ============================================================================
// NGUYÊN TẮC
// ============================================================================
// `order_lines` = (PO × mã hàng) là **nguyên tử** của toàn bộ ứng dụng.
//   • `target` nằm trên dòng ⇒ mỗi PO có số riêng, `SUM` được bằng SQL, không dựng `Map` trong JS.
//   • `production_entries.order_line_id` **NOT NULL** ⇒ mọi nhật ký luôn thuộc đúng một PO.
//     Hết trạng thái "chưa gắn PO", hết cảnh báo, hết `—`.
//   • PO là **bảng thật** có FK, không phải chuỗi `+`.
//
// Ba quy tắc vàng của thiết kế mới:
//   1. FK thay cho quy tắc miệng — INV-D5 (không entries mồ côi) và INV-V2 (mã trong kiện phải có
//      trong đơn) do DB bảo đảm, không còn check tay trong JS.
//   2. CHECK thay cho quy ước — INV-D2 (ngày `YYYY-MM-DD`) và INV-D3 (`line`, loại lỗi) do DB chặn.
//   3. `pallet_lines.done` là **cột**, không phải bảng khoá mã hoá ⇒ hết `remapPalletStatus` và hết
//      migration v2 phải `DROP TABLE` dựng lại (nguồn gốc của BUG-01).
//
// Không có bộ đếm phi chuẩn hoá (`total_target`, `pallets_done`…) — xem view ở cuối file.
//
// ============================================================================
// VỀ VIỆC GIỮ TÊN CŨ
// ============================================================================
// Bảng `order_batches` và cột `order_batch_id` **giữ nguyên tên** (không đổi thành `orders`/
// `order_id`) để không phải đổi lan man trong `store/useAppStore.js` 🔒 và chữ ký hàm của
// `db/queries.js` 🔒. Đây là đánh đổi lấy phạm vi thay đổi nhỏ, có chủ đích.

export const DB_FILE = 'production_tracker.db';

/** Số phiên bản schema. Mốc **mới** = 1, vì bản cũ đã dùng 1..5 — không tái sử dụng số cũ. */
export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
PRAGMA journal_mode = WAL;

-- 1. Đơn hàng = 1 lần nhập 1 file nguồn (hoặc đơn tạo tay).
CREATE TABLE IF NOT EXISTS order_batches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  finished_date TEXT,
  source_file   TEXT,
  mark          TEXT,
  imported_at   TEXT    NOT NULL
);
-- CHECK ngày: date(x) trả NULL với ngày sai ⇒ COALESCE cho CHECK coi là ĐẠT, nên phải ép 0.
-- Từ chối được cả dạng sai ('2026-1-4') lẫn ngày không tồn tại ('2026-02-30', '2026-13-45').
CREATE INDEX IF NOT EXISTS ix_batches_status ON order_batches(status, id DESC);

-- 2. PO = 1 chuyến hàng. Thay cho chuỗi '2922+2923' của bản cũ.
CREATE TABLE IF NOT EXISTS pos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_batch_id INTEGER NOT NULL REFERENCES order_batches(id) ON DELETE CASCADE,
  code          TEXT    NOT NULL,
  consignee     TEXT,
  address       TEXT,
  destination   TEXT,
  invoice_no    TEXT,
  UNIQUE (order_batch_id, code)
);

-- 3. DÒNG ĐƠN HÀNG — NGUYÊN TỬ. Chính là item_summary của file nguồn.
--    target là số của RIÊNG PO này, không phải tổng ⇒ mỗi PO có số riêng ngay ở tầng lưu trữ.
CREATE TABLE IF NOT EXISTS order_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id         INTEGER NOT NULL REFERENCES pos(id) ON DELETE CASCADE,
  item_code     TEXT    NOT NULL,
  target        INTEGER NOT NULL DEFAULT 0 CHECK (target >= 0),
  -- NULL = không có dữ liệu (INV-I1: UI ẩn dòng, KHÔNG hiện 0).
  nw_kg         REAL,
  gw_kg         REAL,
  volume_cbm    REAL,
  package_count INTEGER,
  UNIQUE (po_id, item_code)
);
CREATE INDEX IF NOT EXISTS ix_lines_code ON order_lines(item_code);

-- 4. Số hiệu nhà máy ('DMAC No.'). Dmac.json có 55 số hiệu cho 49 mã — bản cũ **vứt bỏ**.
CREATE TABLE IF NOT EXISTS item_refs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_batch_id INTEGER NOT NULL REFERENCES order_batches(id) ON DELETE CASCADE,
  item_code     TEXT    NOT NULL,
  ref_no        TEXT    NOT NULL,
  UNIQUE (order_batch_id, item_code, ref_no)
);

-- 5. Nhật ký sản xuất. Gắn thẳng vào DÒNG ĐƠN HÀNG ⇒ luôn có PO (không còn trường hợp NULL).
CREATE TABLE IF NOT EXISTS production_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id) ON DELETE RESTRICT,
  date          TEXT    NOT NULL CHECK (COALESCE(date(date) = date, 0)),
  qty           INTEGER NOT NULL CHECK (qty > 0),
  line          TEXT    NOT NULL DEFAULT 'manual' CHECK (line IN ('manual', 'auto')),
  defect_qty    INTEGER NOT NULL DEFAULT 0 CHECK (defect_qty >= 0)
);
CREATE INDEX IF NOT EXISTS ix_pe_line ON production_entries(order_line_id, date);
CREATE INDEX IF NOT EXISTS ix_pe_date ON production_entries(date);

-- 6. Loại hàng lỗi — bảng thật thay cho chuỗi 'yellow,tear' (INV-D3 do DB canh giữ).
CREATE TABLE IF NOT EXISTS production_defects (
  entry_id INTEGER NOT NULL REFERENCES production_entries(id) ON DELETE CASCADE,
  type     TEXT    NOT NULL CHECK (type IN ('yellow', 'red', 'tear')),
  PRIMARY KEY (entry_id, type)
);

-- 7. Container — bảng thật thay cho blob JSON container_data.data.
CREATE TABLE IF NOT EXISTS containers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_batch_id INTEGER NOT NULL REFERENCES order_batches(id) ON DELETE CASCADE,
  po_id          INTEGER NOT NULL REFERENCES pos(id) ON DELETE CASCADE,
  container_no   TEXT    NOT NULL,
  seal_no        TEXT,
  UNIQUE (order_batch_id, container_no)
);

-- 8. Kiện (package trong file nguồn).
CREATE TABLE IF NOT EXISTS pallets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  po_id        INTEGER NOT NULL REFERENCES pos(id) ON DELETE RESTRICT,
  pallet_no    INTEGER NOT NULL CHECK (pallet_no > 0),
  c_no         TEXT,
  is_mixed     INTEGER NOT NULL DEFAULT 0 CHECK (is_mixed IN (0, 1)),
  length_m     REAL,
  width_m      REAL,
  height_m     REAL,
  volume_cbm   REAL,
  nw_kg        REAL,
  gw_kg        REAL,
  UNIQUE (container_id, pallet_no)
);
CREATE INDEX IF NOT EXISTS ix_pallets_po ON pallets(po_id);

-- 9. Dòng hàng trong kiện. done LÀ CỘT.
--    Kiện 1 mã hàng  ⇒ đúng 1 dòng ⇒ tick dòng = tick kiện (giống hành vi cũ).
--    Kiện nhiều mã   ⇒ tick từng dòng (giống hành vi cũ).
--    Không cần khoá mã hoá (bản cũ: container-no-ntk) ⇒ hết INV-P1 và hết remapPalletStatus.
CREATE TABLE IF NOT EXISTS pallet_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pallet_id     INTEGER NOT NULL REFERENCES pallets(id) ON DELETE CASCADE,
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id) ON DELETE RESTRICT,
  qty           INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  done          INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  UNIQUE (pallet_id, order_line_id)
);
CREATE INDEX IF NOT EXISTS ix_plines_line ON pallet_lines(order_line_id);
`;

/**
 * Bật `foreign_keys` cho ĐÚNG connection này.
 *
 * SQLite mặc định `foreign_keys = OFF`, và pragma này **theo từng connection** chứ không theo
 * database ⇒ phải bật ngay sau khi mở, nếu không mọi FK ở trên chỉ là trang trí.
 * Đây là thứ làm cho INV-D5 và INV-V2 trở thành bảo đảm của DB thay vì quy tắc miệng.
 */
export async function enableForeignKeys(db) {
  await db.execAsync('PRAGMA foreign_keys = ON');
}

/**
 * View tổng hợp — thay cho các cột đếm phi chuẩn hoá (`total_target`, `pallets_done`…).
 *
 * Vì sao có view: bảng PO cần `Đã sản xuất` / `Còn lại` ở **mọi** nơi (bảng tổng theo PO, thẻ mã,
 * lịch sử). Tính một lần ở tầng DB ⇒ không phải dựng `Map` ở JS, và mọi màn hình **không thể**
 * hiển thị khác nhau vì tự tính riêng.
 *
 * `v_line_progress` là hạt nhỏ nhất: 1 dòng = 1 thẻ mã hàng (1 dòng `order_lines`).
 */
export const CREATE_VIEWS_SQL = `
DROP VIEW IF EXISTS v_line_progress;
DROP VIEW IF EXISTS v_po_progress;

-- Tiến độ từng DÒNG ĐƠN HÀNG (tức từng thẻ mã hàng).
-- Ghi chú: defect_qty là TỪỒNG PHẦN của qty, không cộng thêm (SPEC-data.md §5.4).
CREATE VIEW v_line_progress AS
SELECT
  l.id                AS order_line_id,
  l.po_id             AS po_id,
  p.order_batch_id    AS order_batch_id,
  p.code              AS po,
  l.item_code         AS item_code,
  l.target            AS target,
  l.nw_kg, l.gw_kg, l.volume_cbm, l.package_count,
  COALESCE(e.produced, 0)  AS produced,
  COALESCE(e.defect, 0)    AS defect,
  l.target - COALESCE(e.produced, 0) AS remaining
FROM order_lines l
JOIN pos p ON p.id = l.po_id
LEFT JOIN (
  SELECT order_line_id,
         SUM(qty)        AS produced,
         SUM(defect_qty) AS defect
  FROM production_entries
  GROUP BY order_line_id
) e ON e.order_line_id = l.id;

-- Tổng theo PO: SUM target = SUM order_lines.target = tổng cả đơn (INV-D6).
-- SUM produced = SUM production_entries.qty; mỗi nhật ký chỉ vào đúng một PO nên KHÔNG vượt tổng (INV-D8).
CREATE VIEW v_po_progress AS
SELECT
  v.order_batch_id,
  v.po_id,
  v.po,
  COUNT(*)                        AS item_count,
  SUM(v.target)                   AS target,
  SUM(v.produced)                 AS produced,
  SUM(v.defect)                   AS defect,
  SUM(v.target) - SUM(v.produced) AS remaining
FROM v_line_progress v
GROUP BY v.order_batch_id, v.po_id, v.po;
`;