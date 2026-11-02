// @vitest-environment happy-dom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { api, type SkillsStatus } from "@/lib/api"

import { AgentsPage } from "./AgentsPage"

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }))

vi.mock("@/lib/api", () => ({
  api: {
    agents: { skills: vi.fn(), installSkill: vi.fn(), uninstallSkill: vi.fn() },
  },
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}))

type Link = "linked" | "missing"

const status = (rencal: Link, { caldirCli = true } = {}): SkillsStatus => ({
  supported: true,
  skills: [
    {
      skill: "rencal",
      available: true,
      agents: [
        { name: "Claude Code", link: rencal },
        { name: "Codex", link: rencal },
      ],
    },
    {
      skill: "caldir",
      available: caldirCli,
      agents: [
        { name: "Claude Code", link: "missing" },
        { name: "Codex", link: "missing" },
      ],
    },
  ],
})

let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.resetAllMocks()
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () => root.render(<AgentsPage />))
}

function checkbox(label: string) {
  const match = [...document.querySelectorAll("label")].find(
    (element) => element.textContent === label,
  )
  const target = match && document.getElementById(match.htmlFor)
  if (!target) throw new Error(`Checkbox ${label} not found: ${document.body.textContent}`)
  return target as HTMLButtonElement
}

const toggle = (label: string) => act(async () => checkbox(label).click())

it("adds and removes a skill with its checkbox", async () => {
  vi.mocked(api.agents.skills).mockResolvedValue(status("missing"))
  vi.mocked(api.agents.installSkill).mockResolvedValue(status("linked"))
  vi.mocked(api.agents.uninstallSkill).mockResolvedValue(status("missing"))
  await render()

  expect(checkbox("renCal").getAttribute("aria-checked")).toBe("false")

  await toggle("renCal")
  expect(api.agents.installSkill).toHaveBeenCalledWith("rencal")
  expect(checkbox("renCal").getAttribute("aria-checked")).toBe("true")

  await toggle("renCal")
  expect(api.agents.uninstallSkill).toHaveBeenCalledWith("rencal")
  expect(checkbox("renCal").getAttribute("aria-checked")).toBe("false")
})

it("keeps caldir unchecked until its CLI is installed", async () => {
  vi.mocked(api.agents.skills).mockResolvedValue(status("missing", { caldirCli: false }))
  await render()

  expect(checkbox("caldir").disabled).toBe(true)
  expect(document.body.textContent).toContain("Needs the caldir CLI.")

  vi.mocked(api.agents.skills).mockResolvedValue(status("missing"))
  await act(async () => window.dispatchEvent(new Event("focus")))
  expect(checkbox("caldir").disabled).toBe(false)
  expect(document.body.textContent).not.toContain("Needs the caldir CLI.")
})
