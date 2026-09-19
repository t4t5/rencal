// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { ThemesPage } from "@/components/settings/themes/ThemesPage"

import { api, type ExternalTheme, type ExternalThemesSnapshot } from "@/lib/api"

import { ThemeProvider } from "./ThemeRegistry"

vi.mock("@/hooks/useOmarchyTheme", () => ({ useOmarchyTheme: vi.fn() }))
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme: vi.fn().mockResolvedValue(undefined) }),
}))
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
  source: { kind: "plugin", id: "alice.dusk", version: "1.0.0" },
  appearance: "dark",
}

let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem("theme", JSON.stringify("ren"))
  vi.mocked(api.themes.getConfigured).mockResolvedValue("ren")
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
    { ...malicious, css: "--background: green; } button { display:none!important } /*" },
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

  await updateThemes([{ ...malicious, css: "--background: green;" }])
  expect(getComputedStyle(button).display).toBe(originalDisplay)
  expect(document.head.querySelector("style[data-external-theme]")?.textContent).toContain("green")

  await updateThemes([])
  expect(document.head.querySelector("style[data-external-theme]")).toBeNull()
  expect(getComputedStyle(button).display).toBe(originalDisplay)
})
