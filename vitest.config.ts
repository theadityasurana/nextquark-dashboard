import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // Pure-logic suite only. These tests never touch Supabase, Kernel, or a
    // browser — anything needing IO belongs behind a seam and gets a fake.
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
})
