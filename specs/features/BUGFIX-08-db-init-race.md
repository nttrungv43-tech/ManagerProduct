# BUGFIX-08 — Lỗi khởi động `no such column: nw_kg`

> **TRẠNG THÁI: ĐÃ TRIỂN KHAI (2026-10-04)** — sửa `src/db/index.js` (🔒) + `migrations.js` (🔒)
> + `src/utils/schemaColumns.js` (🔒). **Xem mục 1.0: bản sửa phải 2 lần; vòng 1 (cache promise)
> KHÔNG giải quyết được lỗi trên máy thật, vòng 2 mới là nguyên nhân gốc.**
> Cấp thay đổi: **Cấp 3** (sửa lỗi ở tầng khởi tạo DB, ảnh hưởng mọi truy vấn).
> Quay lại: [SPEC.md](../../SPEC.md) | [SPEC-rules.md](../SPEC-rules.md) | [SPEC-data.md](../SPEC-data.md) | [SPEC-api.md](../SPEC-api.md) | [SPEC-test.md](../SPEC-test.md)

---

## 1.0 Tóm tắt: hai vòng chẩn đoán

| Vòng | Giả thuyết | Kết quả |
|---|---|---|
| 1 | `getDb()` trả về DB **chưa migrate** do cache instance không nguyên tử | **Sai.** Dù đã cache promise (đã kiểm chứng bằng E2E: 5 lời gọi song song chỉ mở 1 lần, mọi truy vấn đều sau `ALTER`), **lỗi vẫn tái hiện trên máy thật**. Giữ lại thay đổi vì nó đúng và cần thiết, nhưng **không phải nguyên nhân**. |
| 2 | `PRAGMA user_version` **không khớp** schema thật ⇒ v3 không bao giờ chạy lại | **Đúng khớp với hiện tượng.** `runMigrations` chỉ chạy migration khi `version > user_version`; nếu một bản build cũ đã đóng dấu `user_version = 3` trong khi `ALTER TABLE` **không có hiệu lực** (app bị tắt giữa lúc chạy, hoặc build cũ đóng dấu số phiên bản vội), thì v3 **không bao giờ chạy lại** ⇒ `no such column: nw_kg` **vĩnh viễn**, mọi lần mở. Sửa bằng **schema guard** kiểm chứng bằng quan sát, không tin `user_version`. |

> **Bài học (ràng buộc kỹ thuật):** `PRAGMA user_version` là *ý định*, không phải *sự thật*. Tầng khởi tạo
> **không được tin** nó là đủ — phải xác minh schema thật trước khi bất kỳ `SELECT` nào tham chiếu
> cột mới. Xem AC-DB-08.

---

## 1. Bối cảnh & nguyên nhân

Sau FEAT-17, mở app báo:

```
Error: Uncaught (in promise, id: 0) Error: Call to function 'NativeDatabase.prepareAsync' has been rejected.
→ Caused by: Error code : no such column: nw_kg
```

### 1.1 Giả thuyết vòng 1 (⚠️ ĐÃ BỊ BÁC BỎ — không phải nguyên nhân lỗi trên máy thật)

`src/db/index.js` (trước khi sửa):

```js
let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;                              // (A)
  dbInstance = await SQLite.openDatabaseAsync('production_tracker.db');  // (B)
  await dbInstance.execAsync(CREATE_TABLES_SQL);
  await runMigrations(dbInstance);                                // (C) ← 4 cột `items` được thêm ở đây
  await ensureActiveBatch(dbInstance);
  return dbInstance;
}
```

| Bước | Vấn đề |
|---|---|
| (B) | `dbInstance` được gán **trước** khi migration chạy |
| (A) | Lời gọi `getDb()` **thứ hai** thấy `dbInstance !== null` ⇒ trả về ngay DB **chưa** migrate, không đợi (C) |
| (C) | `runMigrations` ⇒ `migration v3` thêm `nw_kg`, `gw_kg`, `volume_cbm`, `package_count` |

