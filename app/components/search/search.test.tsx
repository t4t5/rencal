import { expect, open, test } from "nsh/test"

// The day the mock calendar's "Drinks at The Albion" is on, so it's in the agenda too.
const desktop = {
  width: 1400,
  height: 860,
  platform: "linux",
  clock: { time: new Date(2026, 10, 6, 12) },
} as const

test("/ searches events, and choosing one opens it", async () => {
  const app = await open("../../App.tsx", desktop)
  await app.waitFor("id:agenda")
  await app.keyboard.press("/")
  await app.waitFor("id:search-events")
  await app.type("id:search-events", "albion")
  await app.waitUntil(() => app.count("text:Drinks at The Albion") > 1)
  await app.keyboard.press("enter")
  await app.waitFor("Add timezone")
  expect(app.shows("id:search-events")).toBe(false)
})

test("choosing an event months away loads its day and opens it", async () => {
  const app = await open("../../App.tsx", { ...desktop, clock: { time: new Date(2027, 5, 1, 12) } })
  await app.waitFor("id:agenda")
  await app.keyboard.press("/")
  await app.waitFor("id:search-events")
  await app.type("id:search-events", "albion")
  await app.waitUntil(() => app.count("text:Drinks at The Albion") > 0)
  await app.keyboard.press("enter")
  await app.waitFor("Add timezone")
})

test("a query with no match says so", async () => {
  const app = await open("../../App.tsx", desktop)
  await app.waitFor("id:agenda")
  await app.keyboard.press("/")
  await app.waitFor("id:search-events")
  await app.type("id:search-events", "zzzzqq")
  await app.waitFor("No events found.")
})
