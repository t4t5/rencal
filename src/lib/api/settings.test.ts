// @vitest-environment happy-dom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks"
import { afterEach, expect, it } from "vitest"

import { getCalendarGroups } from "./settings"

afterEach(clearMocks)

it("drops malformed group entries before they reach the app", async () => {
  mockIPC((cmd) => {
    if (cmd !== "TauRPC__config.get_groups") throw new Error(`Unexpected command ${cmd}`)
    return { work: ["work", "team"], broken: undefined }
  })
  expect(await getCalendarGroups()).toEqual({ work: ["work", "team"] })
})
