import { Temporal } from "@js-temporal/polyfill"
import { open, test } from "nsh/test"

import { formatMonth, formatShortDate } from "@/lib/event-time"

const TITLE = "Datepicker lunch"

const openApp = () => open("../../App.tsx", { width: 1400, height: 900 })

type App = Awaited<ReturnType<typeof openApp>>

async function tap(app: App, selector: string) {
  await app.waitFor(selector)
  await app.press(selector)
}

// Reads the app's mock caldir: the event it makes is gone at its end.
test("picks a date from another month through the month select", async () => {
  const app = await openApp()
  await tap(app, "id:compose-event")
  await app.waitFor("text:Meeting at 3pm")
  await app.type("text:Meeting at 3pm", `${TITLE} tomorrow at 1pm`)
  await app.waitUntil(() => app.value("id:event-summary") === TITLE)
  await app.press("text:ADD EVENT")
  await app.waitFor("id:compose-event", { timeout: 3000 })
  await app.wait(500)

  const tomorrow = Temporal.Now.plainDateISO().add({ days: 1 })
  // The month select keeps the shown year.
  const target = tomorrow.with({ month: tomorrow.month > 6 ? 2 : 10, day: 15 })

  await tap(app, `text:${TITLE}`)
  await tap(app, `text:${formatShortDate(tomorrow)}`)
  await app.waitFor(`id:date-picker-${tomorrow.toString()}`)
  await tap(app, "label:Month")
  // The month list opens over the calendar, so its row is the month's last match.
  const month = `text:${formatMonth(target, "short")}`
  await app.waitFor(month)
  await app.press(`${month} >> nth=${app.count(month) - 1}`)
  await tap(app, `id:date-picker-${target.toString()}`)
  await app.waitFor(`text:${formatShortDate(target)}`)
  await app.waitUntil(() => app.count(`id:date-picker-${target.toString()}`) === 0)

  await tap(app, "label:More options")
  await tap(app, "text:Delete event")
  await tap(app, "text:DELETE")
  await app.waitUntil(() => app.count("label:More options") === 0)
})
