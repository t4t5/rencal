import { readFile } from "node:fs/promises"
import { compile } from "tailwindcss"
import { beforeAll, describe, expect, it } from "vitest"

const BASELINE = ":root,\\s*\\[data-theme\\]"

let build: Awaited<ReturnType<typeof compile>>["build"]
let source: string

function declarationsFor(selector: string) {
  const rule = source.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!rule?.[1]) throw new Error(`Missing CSS rule for ${selector}`)

  return new Map(
    [...rule[1].matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  )
}

beforeAll(async () => {
  source = await readFile(new URL("./global.css", import.meta.url), "utf8")
  const withoutImports = source.replace(/^@import .*;$/gm, "")
  const compiled = await compile(
    `@layer theme, base, components, utilities;\n@tailwind utilities;\n${withoutImports}`,
  )
  build = compiled.build
})

describe("global CSS contract", () => {
  it("resolves every documented token on each theme scope", async () => {
    const readme = await readFile(new URL("./themes/README.md", import.meta.url), "utf8")
    const documented = [...readme.matchAll(/^\| `(--[\w-]+)`/gm)].map((match) => match[1])
    const baseline = declarationsFor(BASELINE)

    expect(documented.length).toBeGreaterThan(40)
    for (const name of documented) {
      expect(baseline.has(name), `${name} is missing from the theme baseline`).toBe(true)
    }
  })

  it("resets the type scale on each theme scope", () => {
    const scale = [...declarationsFor("@theme")].filter(([name]) => name.startsWith("--text-"))
    const baseline = declarationsFor(BASELINE)

    expect(scale.length).toBeGreaterThan(0)
    for (const [name, value] of scale) {
      expect(baseline.get(name), name).toBe(value)
    }
  })

  it("derives font roles and font primitives on every theme scope", () => {
    const themed = declarationsFor(BASELINE)

    expect(themed.get("--font-body")).toBe("var(--font-sans)")
    expect(themed.get("--font-heading")).toBe("var(--font-mono)")
    expect(themed.get("--font-button")).toBe("var(--font-mono)")
    expect(themed.get("--font-numerical")).toBe("var(--font-mono)")
    expect(themed.get("--font-sans")).toContain("var(\n    --sans,")
    expect(themed.get("--font-mono")).toBe('var(--mono, "Geist Mono", ui-monospace, monospace)')
    expect(themed.get("--sans")).toBe("initial")
    expect(themed.get("--mono")).toBe("initial")
  })

  it("compiles every shadcn color utility used by shared UI", () => {
    const candidates = [
      "text-accent-foreground",
      "bg-selected",
      "text-selected-foreground",
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

  it("keeps calendar event hover and selection on separate tokens", () => {
    const calendarEventRules = [
      ...source.matchAll(/([^{}]*\[data-slot="calendar-event"\][^{}]*)\{([^{}]*)\}/g),
    ]

    for (const [, selector, declarations] of calendarEventRules) {
      if (selector.includes(":hover")) {
        expect(declarations, selector.trim()).not.toContain("var(--accent)")
      }
    }

    expect(source).toMatch(
      /:where\([\s\S]*?\[data-view="month"\]\[data-kind="timed"\][\s\S]*?\[data-view="agenda"\]\[data-kind="timed"\][\s\S]*?\[data-view="board"\][\s\S]*?\)\[data-selected\]\s*\{[^}]*background:\s*var\(--selected\);[^}]*color:\s*var\(--selected-foreground\);[^}]*\}/,
    )
  })

  it("tints timed month event labels with their event color", () => {
    expect(source).toMatch(
      /\[data-view="month"\]\[data-kind="timed"\][\s\S]*?\[data-slot="calendar-event-time"\]\s*\{[^}]*color:\s*var\(--calendar-event-tinted-foreground\);[^}]*\}/,
    )
    expect(source).toMatch(
      /\[data-selected\]\s*\[data-slot="calendar-event-time"\]\s*\{[^}]*color:\s*inherit;/,
    )
  })

  it("keeps scale utilities runtime-themeable and roles in the components layer", () => {
    const css = build(["text-sm"])

    expect(css).toMatch(/\.text-sm[^{]*\{[^}]*font-size:\s*var\(--text-sm\)/s)
    expect(css).toMatch(/@layer components\s*\{[\s\S]*?\[data-typography="action"\]\s*\{/)
    expect(css).toContain("@layer theme, base, components, utilities")
  })

  it("uses explicit typography roles instead of generic global classes", () => {
    expect(source).not.toMatch(/^\s*\.(?:button|heading|numerical|field-action)\s*\{/m)

    for (const role of ["action", "field", "heading", "numerical"]) {
      expect(source).toContain(`[data-typography="${role}"]`)
    }
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
