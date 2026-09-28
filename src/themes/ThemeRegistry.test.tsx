// @vitest-environment happy-dom
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { ThemesPage } from "@/components/settings/themes/ThemesPage"

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

const darkRen = { mode: "dark", light: "ren-light", dark: "ren" } as const

let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  localStorage.clear()
  appWindow.setTheme.mockResolvedValue(undefined)
  appWindow.theme.mockResolvedValue("dark")
  appWindow.onThemeChanged.mockResolvedValue(() => {})
  localStorage.setItem("themeSettings", JSON.stringify(darkRen))
  vi.mocked(api.themes.getConfigured).mockResolvedValue(darkRen)
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
      if (name === "theme-changed") handler({ ...darkRen, dark: theme })
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
  expect(api.themes.setConfigured).toHaveBeenCalledWith({ ...darkRen, dark: malicious.id })
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
  const settings = { ...darkRen, dark: malicious.id }
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

it("shows only the pinned slot's themes and fills that slot on pick", async () => {
  await render()
  const names = [...document.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent)
  expect(names).toContain("Ren")
  expect(names).not.toContain("Ren Light")
  expect(document.querySelector('[aria-label="Theme slot"]')).toBeNull()

  const nord = [...document.querySelectorAll("button")].find((b) => b.textContent === "Nord")!
  await act(async () => nord.click())
  expect(api.themes.setConfigured).toHaveBeenCalledWith({ ...darkRen, dark: "nord" })
})
