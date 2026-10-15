#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

import { buildViews } from "../build.js"

const USAGE = `Usage: rencal-sdk <command>

  build   type-check and build the plugin's views
  dev     rebuild the views on every change`

const root = process.cwd()

function typecheck() {
  if (!existsSync(join(root, "tsconfig.json"))) return
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc")
  const { status } = spawnSync(process.execPath, [tsc, "-p", root], { stdio: "inherit" })
  if (status !== 0) process.exit(status ?? 1)
}

const command = process.argv[2]
try {
  if (command === "build") {
    typecheck()
    await buildViews(root)
  } else if (command === "dev") {
    await buildViews(root, { watch: true })
  } else {
    console.error(USAGE)
    process.exit(command ? 1 : 0)
  }
} catch (error) {
  // Vite has already printed build errors; this covers manifest and entry ones.
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
