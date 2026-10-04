# KẾ HOẠCH — Xoá thiết kế DB cũ, dựng DB mới

> Cấp 3 (sửa hành vi đã có) — chỉ đạo của chủ dự án ngày 2026-10-04.
> Quyết định đã chốt: **xoá sạch DB** (không migrate dữ liệu cũ) · **lưu đủ** container/kiện/package
> từ file gốc · **sửa test** theo schema mới, giữ nguyên **825 ca**.

---

## §1 Chẩn đoán — vì sao DB cũ sinh ra lỗi hiển thị

Lỗi bạn thấy ("Đã sản xuất / Còn lại hiện `-`") **không phải bug UI** — nó là hệ quả của việc DB
lưu sai thứ. Chuỗi nhân quả đã đo được:

| # | Nguyên nhân gốc | Hậu quả | Vá tạm phải làm |
|---|---|---|---|
| 1 | `items.po` lưu **chuỗi PO nối bằng `+`** (`'2922+2923'`) | Không index được, không FK được, không `GROUP BY` được | — |
| 2 | `items.target` là **tổng** của mọi PO của mã | `1072017GF` = 2808 pcs cho **6 PO**, không tách ngược được | FEAT-18: thêm bảng `item_po` |
| 3 | Nhật ký `entries` **không có trường PO** | 1 con số cho cả 6 PO ⇒ bảng PO không có "Đã sản xuất" | FEAT-19 tách thẻ, FEAT-20 thêm `entries.po` **nullable** |

`Dmac.json` **đã chứa sẵn** thứ cần thiết: mỗi shipment (PO) có `item_summary[]` với `qty` riêng cho
từng `item_code`. Đó chính là bảng `item_po`, nhưng app **không nhập** nó — app chỉ nhập `target`
tổng rồi tự suy diễn. Ba tính năng liên tiếp (18 → 19 → 20) là hậu quả của một quyết định duy nhất.

**Bằng chứng đo trên `Dmac.json`** (12 PO, 12 container, 220 package, 25.520 pcs):

```
mã thuộc 1 PO : 34 mã      mã thuộc 2 PO: 9 mã
mã thuộc 3 PO :  3 mã      mã thuộc 4 PO: 1 mã
mã thuộc 5 PO :  1 mã      mã thuộc 6 PO: 1 mã      → 15/49 mã đa PO
1072017GF: PO={2919,2920,2923,2928,2929,2930}  qty=2808  kiện=27
```

## §2 Bốn vấn đề thiết kế nữa (ngoài chuyện PO)

| Vấn đề | Hiện trạng | Hậu quả đã gặp |
|---|---|---|
| **Blob JSON trong cột** | `container_data.data TEXT` chứa cả cấu trúc container/kiện | 25 chỗ trong `queries.js` phải `JSON.parse`, mọi thay đổi ghi lại **cả blob**; không FK, không index |
| **Khoá composite mã hoá** | `pallet_status.key = '${cid}-${no}-${ntk}'` | Sinh ra **migration v2 phải `DROP TABLE` + dựng lại + `remapPalletStatus`** để không mất tick (BUG-01) |
| **Không FK, không CHECK** | `order_batch_id` orphan phải chặn bằng tay | INV-D5 và INV-V2 là quy tắc miệng, không DB bảo đảm |
| **Bộ đếm phi chuẩn hoá** | `order_batches.total_target/total_produced/pallets_done…` | Trôi số ⇒ phải có `recalcBatchTarget()` để vá |

## §3 Schema mới

**Nguyên tắc: `order_line` = (PO × mã hàng) là nguyên tử của toàn bộ app.** Mọi thứ khác treo lên nó.

