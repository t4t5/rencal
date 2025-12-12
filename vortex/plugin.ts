import type { Plugin } from "vite"

const VIRTUAL_ID = "\0vortex-jsx-runtime"

// Minimal JSX runtime that just logs to prove interception works
const jsxRuntimeCode = `
import * as React from "react";
import * as Original from "react/jsx-dev-runtime";

console.log("[Vortex] JSX runtime intercepted!");

export const Fragment = Original.Fragment;

export function jsxDEV(type, props, key, isStatic, source, self) {
  // Just pass through for now
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
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/") req.url = "/vortex.html"
        next()
      })
    },
  }
}
