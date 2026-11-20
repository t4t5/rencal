import { expect, open, test } from "nsh/test"

const desktop = { width: 1400, height: 860, platform: "linux" } as const

const opened = async () => {
  const app = await open("../../App.tsx", desktop)
  await app.waitFor("id:agenda")
  return app
}

const shownMonth = (texts: string[]) => texts.find((text) => /^[a-z]+ \d{4}$/i.test(text))

test("opens on today", async () => {
  const app = await opened()
  await app.waitFor("TODAY")
})

type App = Awaited<ReturnType<typeof opened>>

/** Scrolls until `done`, waiting at the list's end for more to load. */
async function scrollUntil(app: App, distance: number, done: () => boolean) {
  for (let i = 0; i < 80 && !done(); i++) {
    try {
      await app.scroll("id:agenda", distance)
    } catch {
      await app.wait(100)
    }
  }
  expect(done()).toBe(true)
}

test("scrolling on moves the active date past the first range", async () => {
  const app = await opened()
  // The first range ends three months on: this month's name comes round in a year.
  const start = shownMonth(app.texts())
  const seen = new Set([start])
  await scrollUntil(app, 2500, () => {
    seen.add(shownMonth(app.texts()))
    return seen.size >= 6
  })
})

test("scrolling back loads what comes before", async () => {
  const app = await opened()
  const seen = new Set([shownMonth(app.texts())])
  await scrollUntil(app, -2500, () => {
    seen.add(shownMonth(app.texts()))
    return seen.size >= 2
  })
})

test("tab steps through events and enter opens the selected one", async () => {
  const app = await opened()
  await app.keyboard.press("tab")
  await app.keyboard.press("tab")
  await app.keyboard.press("enter")
  await app.waitFor("Add timezone")
})

test("backspace asks to delete the selected event, and enter confirms", async () => {
  const app = await opened()
  // Step to an event of our own: others can't be deleted.
  for (let i = 0; i < 10 && app.count("text:/^Delete( recurring)? event$/i") === 0; i++) {
    await app.keyboard.press("tab")
    await app.keyboard.press("backspace")
    await app.wait(100)
  }
  await app.waitFor("text:/^Delete( recurring)? event$/i")
  await app.wait(300)
  await app.keyboard.press("enter")
  await app.waitUntil(() => app.count("text:/^Delete( recurring)? event$/i") === 0)
  // Enter went to the dialog, not to the selected row behind it.
  expect(app.count("Add timezone")).toBe(0)
})

test("tab after opening an event goes to its title, past More options", async () => {
  const app = await opened()
  // Step to an event of our own: only those have More options before the title.
  for (let i = 0; i < 10; i++) {
    await app.keyboard.press("tab")
    await app.keyboard.press("enter")
    await app.waitFor("Add timezone")
    if (app.count("label:More options") > 0) break
    await app.keyboard.press("escape")
    await app.waitUntil(() => app.count("Add timezone") === 0)
  }
  await app.waitFor("label:More options")
  const title = app.value("id:event-summary") ?? ""
  await app.keyboard.press("tab")
  await app.keyboard.press("x")
  await app.waitUntil(() => app.value("id:event-summary") === `${title}x`)
  // Back as it was, so closing saves nothing.
  await app.keyboard.press("backspace")
  await app.waitUntil(() => app.value("id:event-summary") === title)
})

test("the day rolls over at midnight", async () => {
  const beforeMidnight = new Date(2026, 10, 6, 23, 59, 30)
  const app = await open("../../App.tsx", { ...desktop, clock: { time: beforeMidnight } })
  await app.waitFor("id:agenda")
  const dayAfterToday = () => app.texts()[app.texts().indexOf("TODAY") + 1]
  await app.waitUntil(() => dayAfterToday() === "6 NOV")
  await app.clock?.fastForward(60_000)
  await app.waitUntil(() => dayAfterToday() === "7 NOV")
})

test("the join button shows around the meeting and opens it without opening the event", async () => {
  const app = await open("../../App.tsx", {
    ...desktop,
    clock: { time: new Date(2026, 10, 6, 8, 30) },
  })
  await app.waitFor("id:agenda")
  await app.waitFor("Daily standup")
  expect(app.count("text:JOIN")).toBe(0)
  await app.clock?.fastForward(60 * 60_000)
  await app.waitFor("text:JOIN")
  await app.press("text:JOIN")
  await app.wait(50)
  expect(app.openedUrls().length).toBe(1)
  expect(app.shows("Add timezone")).toBe(false)
})
