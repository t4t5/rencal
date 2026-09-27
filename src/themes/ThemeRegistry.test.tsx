// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { ThemesPage } from "@/components/settings/themes/ThemesPage"

import { api, type ExternalTheme, type ExternalThemesSnapshot } from "@/lib/api"

import { ThemeProvider } from "./ThemeRegistry"

vi.mock("@/hooks/useOmarchyTheme", () => ({ useOmarchyTheme: vi.fn() }))
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
      getAppearance: vi.fn().mockResolvedValue("auto"),
      setAppearance: vi.fn().mockResolvedValue(undefined),
    },
    notifications: {
      listen: vi.fn(() => ({ ready: Promise.resolve(), unlisten: vi.fn() })),
    },
  },
}))

const malicious: ExternalTheme = {
  id: "alice.dusk/dark",
  name: "Dusk",
  variants: {
    kind: "single",
    css: "--background: navy; } button { display:none!important } /*",
    appearance: "dark",
  },
  source: { kind: "plugin", id: "alice.dusk" },
}

function withCss(theme: ExternalTheme, css: string): ExternalTheme {
  return { ...theme, variants: { kind: "single", css, appearance: "dark" } }
}

let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem("theme", JSON.stringify("ren"))
  vi.mocked(api.themes.getConfigured).mockResolvedValue("ren")
  vi.mocked(api.themes.listExternal).mockResolvedValue({ themes: [], errors: [] })
  appWindow.setTheme.mockResolvedValue(undefined)
  appWindow.theme.mockResolvedValue("light")
  appWindow.onThemeChanged.mockResolvedValue(vi.fn())
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

async function render() {
  await act(async () => {
    root.render(
      <ThemeProvider>
        <ThemesPage />
      </ThemeProvider>,
    )
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
      if (name === "theme-changed") handler(theme)
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
  expect(api.themes.setConfigured).toHaveBeenCalledWith(malicious.id)
  expect(document.body.dataset.theme).toBe(malicious.id)
  expect(getComputedStyle(ren).display).toBe("none")

  // A config/other-window change can recover even when theme CSS hides controls.
  await changeTheme("ren")
  expect(getComputedStyle(ren).display).toBe(originalDisplay)
  expect(document.head.querySelector("style[data-external-theme]")).toBeNull()

  await updateThemes([
    withCss(malicious, "--background: green; } button { display:none!important } /*"),
  ])
  expect(preview.style.getPropertyValue("--background")).toBe("green")
  expect(getComputedStyle(ren).display).toBe(originalDisplay)
  expect(document.head.querySelector("style[data-external-theme]")).toBeNull()
})

it("loads the configured theme when its snapshot arrives and removes its CSS on uninstall", async () => {
  localStorage.setItem("theme", JSON.stringify(malicious.id))
  vi.mocked(api.themes.getConfigured).mockResolvedValue(malicious.id)
  await render()
  const button = document.querySelector("button")!
  const originalDisplay = getComputedStyle(button).display

  await updateThemes([malicious])
  expect(getComputedStyle(button).display).toBe("none")

  await updateThemes([withCss(malicious, "--background: green;")])
  expect(getComputedStyle(button).display).toBe(originalDisplay)
  expect(document.head.querySelector("style[data-external-theme]")?.textContent).toContain("green")

  await updateThemes([])
  expect(document.head.querySelector("style[data-external-theme]")).toBeNull()
  expect(getComputedStyle(button).display).toBe(originalDisplay)
})

it("follows the system for a theme with both variants until the user pins one", async () => {
  const both: ExternalTheme = {
    id: "alice.gruvbox/gruvbox",
    name: "Gruvbox",
    variants: { kind: "both", light: "--background: beige;", dark: "--background: black;" },
    source: { kind: "plugin", id: "alice.gruvbox" },
  }
  await render()
  await updateThemes([both])
  expect(document.body.textContent).not.toContain("Appearance")

  const tile = document.querySelector('[data-theme="alice.gruvbox/gruvbox"]')!.closest("button")!
  const previews = tile.querySelectorAll<HTMLElement>('[data-theme="alice.gruvbox/gruvbox"]')
  expect([...previews].map((preview) => preview.dataset.appearance)).toEqual(["light", "dark"])
  expect(previews[0]!.style.getPropertyValue("--background")).toBe("beige")
  expect(previews[1]!.style.getPropertyValue("--background")).toBe("black")

  await act(async () => tile.click())
  expect(appWindow.setTheme).toHaveBeenCalledWith(null)
  expect(document.body.dataset.appearance).toBe("light")
  expect(getComputedStyle(document.body).getPropertyValue("--background").trim()).toBe("beige")
  const auto = [...document.querySelectorAll('[role="tab"]')].find((tab) =>
    tab.textContent?.startsWith("Auto"),
  )
  expect(auto?.textContent).toBe("Auto (Light)")

  // The OS switches while on Auto.
  await act(async () => {
    const [handler] = appWindow.onThemeChanged.mock.calls.at(-1)!
    ;(handler as (event: { payload: string }) => void)({ payload: "dark" })
  })
  expect(document.body.dataset.appearance).toBe("dark")
  expect(getComputedStyle(document.body).getPropertyValue("--background").trim()).toBe("black")

  appWindow.setTheme.mockClear()
  const light = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (tab) => tab.textContent === "Light",
  )!
  await act(async () => {
    light.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
  })
  expect(api.themes.setAppearance).toHaveBeenCalledWith("light")
  expect(document.body.dataset.appearance).toBe("light")
  expect(appWindow.setTheme).toHaveBeenCalledWith("light")
  expect(localStorage.getItem("themeAppearanceResolved")).toBe("light")
})
