// @vitest-environment happy-dom
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { ThemesPage } from "@/components/settings/themes/ThemesPage"

import { useOmarchyTheme } from "@/hooks/useOmarchyTheme"
import { api, type ExternalTheme, type ExternalThemesSnapshot } from "@/lib/api"

import { useTheme } from "./ThemeController"
import { ThemeProvider } from "./ThemeRegistry"

vi.mock("@/hooks/useOmarchyTheme", () => ({ useOmarchyTheme: vi.fn(() => null) }))
const appWindow = vi.hoisted(() => ({
  setTheme: vi.fn(),
  theme: vi.fn(),
  onThemeChanged: vi.fn(),
}))
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => appWindow }))
vi.mock("@/lib/api/internal", () => ({ emitAppEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/api", () => ({
  api: {
    themes: {
      listExternal: vi.fn(),
      getConfigured: vi.fn(),
      setConfigured: vi.fn().mockResolvedValue(undefined),
    },
    notifications: {
      listen: vi.fn(() => ({ ready: Promise.resolve(), unlisten: vi.fn() })),
    },
  },
}))

const malicious: ExternalTheme = {
  id: "alice.dusk/dark",
  name: "Dusk",
  css: "--background: navy; } button { display:none!important } /*",
  source: { kind: "plugin", id: "alice.dusk" },
  appearance: "dark",
}

const singleRen = { mode: "single", single: "ren", light: "ren-light", dark: "ren" } as const

let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  vi.mocked(useOmarchyTheme).mockReturnValue(null)
  localStorage.clear()
  appWindow.setTheme.mockResolvedValue(undefined)
  appWindow.theme.mockResolvedValue("dark")
  appWindow.onThemeChanged.mockResolvedValue(() => {})
  localStorage.setItem("themeSettings", JSON.stringify(singleRen))
  vi.mocked(api.themes.getConfigured).mockResolvedValue(singleRen)
  vi.mocked(api.themes.listExternal).mockResolvedValue({ themes: [], errors: [] })
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  document.head.querySelectorAll("style[data-external-theme]").forEach((style) => style.remove())
  delete document.body.dataset.theme
  delete document.body.dataset.appearance
  localStorage.clear()
  vi.unstubAllGlobals()
})

async function render(children: ReactNode = <ThemesPage />) {
  await act(async () => {
    root.render(<ThemeProvider>{children}</ThemeProvider>)
  })
}

async function updateThemes(themes: ExternalTheme[]) {
  const snapshot: ExternalThemesSnapshot = { themes, errors: [] }
  await act(async () => {
    for (const [name, handler] of vi.mocked(api.notifications.listen).mock.calls) {
      if (name === "external-themes-changed") handler(snapshot)
    }
  })
}

async function changeTheme(theme: string) {
  await act(async () => {
    for (const [name, handler] of vi.mocked(api.notifications.listen).mock.calls) {
      if (name === "theme-changed") handler({ ...singleRen, single: theme })
    }
  })
}

it("keeps newly installed CSS inactive, previews its palette, and recovers on a built-in theme", async () => {
  await render()
  const ren = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Ren",
  )!
  const originalDisplay = getComputedStyle(ren).display

  await updateThemes([malicious])
  expect(document.body.dataset.theme).toBe("ren")
  expect(getComputedStyle(ren).display).toBe(originalDisplay)
  expect(document.head.querySelector("style[data-external-theme]")).toBeNull()
  const preview = document.querySelector<HTMLElement>('[data-theme="alice.dusk/dark"]')!
  expect(preview.style.getPropertyValue("--background")).toBe("navy")

  await act(async () => preview.closest("button")!.click())
  expect(api.themes.setConfigured).toHaveBeenCalledWith({ ...singleRen, single: malicious.id })
  expect(document.body.dataset.theme).toBe(malicious.id)
  expect(getComputedStyle(ren).display).toBe("none")

  // A config/other-window change can recover even when theme CSS hides controls.
  await changeTheme("ren")
  expect(getComputedStyle(ren).display).toBe(originalDisplay)
  expect(document.head.querySelector("style[data-external-theme]")).toBeNull()

  await updateThemes([
    { ...malicious, css: "--background: green; } button { display:none!important } /*" },
  ])
  expect(preview.style.getPropertyValue("--background")).toBe("green")
  expect(getComputedStyle(ren).display).toBe(originalDisplay)
  expect(document.head.querySelector("style[data-external-theme]")).toBeNull()
})