⇒ Cửa sổ thời gian giữa (B) và (C): mọi truy vấn chạy trong cửa sổ này **không** thấy 4 cột mới.
Store `init()` gọi `fetchItemsWithStats()` (`SELECT … nw_kg, …`) ngay sau `getDb()` ⇒ ném lỗi.
Lỗi bị báo là **unhandled promise rejection** vì `useEffect(() => { init(); })` không `catch`.

### 1.2 Vì sao lỗi này **chỉ** xuất hiện từ FEAT-17

Trước FEAT-17, `fetchItemsWithStats` chỉ `SELECT ntk, po, target` — cả 3 cột đã có từ migration v1.
Lỗi "trả DB chưa migrate" **vẫn tồn tại** nhưng vô hại vì không câu `SELECT` nào tham chiếu cột của
migration v2/v3. FEAT-17 làm nó lộ ra.

### 1.3 Vì sao có lời gọi song song

`init()` được gọi từ `useEffect` ở `src/app/_layout.tsx`. Mọi mount/remount lại (Fast Refresh khi
đang sửa code, Expo Router dựng lại cây route, reload) đều có thể gọi `init()` lần nữa **trong khi**
lần đầu còn đang chạy migration. Không cần một lỗi hiếm — chỉ cần hai lần gọi chồng nhau là đủ.

### 1.4 Nguyên nhân gốc thật sự: `user_version = 3` nhưng schema chưa có cột

**Bằng chứng thuộc về code** (không cần máy thật):

- Trong toàn bộ `src/`, **chỉ `queries.js:25`** (`fetchItemsWithStats`) tham chiếu `nw_kg` ⇒ lỗi
  đến từ câu `SELECT` đó, không từ chỗ khác.
- `migration v3` **đã** idempotent và **đã** được gọi ở `getDb()` trước `fetchItemsWithStats` ⇒
  nếu `user_version < 3` thì cột chắc chắn được thêm trước khi query. Vậy mà lỗi vẫn xảy ra ⇒
  **`user_version` phải ≥ 3 trong khi schema vẫn thiếu cột**.

Cơ chế gây ra trạng thái lệch đó:

```js
// src/db/migrations.js — runMigrations()
for (const m of MIGRATIONS) {
  if (m.version > current) {        // ← chỉ dựa vào user_version
    await m.up(db);
    await db.execAsync(`PRAGMA user_version = ${m.version}`);
  }
}
```

Nếu `ALTER TABLE` trong `m.up()` **không có hiệu lực** (app bị tắt/nền bị giết đúng giữa lúc chạy;
`ALTER` không nằm trong transaction nên không rollback được; hoặc bản build cũ đóng dấu số phiên bản
vội), `user_version` vẫn có thể lên 3. Từ đó `3 > 3` là sai ⇒ **v3 không bao giờ chạy lại**, và
`SELECT nw_kg` hỏng **vĩnh viễn** ở mọi lần mở, mọi lần cài lại app — đúng triệu chứng quan sát
được (sửa code, `expo start -c`, build lại mà lỗi vẫn y nguyên).

Hệ quả về mặt thiết kế: `PRAGMA user_version` là **ý định**, không phải **sự thật**. Cơ chế
migration hiện tại **không tự phát hiện** được trạng thái lệch này ⇒ cần một lớp xác minh độc lập.

### 1.5 Cách sửa: schema guard không phụ thuộc `user_version`

Sau `runMigrations`, gọi `ensureItemMetricColumns(db)` (`src/utils/schemaColumns.js`):

1. Đọc `PRAGMA table_info(items)` — **quan sát schema thật**, không đọc `user_version`.
2. `ALTER TABLE … ADD COLUMN` cho từng cột còn thiếu (bỏ qua lỗi `duplicate column name` — có thể
   tiến trình khác vừa thêm).
3. Đọc lại `PRAGMA table_info` để **xác minh bằng quan sát**: chỉ coi là xong khi đủ 4 cột.
4. Trả về `{ ok, added, existing, missing, error }` — **không ném lỗi**, để lớp gọi báo cáo.

