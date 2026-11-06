import { expect, open, test } from "nsh/test"

const desktop = { width: 1400, height: 860, platform: "linux" } as const

const openView = async (view: string) => {
  const app = await open("../App.tsx", { ...desktop, storage: { calendarView: view } })
  await app.waitFor("TODAY")
  return app
}

test("the view switcher lists the views and switches between them", async () => {
  const app = await openView("month")
  await app.press("Month")
  await app.waitFor("Week")
  expect(app.shows("Year")).toBe(true)
  await app.press("Week")
  await app.waitFor("12:00")
  expect(app.shows("23:00")).toBe(true)
  expect(app.storage().calendarView).toBe("week")
})

test("the week view shows today's week, with today marked by the current time", async () => {
  const app = await openView("week")
  await app.waitUntil(() => app.count("id:week-day") >= 7)
  const now = new Date()
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`
  expect(app.texts().join(" ").replace(/\s/g, "")).toContain(time)
})

test("the year view shows twelve months and moves a year at a time", async () => {
  const app = await openView("year")
  const year = new Date().getFullYear()
  await app.waitFor(String(year))
  expect(app.shows("January")).toBe(true)
  expect(app.shows("December")).toBe(true)
  await app.press("id:year-next")
  await app.waitFor(String(year + 1))
  await app.press("id:year-previous")
  await app.waitFor(String(year))
})

// Fingers drag scroll views along their axis, so these go across the month's rows.
test("view: dragging an event across the month previews it, and Escape cancels", async () => {
  const app = await openView("month")
  await app.waitUntil(() => app.count("id:event:Drinks at The Albion") > 0)
  await app.dragAndHold("id:event:Drinks at The Albion", { x: 340 })
  await app.wait(50)
  expect(app.count("id:drag-float")).toBe(1)
  expect(app.count("id:drag-preview")).toBe(1)
  await app.keyboard.press("escape")
  await app.wait(50)
  expect(app.count("id:drag-float")).toBe(0)
  expect(app.count("id:drag-preview")).toBe(0)
  await app.drop()
  await app.wait(50)
  expect(app.count("id:drag-preview")).toBe(0)
})

test("view: dragging across empty days draws a selection, and the release opens the draft", async () => {
  const app = await openView("month")
  await app.waitUntil(() => app.count("id:day") > 0)
  await app.dragAndHold("id:day >> nth=21", { x: 300 })
  await app.wait(50)
  expect(app.count("id:create-selection")).toBeGreaterThan(0)
  await app.drop()
  await app.wait(100)
  expect(app.count("id:create-selection")).toBe(0)
  await app.waitFor("ADD EVENT")
})

test("view: the secondary button offers the event's actions, and creating on a day", async () => {
  const app = await openView("month")
  await app.waitUntil(() => app.count("id:event:Drinks at The Albion") > 0)
  await app.rightClick("id:event:Drinks at The Albion")
  expect(app.menu()?.map((item) => item.label)).toContain("Edit event")
  await app.closeMenu()
  await app.rightClick("id:day >> nth=21")
  expect(app.menu()?.map((item) => item.label)).toEqual(["Create event"])
  await app.chooseMenuItem("Create event")
  await app.waitFor("ADD EVENT")
})
