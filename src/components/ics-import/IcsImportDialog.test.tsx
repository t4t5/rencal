// @vitest-environment happy-dom
import { Temporal } from "@js-temporal/polyfill"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { toast } from "sonner"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  api,
  type Calendar,
  type CalendarEvent,
  type EventTime,
  type IcsPreview,
  type IcsSourceCalendar,
} from "@/lib/api"

import { IcsImportDialog } from "./IcsImportDialog"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock("@/lib/api", () => ({
  api: { icsFiles: { preview: vi.fn(), import: vi.fn() } },
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}))

const calendar = (slug: string, name: string, provider: string | null = null): Calendar => ({
  slug,
  name,
  color: null,
  provider,
  account: null,
  email: null,
  read_only: null,
})

const calendars = [
  calendar("home", "Home"),
  calendar("google-work", "Work", "google"),
  { ...calendar("holidays", "Holidays", "webcal"), read_only: true },
]

vi.mock("@/contexts/CalendarStateContext", () => ({
  useCalendars: () => ({ calendars }),
}))
vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ defaultCalendar: "google-work", timeFormat: "24h" }),
}))

const day = (value: string): EventTime => ({ kind: "date", value: Temporal.PlainDate.from(value) })

const source = (name: string, overrides: Partial<IcsSourceCalendar> = {}): IcsSourceCalendar => ({
  name,
  color: "#009688",
  event_count: 2,
  first_start: day("2026-01-05"),
  last_start: day("2026-03-01"),
  has_guests: false,
  ...overrides,
})

const lunch = {
  summary: "Lunch with Sam",
  location: "Corner café",
  start: day("2026-11-05"),
  end: day("2026-11-06"),
  calendar_slug: "google-work",
} as CalendarEvent

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

async function render(preview: IcsPreview, onClose = vi.fn()) {
  vi.mocked(api.icsFiles.preview).mockResolvedValue(preview)
  await act(async () =>
    root.render(<IcsImportDialog path="/tmp/file.ics" onClose={onClose} onImported={vi.fn()} />),
  )
  return onClose
}

const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? ""

async function click(label: string) {
  const match = [...document.querySelectorAll("button")].find((b) => b.textContent === label)
  if (!match) throw new Error(`Button ${label} not found: ${dialogText()}`)
  await act(async () => match.click())
}

it("adds a single event to the default calendar", async () => {
  vi.mocked(api.icsFiles.import).mockResolvedValue({
    imported_count: 1,
    duplicate_count: 0,
    event: lunch,
  })
  const onClose = await render({
    file_name: "invite.ics",
    calendars: [source("invite", { event_count: 1, has_guests: true })],
    event: lunch,
    skipped_count: 0,
  })

  expect(dialogText()).toContain("Lunch with Sam")
  expect(dialogText()).toContain("Corner café")
  expect(dialogText()).toContain("Work")
  expect(dialogText()).toContain("nobody gets an invitation email")

  await click("Add event")
  expect(api.icsFiles.import).toHaveBeenCalledWith("/tmp/file.ics", [
    { source: 0, destination: { kind: "existing", calendar_slug: "google-work" } },
  ])
  expect(toast.success).toHaveBeenCalledWith("Added “Lunch with Sam” to Work")
  expect(onClose).toHaveBeenCalled()
})

it("imports each calendar of an export into a new calendar", async () => {
  vi.mocked(api.icsFiles.import).mockResolvedValue({
    imported_count: 4,
    duplicate_count: 1,
    event: null,
  })
  await render({
    file_name: "fossify.ics",
    calendars: [source("Private"), source("Work", { has_guests: true, color: null })],
    event: null,
    skipped_count: 1,
  })

  expect(dialogText()).toContain("fossify.ics · 4 events")
  expect(dialogText()).toContain("New calendar “Private”")
  expect(dialogText()).toContain("1 event in this file couldn’t be read")
  // Guests stay: new calendars are local.
  expect(dialogText()).not.toContain("invitation email")

  await click("Import 4 events")
  expect(api.icsFiles.import).toHaveBeenCalledWith("/tmp/file.ics", [
    { source: 0, destination: { kind: "new", name: "Private", color: "#009688" } },
    { source: 1, destination: { kind: "new", name: "Work", color: null } },
  ])
  expect(toast.success).toHaveBeenCalledWith("Imported 4 events (1 event already there)")
})

it("keeps an import error in the dialog", async () => {
  vi.mocked(api.icsFiles.import).mockRejectedValue(new Error("Holidays is read-only"))
  const onClose = await render({
    file_name: "export.ics",
    calendars: [source("Export")],
    event: null,
    skipped_count: 0,
  })

  await click("Import 2 events")
  expect(dialogText()).toContain("Holidays is read-only")
  expect(onClose).not.toHaveBeenCalled()
})

it("explains a file it can't read", async () => {
  vi.mocked(api.icsFiles.preview).mockRejectedValue(new Error("There are no events in this file"))
  await act(async () =>
    root.render(<IcsImportDialog path="/tmp/empty.ics" onClose={vi.fn()} onImported={vi.fn()} />),
  )
  expect(dialogText()).toContain("empty.ics")
  expect(dialogText()).toContain("There are no events in this file")
})
