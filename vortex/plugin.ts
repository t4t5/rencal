import fs from "fs"
import type { Plugin } from "vite"

import { parseCvaConfig } from "./parse-cva"

const VIRTUAL_ID = "\0vortex-jsx-runtime"

// JSX runtime that attaches source info to DOM nodes
const jsxRuntimeCode = `
import * as Original from "react/jsx-dev-runtime";

const SOURCE_KEY = Symbol.for("__vortexSource__");

export const Fragment = Original.Fragment;

export function jsxDEV(type, props, key, isStatic, source, self) {
  // Only attach source to host elements (div, button, etc.)
  if (source?.fileName && typeof type === "string") {
    const sourceInfo = {
      fileName: source.fileName,
      lineNumber: source.lineNumber,
      columnNumber: source.columnNumber,
    };

    const originalRef = props?.ref;
    const enhancedProps = {
      ...props,
      ref: (node) => {
        if (node) {
          node[SOURCE_KEY] = sourceInfo;
        }
        // Call original ref if exists
        if (typeof originalRef === "function") originalRef(node);
        else if (originalRef) originalRef.current = node;
      },
    };

    return Original.jsxDEV(type, enhancedProps, key, isStatic, source, self);
  }

  return Original.jsxDEV(type, props, key, isStatic, source, self);
}
`

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
        // API endpoint to update classes in source file
        if (req.url === "/api/update-classes" && req.method === "POST") {
          let body = ""
          req.on("data", (chunk) => (body += chunk))
          req.on("end", () => {
            try {
              const { file, line, classes } = JSON.parse(body)

              const content = fs.readFileSync(file, "utf-8")
              const lines = content.split("\n")
              const targetLine = lines[line - 1]

              // Replace the string value in the line (handles both single and double quotes)
              const updated = targetLine.replace(
                /(['"`])([^'"`]*)(['"`])\s*,?\s*$/,
                `$1${classes}$3,`,
              )

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
          return
        }

        // API endpoint for CVA config
        if (req.url?.startsWith("/api/cva-config")) {
          const url = new URL(req.url, "http://localhost")
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
          return
        }

        if (req.url === "/") req.url = "/vortex.html"
        next()
      })
    },
  }
}
