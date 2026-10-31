import { readFile } from "node:fs/promises"
import { describe, expect, it, vi } from "vitest"

import { findCommand, parseAction } from "@/lib/commands"
import { canonicalKeys, DEFAULT_BINDINGS } from "@/lib/key-bindings"

import {
  BUILTIN_VIEWS,
  DEFAULT_VIEW_ID,
  resolveView,
  viewBindings,
  type ViewDescriptor,
} from "@/views/manifest"

// The real views pull in the Tauri RPC proxy, which needs a window.
vi.mock("@/views/builtin/week/WeekView", () => ({ WeekView: () => null }))
vi.mock("@/views/builtin/month/MonthView", () => ({ MonthView: () => null }))
vi.mock("@/views/builtin/year/YearView", () => ({ YearView: () => null }))

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

describe("viewBindings", () => {
  it("binds each view's shortcut to switching to it", () => {
    expect(viewBindings([view("week", "w"), view("board")])).toEqual([
      { keys: "w", action: "view.switch:week" },
    ])
  })
})

describe("default bindings", () => {
  const bindings = [...viewBindings(BUILTIN_VIEWS), ...DEFAULT_BINDINGS]

  it("has no two bindings on the same keys", () => {
    const keys = bindings.map((binding) => canonicalKeys(binding.keys))
    expect(keys).toEqual([...new Set(keys)])
  })

  it("only binds registered commands", () => {
    for (const { action } of bindings) {
      expect(findCommand(parseAction(action).command), action).toBeDefined()
    }
  })
})

describe("native menu", () => {
  const menuIds = async () => {
    const menu = await readFile(new URL("../../src-tauri/src/menu.rs", import.meta.url), "utf8")
    // Opened by the backend itself rather than sent to the frontend.
    const native = new Set(["help-website", "help-issues"])
    return [...menu.matchAll(/MenuItemBuilder::with_id\("([^"]+)"/g)]
      .map((match) => match[1])
      .filter((id) => !native.has(id))
  }

  it("sends registered commands", async () => {
    const ids = await menuIds()
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(findCommand(parseAction(id).command), `menu.rs item "${id}"`).toBeDefined()
    }
  })

  it("only switches to registered views", async () => {
    const registered = BUILTIN_VIEWS.map((v) => v.id)
    for (const id of await menuIds()) {
      const { command, value } = parseAction(id)
      if (command === "view.switch") expect(registered, `menu.rs item "${id}"`).toContain(value)
    }
  })
})
