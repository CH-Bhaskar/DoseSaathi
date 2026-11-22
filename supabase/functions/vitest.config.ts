/* Vitest config for the Edge Function unit tests.
 * Run from the repo root:
 *   npx vitest run --config supabase/functions/vitest.config.ts
 * This config is separate from the app's vite.config.ts on purpose:
 * the app's test include is src/** only, and the function tests live
 * under supabase/functions/_shared/. */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['supabase/functions/**/*.test.ts'],
    environment: 'node',
  },
})
