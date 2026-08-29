import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

/**
 * Separate config for the end-to-end harness.
 *
 * The main suite is deliberately pure — no Supabase, no Kernel, no browser.
 * This one is the opposite: it drives a real browser against a real posting, so
 * it is opt-in, single-threaded, and has a timeout measured in minutes.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: {
    include: ["scripts/e2e/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 900_000,
    hookTimeout: 900_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    // Real logs, in order, not captured and replayed at the end.
    disableConsoleIntercept: true,
    reporters: ["basic"],
  },
})
