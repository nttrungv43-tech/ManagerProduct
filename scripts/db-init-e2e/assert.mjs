// scripts/db-init-e2e/assert.mjs
// Trợ giúp assert dùng chung cho kịch bản E2E (mỗi kịch bản chạy 1 process riêng).
let pass = 0;
const failures = [];

export function check(name, cond, extra = '') {
  if (cond) { pass += 1; return; }
  failures.push({ name, extra });
  console.error(`  ✗ ${name}${extra ? `\n      ${extra}` : ''}`);
}

export function eq(name, actual, expected) {
  check(
    name,
    actual === expected,
    `thực tế: ${JSON.stringify(actual)} · mong đợi: ${JSON.stringify(expected)}`
  );
}

/** In tổng kết của kịch bản và trả mã thoát (0 = đạt). */
export function report(scenario) {
  console.log(`${scenario}: ${pass} passed, ${failures.length} failed`);
  return failures.length ? 1 : 0;
}

/** Bắt `console.log` trong lúc chạy `fn` (dùng cho log chẩn đoán AC-DB-10). */
export async function captureLog(fn) {
  const lines = [];
  const real = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  let value, error;
  try {
    value = await fn();
  } catch (e) {
    error = e;
  } finally {
    console.log = real;
  }
  return { lines, value, error };
}