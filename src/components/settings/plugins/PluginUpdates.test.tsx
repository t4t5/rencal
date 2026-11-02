// @vitest-environment happy-dom
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { api, type InstalledPlugin, type InstalledPlugins } from "@/lib/api"

import {
  PluginUpdatesProvider,
  usePluginUpdateCount,
  useReportPluginUpdates,
} from "./PluginUpdates"

vi.mock("@/lib/api", () => ({
  api: { plugins: { list: vi.fn(), catalog: vi.fn() } },
}))

const plugin: InstalledPlugin = {
  id: "alice.dusk",
  name: "Dusk",
  description: null,
  contributions: [],
  preview_url: null,
  repo: "alice/dusk",
  local_dir: null,
  version: "v1.2.0",
  update_version: "v1.10.0",
  error: null,
}
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

function Count({ report }: { report?: InstalledPlugins }) {
  const count = usePluginUpdateCount()
  const reportUpdates = useReportPluginUpdates()
  useEffect(() => {
    if (report) reportUpdates(report)
  }, [report, reportUpdates])
  return <p>{count}</p>
}

it("counts updates from a list fetched after the catalog, then from reported lists", async () => {
  const order: string[] = []
  vi.mocked(api.plugins.catalog).mockImplementation(async () => {
    order.push("catalog")
    return { plugins: [], error: null }
  })
  vi.mocked(api.plugins.list).mockImplementation(async () => {
    order.push("list")
    return { plugins: [plugin, { ...plugin, id: "bob.dawn", update_version: null }], errors: [] }
  })
  await act(async () =>
    root.render(
      <PluginUpdatesProvider>
        <Count />
      </PluginUpdatesProvider>,
    ),
  )
  expect(order).toEqual(["catalog", "list"])
  expect(document.body.textContent).toBe("1")

  await act(async () =>
    root.render(
      <PluginUpdatesProvider>
        <Count report={{ plugins: [{ ...plugin, update_version: null }], errors: [] }} />
      </PluginUpdatesProvider>,
    ),
  )
  expect(document.body.textContent).toBe("0")
})
