import { describe, expect, it } from "vitest"

import {
  actionError,
  type Binding,
  canonicalKeys,
  isCharKey,
  keysError,
  resolveBindings,
} from "@/lib/key-bindings"

const defaults: Binding[] = [
  { keys: "l", action: "date.next:day" },
  { keys: "ctrl+b", action: "sidebar.toggle" },
  { keys: "mod+f", action: "search.open", hidden: true },
]

describe("resolveBindings", () => {
  it("replaces a default on the same key in place", () => {
    const { bindings, errors } = resolveBindings(defaults, [
      { keys: "L", action: "view.switch:week" },
    ])
    expect(errors).toEqual([])
    expect(bindings[0]).toEqual({ keys: "l", action: "view.switch:week" })
    expect(bindings).toHaveLength(3)
  })

  it("unbinds a default with a null action", () => {
    const { bindings } = resolveBindings(defaults, [{ keys: "ctrl+b", action: null }])
    expect(bindings.map((b) => b.keys)).toEqual(["l", "mod+f"])
  })

  it("adds new keys after the defaults, keeping a command's other keys", () => {
    const { bindings } = resolveBindings(defaults, [{ keys: "n", action: "date.next:day" }])
    expect(bindings.map((b) => b.keys)).toEqual(["l", "ctrl+b", "mod+f", "n"])
  })

  it("matches keys however their modifiers are written", () => {
    const reordered = resolveBindings(
      [{ keys: "ctrl+shift+d", action: "app.sync" }],
      [{ keys: "shift+ctrl+d", action: null }],
    )
    expect(reordered.bindings).toEqual([])
  })

  it("skips invalid entries and says why", () => {
    const { bindings, errors } = resolveBindings(defaults, [
      { keys: "hyper+x", action: "date.today" },
      { keys: "x", action: "nope.nope" },
      { keys: ",", action: "date.today" },
    ])
    expect(bindings).toEqual(defaults)
    expect(errors).toHaveLength(3)
    expect(errors[0]).toMatch(/unknown modifier "hyper"/)
    expect(errors[1]).toMatch(/unknown command "nope.nope"/)
    expect(errors[2]).toMatch(/comma/)
  })
})

describe("actionError", () => {
  it("accepts commands with valid or run-time values", () => {
    expect(actionError("date.today")).toBeNull()
    expect(actionError("date.next:week")).toBeNull()
    expect(actionError("view.switch:t4t5.board/board")).toBeNull()
  })

  it("rejects fixed values that don't exist and values on commands without arguments", () => {
    expect(actionError("date.next:year")).toMatch(/unit is one of day, week, month/)
    expect(actionError("date.today:now")).toMatch(/takes no value/)
  })
})

describe("keys", () => {
  it("treats single unmodified characters as layout-independent", () => {
    expect(isCharKey("c")).toBe(true)
    expect(isCharKey("?")).toBe(true)
    expect(isCharKey("ctrl+c")).toBe(false)
    expect(isCharKey("tab")).toBe(false)
  })

  it("canonicalizes modifier order and case", () => {
    expect(canonicalKeys("Shift+Ctrl+D")).toBe("ctrl+shift+d")
  })

  it("rejects keys without a key", () => {
    expect(keysError("ctrl+")).toMatch(/has no key/)
    expect(keysError("mod+shift+t")).toBeNull()
  })
})