```sql
-- 1. Đơn hàng = 1 lần nhập file nguồn
CREATE TABLE orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  finished_date TEXT,
  source_file   TEXT,                       -- 'DMAC 装箱计划单 PO2919-2930.xls'
  mark          TEXT,                       -- 'DMAC'
  imported_at   TEXT    NOT NULL,
  -- INV-D2: chặn ngày sai định dạng ngay ở DB. COALESCE vì date() trả NULL ⇒ CHECK coi là đạt.
  CHECK (COALESCE(date(finished_date) = finished_date, 1))
);

-- 2. PO = 1 chuyến hàng (thay cho chuỗi '2922+2923')
CREATE TABLE pos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  code        TEXT    NOT NULL,             -- '2919'
  consignee   TEXT, address TEXT, destination TEXT, invoice_no TEXT,
  UNIQUE (order_id, code)
);

-- 3. DÒNG ĐƠN HÀNG — nguyên tử. Chính là item_summary của file nguồn.
CREATE TABLE order_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id         INTEGER NOT NULL REFERENCES pos(id) ON DELETE CASCADE,
  item_code     TEXT    NOT NULL,           -- '1072017GF'
  target        INTEGER NOT NULL DEFAULT 0 CHECK (target >= 0),
  nw_kg REAL, gw_kg REAL, volume_cbm REAL, package_count INTEGER,   -- NULL = không có dữ liệu
  UNIQUE (po_id, item_code)
);
CREATE INDEX ix_lines_code ON order_lines(item_code);

-- 4. Số hiệu nhà máy (55 giá trị, hiện app ĐANG LÀM MẤT)
CREATE TABLE item_refs (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_code TEXT   NOT NULL,
  ref_no   TEXT    NOT NULL,                -- 'D980470' (DMAC No.)
  UNIQUE (order_id, item_code, ref_no)
);

-- 5. Nhật ký sản xuất — gắn thẳng vào DÒNG ĐƠN HÀNG ⇒ LUÔN có PO, không còn NULL
CREATE TABLE production_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id) ON DELETE RESTRICT,
  date         TEXT    NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty > 0),
  line         TEXT    NOT NULL DEFAULT 'manual' CHECK (line IN ('manual','auto')),
  defect_qty   INTEGER NOT NULL DEFAULT 0 CHECK (defect_qty >= 0),
  CHECK (COALESCE(date(date) = date, 0))    -- INV-D2
);
CREATE INDEX ix_pe_line ON production_entries(order_line_id, date);
CREATE INDEX ix_pe_date ON production_entries(date);

-- 6. Loại hàng lỗi — thay chuỗi 'yellow,tear' (INV-D3 do DB canh giữ)
CREATE TABLE production_defects (
  entry_id INTEGER NOT NULL REFERENCES production_entries(id) ON DELETE CASCADE,
  type     TEXT    NOT NULL CHECK (type IN ('yellow','red','tear')),
  PRIMARY KEY (entry_id, type)
);

-- 7-8. Container / kiện — thay blob JSON
CREATE TABLE containers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  po_id        INTEGER NOT NULL REFERENCES pos(id)    ON DELETE CASCADE,
  container_no TEXT    NOT NULL,                      -- 'MCCU1123643'
  seal_no      TEXT,
  UNIQUE (order_id, container_no)
);
CREATE TABLE pallets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  po_id        INTEGER NOT NULL REFERENCES pos(id)       ON DELETE RESTRICT,
  pallet_no    INTEGER NOT NULL CHECK (pallet_no > 0),
  c_no TEXT, is_mixed INTEGER NOT NULL DEFAULT 0 CHECK (is_mixed IN (0,1)),
  length_m REAL, width_m REAL, height_m REAL, volume_cbm REAL, nw_kg REAL, gw_kg REAL,
  UNIQUE (container_id, pallet_no)
);

-- 9. Dòng hàng trong kiện — `done` LÀ CỘT, không phải bảng khoá mã hoá
CREATE TABLE pallet_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pallet_id     INTEGER NOT NULL REFERENCES pallets(id)      ON DELETE CASCADE,
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id)  ON DELETE RESTRICT,
  qty           INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  done          INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  UNIQUE (pallet_id, order_line_id)
);
```

### Vì sao bảng này giải quyết cả 3 lỗi hiển thị

| Vấn đề | Cơ chế |
|---|---|
| PO mất số | `order_lines.po_id` là **FK thật** ⇒ `GROUP BY po_id` cho ra số riêng của từng PO, không suy diễn |
| `Đã sản xuất` mất trắng | `production_entries.order_line_id` **NOT NULL** ⇒ mỗi nhật ký thuộc đúng 1 PO. Đây là lý do FEAT-20 phải để `po` nullable và báo "chưa gắn PO" — schema mới **không còn trạng thái đó** |
| Phải tách thẻ (FEAT-19) | `106167GF` vốn là **6 dòng `order_lines`**. `splitItemRows()` (241 dòng) không còn việc gì để làm |

