import { expect, open, test } from "nsh/test"

import { DEFAULT_BINDINGS } from "@/lib/key-bindings"

import { paletteEntries } from "./CommandPalette"
import { shortcutRows } from "./ShortcutsOverlay"

const desktop = { width: 1400, height: 860, platform: "linux" } as const

const opened = async () => {
  const app = await open("../../App.tsx", desktop)
  await app.waitFor("TODAY")
  return app
}

test("? shows the keyboard shortcuts, with the bound keys", async () => {
  const app = await opened()
  await app.keyboard.press("shift+/")
  await app.waitFor("Keyboard shortcuts")
  expect(app.shows("Go to today")).toBe(true)
})

test("mod+k toggles the palette, and a command runs from it", async () => {
  const app = await opened()
  await app.keyboard.press("mod+k")
  await app.waitFor("Show keyboard shortcuts")
  await app.press("Show keyboard shortcuts")
  await app.waitFor("Keyboard shortcuts")
  expect(app.shows("Type a command…")).toBe(false)
})

test("a command missing its argument asks for it in the palette", async () => {
  const app = await opened()
  await app.keyboard.press(".")
  await app.waitFor(`e.g. "5 Sep", "next sunday"...`)
  await app.keyboard.press("escape")
})

test("ctrl+d and ctrl+u move a month, t comes back", async () => {
  const app = await opened()
  const shownMonth = () => app.texts().find((text) => /^[a-z]+ \d{4}$/i.test(text))
  const start = shownMonth()
  await app.keyboard.press("ctrl+d")
  await app.waitUntil(() => shownMonth() !== start)
  await app.keyboard.press("t")
  await app.waitUntil(() => shownMonth() === start)
})

test("the palette lists a command per value, and hides prompts with nothing to choose", () => {
  const entries = paletteEntries({
    "view.switch": [
      { value: "week", label: "Display week view" },
      { value: "month", label: "Display month view" },
    ],
    "group.switch": [{ value: "default", label: "Default" }],
    "theme.set": [
      { value: "ren", label: "Ren" },
      { value: "ren-light", label: "Ren Light" },
    ],
  })
  const actions = entries.map((entry) => entry.action)
  expect(actions.includes("view.switch:week")).toBe(true)
  expect(actions.includes("view.switch")).toBe(false)
  expect(actions.includes("group.switch")).toBe(false)
  expect(entries.find((entry) => entry.action === "theme.set")?.prompt).toBe("theme.set")
  expect(entries.find((entry) => entry.action === "date.go")?.prompt).toBe("date.go")
})

test("shortcut rows join an action's keys and leave out hidden ones", () => {
  const rows = shortcutRows(DEFAULT_BINDINGS, {})
  expect(rows.find((row) => row.action === "date.next:day")?.keys).toEqual(["right", "l"])
  expect(rows.find((row) => row.action === "search.open")?.keys).toEqual(["/"])
})
