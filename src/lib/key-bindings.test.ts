// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"

import {
  actionError,
  type Binding,
  bindKeyEdits,
  canonicalKeys,
  isCharKey,
  isCustomized,
  keysError,
  keysFromEvent,
  resetActionEdits,
  resolveBindings,
  unbindKeyEdits,
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

describe("editing keys.toml", () => {
  it("binds a key, or clears an override that only restates the default", () => {
    expect(bindKeyEdits("n", "date.today", defaults, [])).toEqual([
      { kind: "bind", keys: "n", action: "date.today" },
    ])
    expect(bindKeyEdits("l", "date.next:day", defaults, [])).toEqual([])
    expect(
      bindKeyEdits("l", "date.next:day", defaults, [{ keys: "L", action: "date.today" }]),
    ).toEqual([{ kind: "clear", keys: "L" }])
  })

  it("replaces an entry with the file's spelling of the key", () => {
    expect(
      bindKeyEdits("ctrl+shift+d", "app.sync", defaults, [
        { keys: "Shift+Ctrl+D", action: "date.today" },
      ]),
    ).toEqual([{ kind: "bind", keys: "Shift+Ctrl+D", action: "app.sync" }])
  })

  it("unbinds default keys with false and drops keys only the file adds", () => {
    expect(unbindKeyEdits("ctrl+b", defaults, [])).toEqual([{ kind: "unbind", keys: "ctrl+b" }])
    expect(unbindKeyEdits("n", defaults, [{ keys: "n", action: "date.today" }])).toEqual([
      { kind: "clear", keys: "n" },
    ])
  })

  it("resets an action by clearing its entries and those that took its keys", () => {
    const user = [
      { keys: "l", action: "date.today" },
      { keys: "n", action: "date.next:day" },
      { keys: "ctrl+b", action: null },
    ]
    expect(resetActionEdits("date.next:day", defaults, user)).toEqual([
      { kind: "clear", keys: "l" },
      { kind: "clear", keys: "n" },
    ])
  })

  it("knows when an action's keys differ from its defaults", () => {
    const { bindings } = resolveBindings(defaults, [{ keys: "ctrl+b", action: null }])
    expect(isCustomized("sidebar.toggle", defaults, bindings)).toBe(true)
    expect(isCustomized("date.next:day", defaults, bindings)).toBe(false)
  })
})

describe("keysFromEvent", () => {
  const press = (init: KeyboardEventInit) => keysFromEvent(new KeyboardEvent("keydown", init))

  it("binds typed characters by character", () => {
    expect(press({ key: "w", code: "KeyW" })).toBe("w")
    expect(press({ key: "?", code: "Slash", shiftKey: true })).toBe("?")
    expect(press({ key: "W", code: "KeyW", shiftKey: true })).toBe("shift+w")
  })

  it("binds keys with modifiers by physical key", () => {
    expect(press({ key: "d", code: "KeyD", ctrlKey: true })).toBe("mod+d")
    expect(press({ key: "Tab", code: "Tab", shiftKey: true })).toBe("shift+tab")
    expect(press({ key: "ArrowLeft", code: "ArrowLeft" })).toBe("left")
    expect(press({ key: ",", code: "Comma" })).toBe("comma")
  })

  it("ignores a lone modifier", () => {
    expect(press({ key: "Control", code: "ControlLeft", ctrlKey: true })).toBeNull()
  })
})
