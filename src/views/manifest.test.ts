import { readFile } from "node:fs/promises"
import { describe, expect, it, vi } from "vitest"

import { SHORTCUTS } from "@/lib/shortcuts"

import {
  BUILTIN_VIEWS,
  DEFAULT_VIEW_ID,
  resolveView,
  viewShortcuts,
  type ViewDescriptor,
} from "@/views/manifest"

// The real views pull in the Tauri RPC proxy, which needs a window.
vi.mock("@/components/main/week-view/WeekView", () => ({ WeekView: () => null }))
vi.mock("@/components/main/month-view/MonthView", () => ({ MonthView: () => null }))
vi.mock("@/plugins/year/YearView", () => ({ YearView: () => null }))

const view = (id: string, shortcut?: string): ViewDescriptor => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  component: () => null,
  shortcut,
})

describe("resolveView", () => {
  const views = [view("week"), view(DEFAULT_VIEW_ID), view("board")]

  it("returns the view with a matching id", () => {
    expect(resolveView("board", views).id).toBe("board")
  })

  it("falls back to the default view for unknown ids", () => {
    expect(resolveView("alice.year/year", views).id).toBe(DEFAULT_VIEW_ID)
  })

  it("falls back to the first view when the default isn't registered", () => {
    expect(resolveView("nope", [view("week"), view("board")]).id).toBe("week")
  })
})

describe("viewShortcuts", () => {
  it("derives a char shortcut for each view that declares one", () => {
    expect(viewShortcuts([view("week", "w"), view("board")])).toEqual([
      {
        id: "week",
        group: "View",
        label: "Display week view",
        bindings: [{ keys: "w", type: "char" }],
      },
    ])
  })
})

describe("shortcut registry", () => {
  const defs = [...viewShortcuts(BUILTIN_VIEWS), ...SHORTCUTS]

  it("has no duplicate command ids", () => {
    const ids = defs.map((def) => def.id)
    expect(ids).toEqual([...new Set(ids)])
  })

  it("has no two bindings on the same keys", () => {
    const keys = defs.flatMap((def) => def.bindings.map((binding) => binding.keys))
    expect(keys).toEqual([...new Set(keys)])
  })
})

describe("native menu", () => {
  it("only switches to registered views", async () => {
    const menu = await readFile(new URL("../../src-tauri/src/menu.rs", import.meta.url), "utf8")
    // View items are the ones on CmdOrCtrl+<digit>.
    const menuViewIds = [
      ...menu.matchAll(
        /MenuItemBuilder::with_id\("([^"]+)",[^)]*\)\s*\.accelerator\("CmdOrCtrl\+\d"\)/g,
      ),
    ].map((match) => match[1])

    expect(menuViewIds.length).toBeGreaterThan(0)
    const registered = BUILTIN_VIEWS.map((v) => v.id)
    for (const id of menuViewIds) {
      expect(registered, `menu.rs item "${id}" is not a registered view`).toContain(id)
    }
  })
})