Idempotent (AC-DB-04) ⇒ gọi ở cả `v3.up()` và `getDb()` đều an toàn. Vì thế nó chữa được **mọi** nguyên
nhân khiến schema thiếu cột, kể cả nguyên nhân chưa lường trước, thay vì chỉ vá đúng một tình huống.

---

## 2. Phạm vi

- **Làm:** `getDb()` cache **promise** thay vì instance ⇒ mọi lời gọi (kể cả song song) đều **chờ**
  cùng một chuỗi khởi tạo gồm migration; `migration v3` **idempotent** (chỉ `ADD COLUMN` còn thiếu);
  thêm **schema guard** `ensureItemMetricColumns()` sau `runMigrations` để vá cột thiếu **bất kể**
  `user_version`, kèm dòng log chẩn đoán `[db]`.
- **KHÔNG làm:** không đổi tên bảng/cột/khoá; không `DROP`/`REWRITE`; không đổi chữ ký `getDb()` /
  `getActiveBatchId()`; không sửa `schema.js` 🔒; không nới lỏng `SELECT` của `fetchItemsWithStats`
  (giữ nguyên AC-NEW-03) — **sửa gốc rồi**, không che lỗi; không đụng dữ liệu `nw_kg…` của user
  (guard chỉ `ADD COLUMN`, không đọc/ghi dữ liệu).
- **Cấp thay đổi:** **Cấp 3**.

---

## 3. Acceptance Criteria

| ID | Hành vi |
|---|---|
| AC-DB-01 | `getDb()` gọi **song song** N lần ⇒ chỉ **một** lần `openDatabaseAsync`, và **mọi** lời gọi đều chờ tới khi `runMigrations` xong |
| AC-DB-02 | `getDb()` thất bại (migration lỗi) ⇒ **không** giữ instance hỏng; lời gọi sau thử lại được |
| AC-DB-03 | `fetchItemsWithStats` **không** còn lỗi `no such column` trên DB đã có `user_version = 2` |
| AC-DB-04 | Migration v3 chạy trên DB **đã có** đủ 4 cột ⇒ **không** lỗi `duplicate column name` |
| AC-DB-05 | Migration v3 chạy trên DB chỉ có **một phần** cột (app bị tắt giữa lúc migrate) ⇒ thêm nốt phần còn thiếu, không lỗi |
| AC-DB-06 | Migration v3 trên DB mới ⇒ thêm đủ 4 cột; `PRAGMA user_version` = 3 |
| AC-DB-07 | Không đổi hành vi cũ: `getDb()` vẫn trả `SQLiteDatabase`; `ensureActiveBatch` (INV-B1) không đổi |
| **AC-DB-08** | **DB đã đóng dấu `user_version = 3` nhưng thiếu cột ⇒ `getDb()` vẫn vá đủ 4 cột và trả DB dùng được** (nguyên nhân gốc §1.4; guard **không** đọc `user_version`) |
| **AC-DB-09** | Vá không xong ⇒ báo lỗi **có tên cột còn thiếu** và **không** âm thầm chạy tiếp; vẫn ném lỗi để không query vào schema hỏng |
| **AC-DB-10** | Sau `runMigrations` luôn có dòng log `[db] user_version=… items=[…]` để chẩn đoán; thiếu dòng này ⇒ app đang chạy bundle cũ |

---

## 4. Kế hoạch file

| File | Mức | Hành động |
|---|---|---|
| `src/db/index.js` | 🔒 | cache **promise** (nguyên tử) + gọi schema guard sau `runMigrations` + log chẩn đoán |
| `src/db/migrations.js` | 🔒 | v3 dùng `ensureItemMetricColumns`; **không** đóng dấu `user_version` nếu vá chưa xong |
| `src/utils/schemaColumns.js` | 🔒 | `missingColumns`, `existingColumnNames`, `ensureItemMetricColumns` — thuần, chỉ cần `getAllAsync`/`execAsync` ⇒ test bằng `node` |
| `scripts/test-schemaColumns.mjs` + `package.json` | 🟢 | unit test + `test:schema` |
| `specs/*`, `SPEC.md`, `tasks.md` | 🟢 | registry, invariant, RC, changelog |