it("loads the configured theme when its snapshot arrives and removes its CSS on uninstall", async () => {
  const settings = { ...singleRen, single: malicious.id }
  localStorage.setItem("themeSettings", JSON.stringify(settings))
  vi.mocked(api.themes.getConfigured).mockResolvedValue(settings)
  await render()
  const button = document.querySelector("button")!
  const originalDisplay = getComputedStyle(button).display

  await updateThemes([malicious])
  expect(getComputedStyle(button).display).toBe("none")

  await updateThemes([{ ...malicious, css: "--background: green;" }])
  expect(getComputedStyle(button).display).toBe(originalDisplay)
  expect(document.head.querySelector("style[data-external-theme]")?.textContent).toContain("green")

  await updateThemes([])
  expect(document.head.querySelector("style[data-external-theme]")).toBeNull()
  expect(getComputedStyle(button).display).toBe(originalDisplay)
})

it("applies the theme once however many components read it", async () => {
  const Consumer = () => <span>{useTheme().activeTheme}</span>
  await render(
    <>
      <Consumer />
      <Consumer />
      <ThemesPage />
    </>,
  )

  const themeListeners = vi
    .mocked(api.notifications.listen)
    .mock.calls.filter(([name]) => name === "theme-changed")
  expect(themeListeners).toHaveLength(1)
  expect(api.themes.getConfigured).toHaveBeenCalledOnce()
  expect(appWindow.setTheme).toHaveBeenCalledOnce()
  expect(appWindow.setTheme).toHaveBeenCalledWith("dark")
  expect(document.body.dataset.theme).toBe("ren")
})

const themeButton = (name: string) =>
  [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent === name)

it("single theme mode lists every theme and sets the single theme", async () => {
  await render()
  const names = [...document.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent)
  expect(names).toContain("Ren")
  expect(names).toContain("Ren Light")
  expect(document.querySelector('[aria-label="Theme slot"]')).toBeNull()

  await act(async () => (themeButton("Ren Light") as HTMLElement).click())
  expect(api.themes.setConfigured).toHaveBeenLastCalledWith({ ...singleRen, single: "ren-light" })
  expect(appWindow.setTheme).toHaveBeenLastCalledWith("light")
})

it("sync mode edits the pair and leaves the window to the OS", async () => {
  const syncing = { ...singleRen, mode: "system" } as const
  localStorage.setItem("themeSettings", JSON.stringify(syncing))
  vi.mocked(api.themes.getConfigured).mockResolvedValue(syncing)
  await render()

  expect(appWindow.setTheme).toHaveBeenCalledExactlyOnceWith(null)
  expect(document.querySelector('[aria-label="Theme slot"]')).not.toBeNull()
  expect(themeButton("Ren Light")).toBeUndefined()

  await act(async () => (themeButton("Nord") as HTMLElement).click())
  expect(api.themes.setConfigured).toHaveBeenLastCalledWith({ ...syncing, dark: "nord" })
  expect(document.body.dataset.theme).toBe("nord")
})

it("keeps a slot's grid fixed when a hand-edited theme is replaced", async () => {
  const syncing = { ...singleRen, mode: "system", dark: "ren-light" } as const
  localStorage.setItem("themeSettings", JSON.stringify(syncing))
  vi.mocked(api.themes.getConfigured).mockResolvedValue(syncing)
  await render()

  const names = () =>
    [...document.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent)
  const before = names()
  expect(before).not.toContain("Ren Light")
  await act(async () => (themeButton("Nord") as HTMLElement).click())
  expect(names()).toEqual(before)
})

it("sync mode on Omarchy follows the Omarchy theme and hides the pair", async () => {
  vi.mocked(useOmarchyTheme).mockReturnValue({
    mode: "light",
    name: "rose-pine",
    background: "#faf4ed",
    foreground: "#575279",
    bright_foreground: "#575279",
    accent: "#56949f",
    red: "#b4637a",
    green: "#286983",
    yellow: "#ea9d34",
    blue: "#56949f",
  })
  const syncing = { ...singleRen, mode: "system" } as const
  localStorage.setItem("themeSettings", JSON.stringify(syncing))
  vi.mocked(api.themes.getConfigured).mockResolvedValue(syncing)
  await render()

  expect(document.body.dataset.theme).toBe("omarchy")
  expect(appWindow.setTheme).toHaveBeenCalledExactlyOnceWith("light")
  expect(document.querySelector('[aria-label="Theme slot"]')).toBeNull()
  expect(themeButton("Ren")).toBeUndefined()
})
