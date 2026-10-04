// scripts/db-init-e2e/register.mjs
// Cổng vào để chạy E2E tầng DB trên `node` thuần:
//   node --import ./scripts/db-init-e2e/register.mjs scripts/test-dbInit.mjs
import { register } from 'node:module';

register('./hook.mjs', import.meta.url);