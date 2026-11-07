import { expect, open, test } from "nsh/test"

// Settings is a window of its own, which only desktops have.
const desktop = { width: 1200, height: 800, platform: "macos" } as const

const openSettings = async () => {
  const app = await open("../../App.tsx", desktop)
  await app.waitFor("label:Settings")
  await app.press("label:Settings")
  await app.waitFor("text:Time format")
  return app
}

test("settings: opens in a window of its own, moves between pages, closes with Escape", async () => {
  const app = await openSettings()
  expect(app.window("settings").state()?.focused).toBe(true)

  for (const [page, shows] of [
    ["Accounts", "Connect new account"],
    ["Calendars", "Groups"],
    ["Reminders", "Enable notifications"],
    ["Themes", "Theme mode"],
    ["Shortcuts", "Display month view"],
    ["Plugins", "Installed only"],
  ] as const) {
    await app.press(`text:${page}`)
    await app.waitUntil(() =>
      app.texts().some((text) => text.toLowerCase() === shows.toLowerCase()),
    )
  }

  await app.keyboard.press("escape")
  await app.waitUntil(() => app.count("text:Installed only") === 0)
  expect(app.window("settings").state()).toBe(null)
  expect(app.window("main").state()).not.toBe(null)
})

test("settings: opening it again brings the open window forward", async () => {
  const app = await openSettings()
  await app.window("settings").pressClose()
  await app.waitUntil(() => app.window("settings").state() === null)

  await app.press("label:Settings")
  await app.waitFor("text:Time format")
  expect(app.count("text:Time format")).toBe(1)
})

// Escape in a dialog of Settings closes the dialog on the desktops, but the
// headless driver hands Escape to the window's `closeOnEscape` first.
test("settings: closing a dialog in Settings leaves Settings open", async () => {
  const app = await openSettings()
  await app.press("text:Calendars")
  await app.press("text:NEW CALENDAR")
  await app.waitFor("text:CREATE CALENDAR")

  await app.press("label:Close")
  await app.waitUntil(() => app.count("text:CREATE CALENDAR") === 0)
  expect(app.window("settings").state()).not.toBe(null)
  expect(app.shows("text:GROUPS")).toBe(true)
})

test("themes: picking one switches the app live", async () => {
  const app = await openSettings()
  await app.press("text:Themes")
  await app.waitFor("label:Nord")

  await app.press("label:Nord")
  await app.waitUntil(() => app.spanStyle("text:Theme mode").color === "#eceff4ff")

  await app.press("label:Ren")
  await app.waitUntil(() => app.spanStyle("text:Theme mode").color === "#ffffffff")
})

test("themes: syncing follows the system's appearance, off Omarchy", async () => {
  const app = await openSettings()
  await app.press("text:Themes")
  await app.waitFor("text:Theme mode")
  await app.waitFor("text:Single theme")
  await app.press("text:Single theme")
  await app.waitFor("text:Sync with system")
  await app.press("text:Sync with system")
  await app.waitUntil(() => app.count("text:Sync with system") === 1)

  // Omarchy's palette replaces the pair on a desktop that has it.
  if (app.shows("text:renCal follows your Omarchy theme.")) {
    await app.press("text:Sync with system")
    await app.waitFor("text:Single theme")
    await app.press("text:Single theme")
    await app.waitFor("label:Nord")
    return
  }

  await app.setColorScheme("light")
  await app.waitUntil(() => app.spanStyle("text:Theme mode").color === "#131313ff")
  await app.setColorScheme("dark")
  await app.waitUntil(() => app.spanStyle("text:Theme mode").color === "#ffffffff")

  await app.press("text:Sync with system")
  await app.waitFor("text:Single theme")
  await app.press("text:Single theme")
  await app.waitFor("label:Nord")
})
