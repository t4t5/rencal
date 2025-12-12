import fs from "fs"
import type { IncomingMessage, ServerResponse } from "http"
import path from "path"
import type { Plugin } from "vite"

import { parseCvaConfig } from "./parse-cva"

const VIRTUAL_ID = "\0vortex-jsx-runtime"
const jsxRuntimeCode = fs.readFileSync(path.join(import.meta.dirname, "jsx-runtime.js"), "utf-8")

function handleUpdateClasses(req: IncomingMessage, res: ServerResponse) {
  let body = ""
  req.on("data", (chunk) => (body += chunk))
  req.on("end", () => {
    try {
      const { file, line, classes } = JSON.parse(body)

      const content = fs.readFileSync(file, "utf-8")
      const lines = content.split("\n")
      const targetLine = lines[line - 1]

      // Replace the string value in the line (handles both single and double quotes)
      const updated = targetLine.replace(/(['"`])([^'"`]*)(['"`])\s*,?\s*$/, `$1${classes}$3,`)

      if (updated === targetLine) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: "Could not find string to replace on line" }))
        return
      }

      lines[line - 1] = updated
      fs.writeFileSync(file, lines.join("\n"))

      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ success: true }))
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(e) }))
    }
  })
}

function handleCvaConfig(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, "http://localhost")
  const filePath = url.searchParams.get("file")

  if (!filePath) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: "Missing 'file' query parameter" }))
    return
  }

  try {
    const config = parseCvaConfig(filePath)
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify(config))
  } catch (e) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(e) }))
  }
}

export function vortex(): Plugin {
  return {
    name: "vortex",
    enforce: "pre",

    resolveId(id, importer) {
      // Intercept jsx-dev-runtime, but not from our own virtual module
      if (id === "react/jsx-dev-runtime" && !importer?.includes(VIRTUAL_ID)) {
        return VIRTUAL_ID
      }
    },

    load(id) {
      if (id === VIRTUAL_ID) {
        return jsxRuntimeCode
      }
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/api/update-classes" && req.method === "POST") {
          return handleUpdateClasses(req, res)
        }

        if (req.url?.startsWith("/api/cva-config")) {
          return handleCvaConfig(req, res)
        }

        if (req.url === "/") req.url = "/vortex.html"
        next()
      })
    },
  }
}
