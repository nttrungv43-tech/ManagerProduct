// scripts/test-dbInit.mjs
// BUGFIX-08 — E2E tầng khởi tạo DB, chạy `src/db/index.js` + `src/db/queries.js` **nguyên bản**
// với `expo-sqlite` giả. Chạy: npm run test:dbInit
//
// Vì sao cần E2E này: bug gốc chỉ lộ ra trên **thiết bị**, với file DB đã bị đóng dấu
// `user_version = 3` trong khi `ALTER TABLE` chưa từng có hiệu lực. Stub mô phỏng đúng tình
// huống đó và **ném `no such column` y hệt SQLite**, nên nếu guard hỏng thì test này đỏ.
//
// Mỗi kịch bản chạy 1 process con (lý do: xem đầu file `db-init-e2e/scenario.mjs`).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const SCENARIOS = [
  'reset-legacy',     // FEAT-21 — DB cũ: phải closeAsync() rồi mới xoá được
  'reset-not-needed', // FEAT-21 — DB đã đúng schema mới: KHÔNG xoá (giữ dữ liệu nhập tay)
  'intermediate-build',    // BUGFIX-23 — DB của build trung gian thiếu `order_line_id`
  'missing-nullable-column', // BUGFIX-23 — thiếu cột nullable ⇒ vá, KHÔNG xoá
  'verify-reports-missing',  // BUGFIX-23 — vá hỏng ⇒ phải nêu tên bảng + cột
];

/**
 * Kịch bản **đang tạm gỡ** (FEAT-21, pha 6) — chạy lại khi pha 3 xong.
 *
 * Cả 7 đều kiểm hệ thống migration cũ: `ALTER TABLE items ADD COLUMN` (BUGFIX-08), bảng
 * `item_po` (FEAT-18), `fetchItemsWithStats()` và `guard` vá cột. Sau khi bỏ hẳn migration,
 * những thứ đó **không còn tồn tại** — schema mới chỉ có một `CREATE TABLE`, không vá cột,
 * `user_version` không bao giờ lệch nên cũng không cần guard.
 *
 * Không port được ngay bây giờ vì chúng gọi `fetchItemsWithStats()`, hàm này **chưa tồn tại cho
 * tới hết pha 3** (`queries.js` viết lại). Giữ nguyên trong `db-init-e2e/scenario.mjs` để port lại,
 * không xoá — mất test cũ là mất coverage của các AC đã nghiệm thu.
 */
const PENDING_SCENARIOS = [
  'stale-version',     // AC-DB-08, AC-DB-10 — đúng file DB của máy thật
  'complete',          // AC-DB-04 — idempotent
  'partial',           // AC-DB-05 — app bị tắt giữa lúc migrate
  'parallel',          // AC-DB-01 — getDb() gọi song song
  'alter-fails',       // AC-DB-09 — vá hỏng thì báo lỗi rõ
  'alter-fails-items', // AC-DB-09 — vá hỏng riêng ở items ⇒ nêu đủ tên 4 cột
  'version-2',         // AC-DB-03, AC-DB-06 — đường nâng cấp bình thường
];
void PENDING_SCENARIOS;

function runScenario(name) {
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [
        '--no-warnings',
        '--import', join(HERE, 'db-init-e2e/register.mjs'),
        join(HERE, 'db-init-e2e/scenario.mjs'),
        name,
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] }
    );
    child.on('exit', code => resolve(code === 0));
  });
}

let pass = 0;
const failed = [];
for (const name of SCENARIOS) {
  if (await runScenario(name)) pass += 1;
  else failed.push(name);
}

console.log(`\nKết quả: ${pass}/${SCENARIOS.length} kịch bản đạt`);
if (failed.length) console.error('Kịch bản lỗi: ' + failed.join(', '));
process.exit(failed.length ? 1 : 0);