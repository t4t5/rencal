// @vitest-environment happy-dom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks"
import { afterEach, expect, it } from "vitest"

import { api } from "@/lib/api"

afterEach(clearMocks)

it("returns the calendar stored by local creation", async () => {
  const stored = {
    slug: "design",
    name: "Design",
    color: "#7986cb",
    provider: null,
    account: null,
    read_only: false,
  }
  mockIPC((cmd, args) => {
    if (cmd !== "TauRPC__caldir.create_local_calendar") {
      throw new Error(`Unexpected command ${cmd}`)
    }
    expect(args).toEqual({ name: "Design", color: "#7986cb" })
    return stored
  })

  await expect(api.calendars.create("Design", "#7986cb")).resolves.toEqual(stored)
})
