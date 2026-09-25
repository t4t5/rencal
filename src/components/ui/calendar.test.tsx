// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"

import { Calendar } from "./calendar"

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ firstDayOfWeek: "monday", showWeekNumbers: false }),
}))

it("renders month and year dropdowns as themed select controls", () => {
  const container = document.createElement("div")
  container.innerHTML = renderToStaticMarkup(
    <Calendar
      mode="single"
      captionLayout="dropdown"
      defaultMonth={new Date(2026, 8, 1)}
      endMonth={new Date(2030, 11, 1)}
    />,
  )

  const dropdowns = [...container.querySelectorAll("[data-slot=select-trigger]")]
  expect(dropdowns).toHaveLength(2)
  for (const dropdown of dropdowns) {
    expect(dropdown.getAttribute("data-control")).toBe("select")
    expect(dropdown.querySelector("[data-slot=select-icon]")).not.toBeNull()
  }

  // Arrows share the dropdowns' row, as in the minical header.
  const header = container.querySelector("[data-slot=calendar-header]")!
  const directions = [...header.querySelectorAll("[data-direction]")].map(
    (button) => (button as HTMLElement).dataset.direction,
  )
  expect(directions).toEqual(["previous", "next"])
  expect(container.querySelector("[data-slot=calendar-grid]")).not.toBeNull()
})
