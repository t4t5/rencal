import path from "path"
import { defineConfig } from "vitest/config"

// Golden-fixture generator for the GPUI port (see README.md). Not part of `pnpm test`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
  test: {
    root: path.resolve(__dirname, "../.."),
    include: ["scripts/fixtures/**/*.fixtures.ts"],
    // Process zone for JS Date consumers (chrono-node, rrule.js). The viewer zone is set per case.
    env: { TZ: "Europe/Berlin" },
    fileParallelism: false,
  },
})
