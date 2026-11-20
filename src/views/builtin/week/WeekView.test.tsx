// @vitest-environment happy-dom
/** Exercises the shared Day and Week gutter through its resize handle. */
import { Temporal } from "@js-temporal/polyfill"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { DayView, WeekView } from "./WeekView"

vi.mock("@/sdk", async () => {
  const activeDate = Temporal.PlainDate.from("2026-12-01")
  return {
    ...(await vi.importActual<typeof import("@/sdk/TimeZoneGutter")>("@/sdk/TimeZoneGutter")),
    cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
    dayProps: () => ({}),
    epochDay: (day: Temporal.PlainDate) => day.since(activeDate).days,
    eventsByDay: () => [],
    formatWallclockTime: () => "10:00 AM",
    formatWeekday: () => "Tue",
    layoutAllDay: () => ({ bars: [], laneCount: 0 }),
    startOfWeek: (day: Temporal.PlainDate) => day.subtract({ days: day.dayOfWeek - 1 }),
    TimeZoneMenu: ({ children }: { children: React.ReactNode }) => children,
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
    useDayGrid: () => ({}),
    useDisplaySettings: () => ({
      timeFormat: "12h",
      firstDayOfWeek: "monday",
      extraTimeZones: ["America/Denver"],
    }),
    useEventsInRange: () => [],
    useNavigation: () => ({ activeDate }),
    useOnNavigate: () => {},
    useToday: () => activeDate.subtract({ days: 1 }),
    useViewerTzid: () => "America/New_York",
  }
})

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000)
  localStorage.clear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const slot = (name: string) => container.querySelector<HTMLElement>(`[data-slot="${name}"]`)!
const handle = () => container.querySelector<HTMLElement>('[role="separator"]')!

function point(type: string, clientX: number, pointerId = 1) {
  act(() => {
    handle().dispatchEvent(new PointerEvent(type, { pointerId, clientX, bubbles: true }))
  })
}

function press(key: string) {
  act(() => {
    handle().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
}

it("resizes both week grids together while preserving the visible day and scroll time", () => {
  act(() => root.render(<WeekView />))
  const scroll = slot("week-scroll")
  const header = slot("week-header")
  const grid = slot("week-time-grid")
  let roundedLeft = Math.round(scroll.scrollLeft)
  Object.defineProperty(scroll, "scrollLeft", {
    get: () => roundedLeft,
    set: (left: number) => {
      roundedLeft = Math.round(left)
    },
  })
  expect(scroll.style.getPropertyValue("--week-zone-width")).toBe("48px")
  const before = scroll.scrollLeft / ((1000 - 96) / 7)
  const scrollTop = scroll.scrollTop

  point("pointerdown", 96)
  for (let x = 98; x <= 168; x += 2) point("pointermove", x)

  expect(scroll.style.getPropertyValue("--week-gutter-width")).toBe("168px")
  expect(header.style.gridTemplateColumns).toBe(grid.style.gridTemplateColumns)
  expect(grid.style.gridTemplateColumns).toMatch(/^168px repeat\(\d+, 118\./)
  expect(scroll.style.getPropertyValue("--week-zone-width")).toBe("84px")
  expect(scroll.scrollLeft).toBe(Math.round((before * (1000 - 168)) / 7))
  expect(scroll.scrollTop).toBe(scrollTop)
  point("pointerup", 168)

  act(() => root.render(<DayView />))
  expect(slot("week-time-grid").style.gridTemplateColumns).toMatch(/^168px repeat\(\d+, 832px\)/)
})

it.each(["pointerup", "pointercancel", "lostpointercapture"])(
  "only ends the drag on %s from the active pointer",
  (event) => {
    act(() => root.render(<DayView />))
    const start = Number(handle().getAttribute("aria-valuenow"))
    point("pointerdown", start)
    point("pointerdown", start, 2)
    point(event, start, 2)
    point("pointermove", start + 10)
    expect(handle().getAttribute("aria-valuenow")).toBe(String(start + 10))

    point(event, start + 10)
    point("pointermove", start + 20)
    expect(handle().getAttribute("aria-valuenow")).toBe(String(start + 10))
  },
)

it("supports keyboard resizing and exposes the bounds on the separator", () => {
  act(() => root.render(<DayView />))
  const separator = handle()
  expect(separator.getAttribute("aria-orientation")).toBe("vertical")
  press("End")
  expect(separator.getAttribute("aria-valuenow")).toBe(separator.getAttribute("aria-valuemax"))
  press("ArrowLeft")
  expect(Number(separator.getAttribute("aria-valuenow"))).toBeLessThan(
    Number(separator.getAttribute("aria-valuemax")),
  )
  press("Home")
  expect(separator.getAttribute("aria-valuenow")).toBe(separator.getAttribute("aria-valuemin"))
})

it("leaves room for a day in a narrow window", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300)
  act(() => root.render(<DayView />))
  press("End")

  expect(handle().getAttribute("aria-valuemax")).toBe("200")
  expect(slot("week-time-grid").style.gridTemplateColumns).toMatch(/^200px repeat\(\d+, 100px\)/)
})
