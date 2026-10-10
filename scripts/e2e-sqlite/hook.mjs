// scripts/e2e-sqlite/hook.mjs
// Resolver hook cho `node --import ./scripts/e2e-sqlite/register.mjs`.
// Định tuyến `expo-sqlite` sang `adapter.mjs` (SQLite thật của Node), đồng thời giải quyết alias `@/` và phần mở rộng file.
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src');
const ADAPTER = pathToFileURL(join(ROOT, 'scripts/e2e-sqlite/adapter.mjs')).href;

const isFile = p => {
  try { return statSync(p).isFile(); } catch { return false; }
};

function withExtensions(absPath) {
  if (isFile(absPath)) return absPath;
  for (const suffix of ['.js', '.mjs', '.json', '/index.js']) {
    if (isFile(absPath + suffix)) return absPath + suffix;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'expo-sqlite') return { url: ADAPTER, shortCircuit: true };

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