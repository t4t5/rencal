import { describe, expect, it, vi } from "vitest"

import { linkPluginScript, sharedModuleSource } from "@/views/plugin-modules"

// The SDK pulls in the Tauri RPC proxy, which needs a window.
vi.mock("@/sdk", () => ({}))

const resolve = (specifier: string) =>
  specifier === "react"
    ? "blob:react"
    : specifier === "@rencomputer/rencal-sdk"
      ? "blob:api"
      : undefined

describe("linkPluginScript", () => {
  it("points shared imports at their host modules", async () => {
    const source = [
      `import { useMemo } from "react";`,
      `import * as api from '@rencomputer/rencal-sdk';`,
      `export { memo } from "react";`,
      `const lazy = () => import("react");`,
      `const url = import.meta.url;`,
    ].join("\n")

    expect(await linkPluginScript(source, resolve)).toBe(
      [
        `import { useMemo } from "blob:react";`,
        `import * as api from 'blob:api';`,
        `export { memo } from "blob:react";`,
        `const lazy = () => import("blob:react");`,
        `const url = import.meta.url;`,
      ].join("\n"),
    )
  })

  it("rejects imports the host doesn't share", async () => {
    await expect(linkPluginScript(`import "./chunk.js"`, resolve)).rejects.toThrow(
      `can't import "./chunk.js"`,
    )
    await expect(linkPluginScript(`import x from "lodash"`, resolve)).rejects.toThrow(
      `can't import "lodash"`,
    )
    await expect(linkPluginScript(`import(name)`, resolve)).rejects.toThrow("computed specifiers")
  })
})

describe("sharedModuleSource", () => {
  it("re-exports every named export and the default", () => {
    const source = sharedModuleSource("react", { default: {}, useMemo: 1, "not-an-id": 2 })

    expect(source).toContain(`export default "default" in m ? m.default : m;`)
    expect(source).toContain("export const useMemo = m.useMemo;")
    expect(source).not.toContain("not-an-id")
  })
})