---

## 5. Thiết kế

```js
// src/db/index.js — trước
let dbInstance = null;
export async function getDb() {
  if (dbInstance) return dbInstance;                    // ⛔ lời gọi thứ 2 lọt qua
  dbInstance = await SQLite.openDatabaseAsync(...);
  await dbInstance.execAsync(CREATE_TABLES_SQL);
  await runMigrations(dbInstance);
  await ensureActiveBatch(dbInstance);
  return dbInstance;
}

// src/db/index.js — sau
let dbReady = null;                                     // cache PROMISE, không cache kết quả
export async function getDb() {
  if (!dbReady) {
    dbReady = (async () => {
      const db = await SQLite.openDatabaseAsync('production_tracker.db');
      await db.execAsync(CREATE_TABLES_SQL);
      await runMigrations(db);                          // ⛔ không ai query được trước bước này xong
      const guard = await ensureItemMetricColumns(db);  // ⛔ không tin user_version (§1.4)
      await logSchemaState(db, guard);
      if (!guard.ok) throw new Error(`Cơ sở dữ liệu thiếu cột: ${guard.missing.join(', ')}…`);
      await ensureActiveBatch(db);
      return db;
    })();
  }
  try {
    return await dbReady;
  } catch (e) {
    dbReady = null;                                     // AC-DB-02: không giữ instance hỏng
    throw e;
  }
}
```

Cách này **không** cần khoá/flag: chỉ cần một biến giữ promise, mọi lời gọi đều `await` cùng một promise.

Migration v3 idempotent **và** tự vá được khi số phiên bản đã lệch:

```js
// src/db/migrations.js — v3.up()
const result = await ensureItemMetricColumns(db);
if (!result.ok) throw new Error(`… còn thiếu: ${result.missing.join(', ')}`);
// runMigrations chỉ đóng dấu `PRAGMA user_version = 3` sau khi `up()` trả về không lỗi.
```

```js
// src/utils/schemaColumns.js — tự thêm cột thiếu, xác minh bằng quan sát
export async function ensureItemMetricColumns(db) {
  const before = await db.getAllAsync(`PRAGMA table_info(items)`);
  const added = [];
  for (const col of missingColumns(ITEM_METRIC_COLUMNS, before)) {
    try {
      await db.execAsync(`ALTER TABLE items ADD COLUMN ${col.name} ${col.type} DEFAULT NULL`);
      added.push(col.name);
    } catch (e) {
      if (!/duplicate column name/i.test(String(e?.message || e))) {
        return { ok: false, added, existing: [...existingColumnNames(before)],
                 missing: REQUIRED, error: `không thêm được cột ${col.name}…` };
      }
    }
  }
  const after = await db.getAllAsync(`PRAGMA table_info(items)`);   // nguồn sự thật
  const names = existingColumnNames(after);
  const missing = REQUIRED.filter(n => !names.has(n));
  return { ok: missing.length === 0, added, existing: [...names], missing };
}
```

---

## 6. Rủi ro hồi quy

| Rủi ro | Bảo vệ |
|---|---|
| `dbReady` giữ promise đã reject ⇒ mọi lời gọi sau đều lỗi | `catch` ⇒ `dbReady = null` rồi ném lại (AC-DB-02) |
| `missingColumns` rỗng ⇒ v3 không thêm cột nào trên DB mới | `PRAGMA table_info` của DB mới **chưa** có 4 cột ⇒ vẫn thêm đủ (kiểm chứng bằng E2E) |
| Đụng dữ liệu | `ADD COLUMN` không ghi đè dòng nào; cột cũ giữ nguyên |
| Guard báo `ok` nhưng cột vẫn thiếu (nếu tin `added` thay vì đọc lại schema) | Xác minh bằng quan sát: đọc lại `PRAGMA table_info` **sau khi vá** mới kết luận |
| `ALTER` lỗi (khoá DB, hết dung lượng) ⇒ treo app mỗi lần | Trả `ok:false` **kèm tên cột còn thiếu** ⇒ `getDb()` ném lỗi tiếng Việt rõ ràng thay vì lỗi SQL mơ hồ (AC-DB-09) |
| Đóng dấu `user_version = 3` khi vá chưa xong ⇒ vĩnh viễn hỏng (chính là §1.4) | `v3.up()` ném lỗi khi `!ok` ⇒ `runMigrations` **không** đóng dấu |