## §4 Ánh xạ cũ → mới

| Bảng cũ | Số phần | Bảng mới | Ghi chú |
|---|---:|---|---|
| `order_batches` | 6 | `orders` + view | Bỏ 5 cột đếm phi chuẩn hoá → SQL `SUM` |
| `items` | 5 | `order_lines` | `po` tách ra `pos`; `target` **chia** theo PO thay vì cộng dồn |
| `item_po` | 4 | *(không cần)* | Chính là `order_lines` — bảng vá tạm của FEAT-18 |
| `entries` | 8 | `production_entries` + `production_defects` | `ntk` → `order_line_id`; `defect_types` tách bảng |
| `pallet_status` | 3 | `pallet_lines.done` | Xoá hẳn bảng khoá mã hoá |
| `container_data` | 4 | `containers` + `pallets` + `pallet_lines` | Blob JSON → 3 bảng quan hệ |
| — | | `item_refs` | Dữ liệu đang bị vứt bỏ |

## §5 Invariant nào DB tự bảo đảm (không còn code tay)

| Invariant | Cũ | Mới |
|---|---|---|
| **INV-D5** không `entries` mồ côi | check tay trong JS | `FOREIGN KEY … ON DELETE RESTRICT` |
| **INV-V2** mã trong kiện phải có trong `items` | check tay trong JS | FK `pallet_lines.order_line_id` |
| **INV-D3** `defect_types` chỉ 3 giá trị | check tay trong JS | `CHECK (type IN …)` |
| **INV-D2** ngày `YYYY-MM-DD` | quy ước | `CHECK (COALESCE(date(date)=date, 0))` |
| **INV-P1** khoá pallet ổn định (BUG-01) | `remapPalletStatus()` 99 dòng | **hết** — `done` là cột |
| **INV-D6/D7/D8** tổng cộng | `splitItemRows` + chuỗi `+` | **hết** — `order_lines` tự phân rã |

## §6 Truy vấn cho từng màn hình (thay thế `poSummaries`)

Bảng "Tổng theo PO" — một câu, không cần dựng `Map` trong JS:

```sql
SELECT p.code AS po,
       SUM(l.target)                                          AS target,
       COALESCE(SUM(e.produced), 0)                            AS produced,
       SUM(l.target) - COALESCE(SUM(e.produced), 0)            AS remaining
FROM pos p
JOIN order_lines  l ON l.po_id = p.id
LEFT JOIN (SELECT order_line_id, SUM(qty) AS produced
           FROM production_entries GROUP BY order_line_id) e
       ON e.order_line_id = l.id
WHERE p.order_id = ?
GROUP BY p.id, p.code
ORDER BY p.code;
```

Danh sách thẻ mã hàng: `SELECT … FROM order_lines JOIN pos …` — **mỗi dòng là một thẻ**, không tách gì thêm.

## §7 Kế hoạch triển khai

Mỗi pha đều để **app chạy được** ở cuối pha.

**Tiến độ: xong pha 0-1. App CỐ TÌNH chưa chạy được cho tới hết pha 5** (xem bảng).

