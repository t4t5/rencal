import * as temporal from "@js-temporal/polyfill"
import { init, parse } from "es-module-lexer"
import * as React from "react"
import * as ReactDOM from "react-dom"
import * as jsxRuntime from "react/jsx-runtime"

import * as sdk from "@/sdk"
import { SHARED_MODULE_IDS, type SharedModuleId } from "@/views/shared-modules"

// Modules plugins import from the host instead of bundling their own copy, so
// hooks, contexts and Temporal values are shared with the app. A bundled
// react-dom's flushSync wouldn't reach the host renderer.
const SHARED_MODULES: Record<SharedModuleId, object> = {
  react: React,
  "react-dom": ReactDOM,
  "react/jsx-runtime": jsxRuntime,
  "@js-temporal/polyfill": temporal,
  "@rencomputer/rencal-sdk": sdk,
}

const SHARED_KEY = "rencal.shared-modules"
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

// A module re-exporting a shared module's live namespace, read from a global
// because a blob module can't close over values.
export function sharedModuleSource(specifier: string, namespace: object): string {
  const names = Object.keys(namespace).filter((name) => name !== "default" && IDENTIFIER.test(name))
  return [
    `const m = globalThis[Symbol.for(${JSON.stringify(SHARED_KEY)})][${JSON.stringify(specifier)}];`,
    `export default "default" in m ? m.default : m;`,
    ...names.map((name) => `export const ${name} = m.${name};`),
  ].join("\n")
}

const moduleUrl = (source: string) =>
  URL.createObjectURL(new Blob([source], { type: "text/javascript" }))

let sharedUrls: Map<string, string> | undefined

function sharedModuleUrl(specifier: string): string | undefined {
  if (!sharedUrls) {
    ;(globalThis as Record<symbol, unknown>)[Symbol.for(SHARED_KEY)] = SHARED_MODULES
    sharedUrls = new Map(
      SHARED_MODULE_IDS.map((id) => [id, moduleUrl(sharedModuleSource(id, SHARED_MODULES[id]))]),
    )
  }
  return sharedUrls.get(specifier)
}

// Point the script's imports at `resolve`d URLs. A blob module has no base URL,
// so anything else (relative chunks, unshared packages) must be bundled in.
export async function linkPluginScript(
  source: string,
  resolve: (specifier: string) => string | undefined,
): Promise<string> {
  await init
  const [imports] = parse(source)
  let linked = ""
  let last = 0
  for (const { n: specifier, s: start, e: end, d: dynamic } of imports) {
    if (dynamic === -2) continue // import.meta
    const url = specifier === undefined ? undefined : resolve(specifier)
    if (!url) {
      throw new Error(
        `Plugin scripts can't import ${specifier ? `"${specifier}"` : "computed specifiers"}; bundle it into the script`,
      )
    }
    // Static imports span the specifier's text, dynamic ones the quoted literal.
    linked += source.slice(last, start) + (dynamic === -1 ? url : JSON.stringify(url))
    last = end
  }
  return linked + source.slice(last)
}

export async function loadPluginModule(script: string): Promise<Record<string, unknown>> {
  const url = moduleUrl(await linkPluginScript(script, sharedModuleUrl))
  try {
    return (await import(/* @vite-ignore */ url)) as Record<string, unknown>
  } finally {
    URL.revokeObjectURL(url)
  }
}
