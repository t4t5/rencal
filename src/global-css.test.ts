import { readFile } from "node:fs/promises"
import { compile } from "tailwindcss"
import { beforeAll, describe, expect, it } from "vitest"

let build: Awaited<ReturnType<typeof compile>>["build"]

beforeAll(async () => {
  const source = await readFile(new URL("./global.css", import.meta.url), "utf8")
  const withoutImports = source.replace(/^@import .*;$/gm, "")
  const compiled = await compile(
    `@layer theme, base, components, utilities;\n@tailwind utilities;\n${withoutImports}`,
  )
  build = compiled.build
})

describe("global CSS contract", () => {
  it("compiles every shadcn color utility used by shared UI", () => {
    const candidates = [
      "text-accent-foreground",
      "bg-border",
      "border-border",
      "text-card-foreground",
      "text-secondary-foreground",
      "bg-muted",
      "text-destructive-foreground",
      "bg-overlay",
    ]
    const css = build(candidates)

    for (const candidate of candidates) {
      expect(css, candidate).toContain(`.${candidate}`)
    }
  })

  it("ties dark variants to the active theme appearance", () => {
    const css = build(["dark:bg-muted"])

    expect(css).toContain('[data-appearance="dark"]')
    expect(css).not.toContain("prefers-color-scheme")
  })

  it("keeps scale utilities runtime-themeable and roles in the components layer", () => {
    const css = build(["text-sm"])

    expect(css).toMatch(/\.text-sm[^{]*\{[^}]*font-size:\s*var\(--text-sm\)/s)
    expect(css).toMatch(/@layer components\s*\{[\s\S]*?\.button\s*\{/)
    expect(css).toContain("@layer theme, base, components, utilities")
  })

  it("exposes one spacing token to every control sizing utility", () => {
    const css = build(["h-control", "min-h-control", "size-control", "w-control"])

    expect(css).toContain("height: var(--control-height)")
    expect(css).toContain("min-height: var(--control-height)")
    expect(css).toContain("width: var(--control-height)")
  })

  it("keeps the legacy base radius step themeable", () => {
    const css = build(["rounded-base"])

    expect(css).toMatch(
      /\.rounded-base\s*\{[^}]*border-radius:\s*max\(0px, calc\(var\(--radius\) - 6px\)\)/s,
    )
  })
})