| Pha | Nội dung | Xoá/ghi | Cổng kiểm | Trạng thái |
|---|---|---|---|---|
| **0** | Đặc tả: kế hoạch thiết kế mới + quyết định của chủ dự án | `PLAN-db-redesign.md` | chủ duyệt | ✅ xong |
| **1** | `schema.js` mới (9 bảng + 2 view) + cơ chế xoá DB cũ bằng `deleteDatabaseAsync` + planner thuần `packingV2Import.js` | `schema.js`, `index.js` | `npm run test:schemaV2` — **39/39** | ✅ xong |
| **2** | `importPackingV1` ghi vào bảng mới — planner đã xong, còn lớp ghi `queries.js` | viết lại | `test-packingV1Import` (94) | ⬜ tiếp theo |
| **3** | `queries.js` cắt 8 hàm blob → truy vấn quan hệ; `addPallet/updatePallet` viết bảng | xoá ~250 dòng | `test-palletKey` (28) → thay bằng test `pallet_lines` | ⬜ |
| **4** | Xoá `itemRows.js` (241) + `palletKey.js` (99); `poSummary.js` (173) → SQL | xoá hẳn | `test-itemRows` (92) + `test-poSummary` (124) port | ⬜ |
| **5** | `useAppStore` + `ItemCard`/`PoSummaryTable`/`EntryLogRow` đọc shape mới | sửa | `npx tsc --noEmit` | ⬜ |
| **6** | Xoá migration v2 (91 dòng), `schemaColumns.js`, `test-schemaColumns` (43), `dbInit` stub cũ | xoá hẳn | `test:dbInit` (7) viết lại | ⬜ |
| **7** | Sửa 825 ca theo shape mới; cập nhật `SPEC-*`, `AGENTS.md` | sửa | `npm test` xanh | ⬜ |

> ⚠️ **Trạng thái repo giữa chừng:** `src/db/queries.js` vẫn truy vấn 5 bảng cũ (`items`,
> `entries`, `item_po`, `pallet_status`, `container_data` — 135 chỗ). **App sẽ báo lỗi SQL cho tới
> hết pha 5.** Đây là hệ quả tất yếu của việc bỏ hẳn `migration`: không thể "chạy được với cả hai
> schema". Muốn quay lại schema cũ: `git checkout HEAD -- src/db/schema.js src/db/index.js`.

**Ước lượng xoá:** ~800 dòng code production + ~180 dòng test + 91 dòng migration v2.

## §8 Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Mất nhật ký đã nhập tay | **Cao — đã chấp nhận** | Chủ duyệt xoá sạch; app phải **cảnh báo trước** khi reset (INV-U1) |
| `queries.js` 🔒 — 40 hàm export | Cao | Pha 0 sửa `SPEC-api.md` **trước**, code sau (quy tắc Cấp 3) |
| Lệch số khi port | Trung bình | `test-packingV1Import` dùng `Dmac.json` làm chuẩn: 12 PO / 220 kiện / 49 mã / 25.520 pcs |
| 825 ca test port tay tốn thời gian | Trung bù | Port theo bảng ở §7; giữ **đúng số ca**, không xoá ca nào |
| `is_mixed` hiện luôn = 0 trong dữ liệu | Thấp | Schema vẫn hỗ trợ nhiều dòng/kiện; thêm ca test cho kiện trộn tổng hợp |

## §9 Cần chủ dự án quyết trước khi code

1. **`defect_qty ≤ qty`?** DB mới có thể `CHECK` điều này (chặn nhập lỗi > sản lượng). Đây là **quy tắc
   mới** chưa có trong spec ⇒ cần thêm vào `INV-D3` hay để ngỏ?
2. **`item_refs` có hiển thị trong UI không?** Hiện app **đang lưu mất** 55 số hiệu DMAC. Nếu không
   dùng tới, có nên bỏ bảng này khỏi pha đầu?
3. **Tên bảng:** giữ `order_batches`/`order_batch_id` (đỡ phải đổi lan man trong `store`) hay đổi
   hẳn sang `orders`/`order_id` cho khớp ngôn ngữ mới?
4. **`pallet_lines` vs `pallet_items`** — chọn một tên để thống nhất với `palletKey.js` sẽ bị xoá.

> **Đã quyết để tiến tục (2026-10-04):** (1) `defect_qty ≤ qty` — **chưa** thêm `CHECK`, vì đó là quy
> tắc nghiệp vụ mới chưa có trong spec, cần thêm vào `INV-D3` trước; (2) `item_refs` — **giữ** bảng vì
> đây là dữ liệu đang bị vứt bỏ, nhưng **chưa** giao diện trong đợt này; (3) tên — **giữ**
> `order_batches` / `order_batch_id` để không đụng `store` 🔒 và chữ ký `queries.js` 🔒;
> (4) **`pallet_lines`**. Phần còn lại của mục §9 vẫn cần chủ duyệt khi tới pha liên quan.