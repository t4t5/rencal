import { expect, open, test } from "nsh/test"

const TITLE = "Flowtest lunch"
const SERIES = "Flowrepeat"
const SETTLE_MS = 500

// Wide enough for the popovers; a narrow window has the sheet.
const openApp = () => open("../../App.tsx", { width: 1400, height: 900 })

type App = Awaited<ReturnType<typeof openApp>>

const gone = (app: App, selector: string) => app.waitUntil(() => app.count(selector) === 0)

/** Presses what a step before brings up: popups open after a measure or a reload. */
async function tap(app: App, selector: string) {
  await app.waitFor(selector)
  await app.press(selector)
}

/** The backend writes, then reloads: let it land before opening what it changed. */
const settled = (app: App) => app.wait(SETTLE_MS)

async function compose(app: App, text: string, summary: string) {
  await tap(app, "id:compose-event")
  await app.waitFor("text:Meeting at 3pm")
  await app.type("text:Meeting at 3pm", text)
  await app.waitUntil(() => app.value("id:event-summary") === summary)
  await app.press("text:ADD EVENT")
  await app.waitFor("id:compose-event", { timeout: 3000 })
  await settled(app)
}

async function deleteFromPopover(app: App, event: string, choice: string) {
  await tap(app, event)
  await tap(app, "label:More options")
  await tap(app, "text:Delete event")
  await tap(app, choice)
  await settled(app)
}

// Each test reads the app's mock caldir: what it makes is gone at its end.
test("flow: composes, edits, duplicates and deletes an event", async () => {
  const app = await openApp()
  await compose(app, `${TITLE} tomorrow at 1pm`, TITLE)

  // Closing the popover saves the form.
  await tap(app, `text:${TITLE}`)
  await app.waitFor("label:More options")
  await app.type("id:event-summary", " edited")
  await app.keyboard.press("escape")
  await app.waitFor(`text:${TITLE} edited`)
  await gone(app, "label:More options")
  await settled(app)

  // A duplicate opens the new-event popover with a copy.
  await tap(app, `text:${TITLE} edited`)
  await tap(app, "label:More options")
  await tap(app, "text:Duplicate event")
  await app.waitFor("text:ADD EVENT")
  expect(app.value("id:event-summary")).toBe(`${TITLE} edited`)
  await app.press("text:ADD EVENT")
  await app.waitUntil(() => app.count(`text:${TITLE} edited`) === 2)
  await settled(app)

  for (const remaining of [1, 0]) {
    await deleteFromPopover(app, `text:${TITLE} edited >> nth=0`, "text:DELETE")
    await app.waitUntil(() => app.count(`text:${TITLE} edited`) === remaining)
  }
})

test("flow: the form's fields reach the event", async () => {
  const app = await openApp()
  await compose(app, `${TITLE} tomorrow at 2pm`, TITLE)

  await tap(app, `text:${TITLE}`)
  await app.waitFor("label:More options")
  await app.type("text:Reminders", "2h")
  await tap(app, "text:2 hours")
  await app.type("text:Add participant", "sam@example.com")
  await app.submit("text:sam@example.com")
  await app.waitFor("text:sam@example.com")
  // A known name offers its contact; the arrows move through the offers.
  await app.type("text:Add participant", "a")
  await app.waitFor("text:Maya Chen")
  await app.keyboard.press("down")
  await app.keyboard.press("up")
  await tap(app, "text:Maya Chen")
  await app.waitUntil(() => app.value("text:Add participant") === "")
  await tap(app, "text:All-day")
  // The custom repeat dialog sits over the popover and leaves it open.
  await tap(app, "text:Repeat")
  await tap(app, "text:Custom…")
  await tap(app, "text:DONE")
  await app.waitFor("label:More options")
  await app.waitUntil(() => app.count("text:Repeat") === 0)
  await app.keyboard.press("escape")
  await gone(app, "label:More options")
  await settled(app)

  // All-day and repeating now: it shows on several days, under its bare title.
  await tap(app, `text:${TITLE} >> nth=0`)
  await app.waitFor("text:2 hours")
  await app.waitFor("text:sam@example.com")
  expect(app.count("text:14:00")).toBe(0)
  await app.keyboard.press("escape")
  await gone(app, "label:More options")

  await deleteFromPopover(app, `text:${TITLE} >> nth=0`, "text:ALL EVENTS")
  await gone(app, `text:${TITLE}`)
})

test("flow: an occurrence asks what an edit and a delete are for", async () => {
  const app = await openApp()
  await compose(app, `${SERIES} every day at 8am`, SERIES)
  await app.waitFor(`text:${SERIES} >> nth=1`)

  await tap(app, `text:${SERIES} >> nth=0`)
  await app.waitFor("label:More options")
  await app.type("id:event-summary", " once")
  await app.keyboard.press("escape")
  await tap(app, "text:ONLY THIS EVENT")
  await app.waitFor(`text:${SERIES} once`)
  await settled(app)

  await deleteFromPopover(app, `text:${SERIES} once >> nth=0`, "text:ALL EVENTS")
  await gone(app, `text:/^${SERIES}/`)
})