## 7. Kiểm thử

- `scripts/test-schemaColumns.mjs`: `missingColumns` với đủ/thiếu/rỗng/cột lạ; tên cột chỉ gồm ký tự an toàn;
  `ensureItemMetricColumns` với DB giả: thiếu cả 4, thiếu một phần, đã đủ, `duplicate column name`,
  `ALTER` lỗi, `PRAGMA` lỗi, và **không đọc `user_version`** (AC-DB-08).
- E2E: `getDb()` gọi song song 5 lần ⇒ 1 lần `openDatabaseAsync`, không câu `SELECT` nào chạy trước `ALTER`.
- E2E: `v3.up()` chạy 2 lần liên tiếp ⇒ lần 2 không phát sinh `ALTER` nào.
- E2E: DB giả đã đóng dấu `user_version = 3` nhưng thiếu cột ⇒ `getDb()` vá đủ 4 cột, `fetchItemsWithStats`
  không lỗi (AC-DB-08).
- Hồi quy: `npm test` · `npx expo lint` · `npx tsc --noEmit` · `npx expo export`.
- RC-120..121 (máy thật): mở app trên DB cũ `user_version = 2` ⇒ không lỗi; `PRAGMA table_info(items)` có đủ 4 cột.
- **RC-123 (máy thật — bắt buộc):** mở app, xem log Metro có dòng `[db] user_version=… items=[…]`; xem có
  `đã vá thêm:` không (⇒ xác nhận đúng nguyên nhân §1.4). **Không có dòng `[db]` ⇒ đang chạy bundle
  cũ**, phải `npx expo start -c` rồi tải lại app.

### 7.1 Kết quả đo sau khi sửa

E2E chạy `src/db/index.js` nguyên bản với `expo-sqlite` giả (`openDatabaseAsync` đếm số lần mở,
`execAsync`/`getAllAsync` ghi lại SQL):

| Kiểm tra | Kết quả |
|---|---|
| `getDb()` gọi **song song 5 lần** | `openDatabaseAsync` đúng **1** lần; cả 5 trả cùng 1 instance; đủ 4 `ALTER TABLE items ADD COLUMN` |
| Thứ tự thực thi | `PRAGMA user_version` → `PRAGMA table_info(items)` → 4 `ALTER` ⇒ **không** câu `SELECT` nào chạy trước khi cột có |
| `v3.up()` trên DB đã đủ 4 cột | **0** `ALTER` ⇒ không `duplicate column name` (AC-DB-04) |
| `v3.up()` trên DB chỉ có 2/4 cột | thêm nốt `volume_cbm`, `package_count` (AC-DB-05) |
| `v3.up()` trên DB mới | thêm đủ 4 cột, mọi câu `DEFAULT NULL`, không `DROP`/`CREATE TABLE`/`RENAME` (AC-DB-06) |
| Migration v1, v2 | còn nguyên, thứ tự `1,2,3` |
| `scripts/test-schemaColumns.mjs` | **43 ca** đạt (idempotent, tên cột an toàn, đọc `PRAGMA table_info`, guard vá cột thiếu độc lập `user_version`) |

> **Chưa xác minh trên máy thật.** Các bảng trên chạy với `expo-sqlite` giả trên desktop; lỗi gốc
> chỉ lộ ra trên thiết bị với file DB đã bị đóng dấu `user_version` sai. Vì vậy AC-DB-08/09/10 được
> đo bằng unit test + RC-123 (log `[db]`) thay vì E2E trên file DB thật.
