// scripts/db-init-e2e/hook.mjs
// Resolver hook cho `node --import ./scripts/db-init-e2e/register.mjs`.
// Nối khoảng cách giữa `node` (chạy code app nguyên bản) và thế giới Metro:
//
//   1. `@/…`         → `<project>/src/…`         (alias do app cấu hình)
//   2. `expo-sqlite` → DB giả của test           (không cần native module)
//   3. import không đuôi file (`./schema`) → thử `.js`, `.mjs`, `.json`, `/index.js`
//      — Metro/Babel tự làm việc này, `node` thì không.
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// hook.mjs nằm ở <root>/scripts/db-init-e2e/ ⇒ `../../` (có dấu / cuối) chính là <root>.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src');
const STUB = pathToFileURL(join(ROOT, 'scripts/db-init-e2e/expo-sqlite-stub.mjs')).href;

const isFile = p => {
  try { return statSync(p).isFile(); } catch { return false; }
};

/** Trả về đường dẫn tồn tại đầu tiên, kèm đuôi file phù hợp kiểu Metro. */
function withExtensions(absPath) {
  if (isFile(absPath)) return absPath;
  for (const suffix of ['.js', '.mjs', '.json', '/index.js']) {
    if (isFile(absPath + suffix)) return absPath + suffix;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'expo-sqlite') return { url: STUB, shortCircuit: true };

  let abs = null;
  if (specifier.startsWith('@/')) {
    abs = join(SRC, specifier.slice(2));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!context.parentURL) return nextResolve(specifier, context);
    abs = join(dirname(fileURLToPath(context.parentURL)), specifier);
  }

  if (abs) {
    const found = withExtensions(abs);
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}