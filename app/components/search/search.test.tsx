import { expect, open, test } from "nsh/test"

const desktop = { width: 1400, height: 860, platform: "linux" } as const

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

test("a query with no match says so", async () => {
  const app = await open("../../App.tsx", desktop)
  await app.waitFor("id:agenda")
  await app.keyboard.press("/")
  await app.waitFor("id:search-events")
  await app.type("id:search-events", "zzzzqq")
  await app.waitFor("No events found.")
})
