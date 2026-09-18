// Compile-time public contract checks. This function is never executed.
import { Temporal } from "@js-temporal/polyfill"

import {
  api,
  type CalendarEvent,
  type EventRef,
  type EventTime,
  type AppApi,
  type ResponseStatus,
} from "@/lib/api"
import { emitAppEvent } from "@/lib/api/internal"

function checkContracts(name: "theme-changed" | "rencal-config-changed", event: CalendarEvent) {
  const client: AppApi = api
  const ref: EventRef = event
  const start: EventTime = { kind: "date", value: Temporal.PlainDate.from("2026-09-18") }
  const end: EventTime = { kind: "date", value: Temporal.PlainDate.from("2026-09-19") }
  void client

  api.notifications.listen("caldir-config-changed", (settings) => {
    const format: "12h" | "24h" = settings.time_format
    void format
    // @ts-expect-error A settings notification has no theme payload.
    settings.css
  })
  api.notifications.listen("events-changed", (payload) => {
    const empty: null = payload
    void empty
    // @ts-expect-error No-payload notifications cannot carry settings.
    payload.time_format
  })
  // @ts-expect-error Unknown notification name.
  api.notifications.listen("event-changed", () => {})
  // @ts-expect-error Listener payloads are determined by the name.
  api.notifications.listen("theme-changed", (_payload: number) => {})
  void emitAppEvent("theme-changed", "user:custom")
  void emitAppEvent("rencal-config-changed")
  void emitAppEvent("rencal-config-changed", null)
  // @ts-expect-error Theme broadcasts require a string.
  void emitAppEvent("theme-changed", 42)
  // @ts-expect-error Theme broadcasts require a payload.
  void emitAppEvent("theme-changed")
  // @ts-expect-error Unit payloads must be null or omitted.
  void emitAppEvent("rencal-config-changed", "theme")
  // @ts-expect-error Frontend callers cannot emit backend-owned notifications.
  void emitAppEvent("events-changed")
  // @ts-expect-error A union name cannot hide an uncorrelated payload.
  void emitAppEvent(name, "theme")

  void api.events.create({
    calendar_slug: "work",
    summary: "",
    start,
    end,
  })
  void api.events.list({
    calendar_slugs: ["work"],
    range: { start: start.value, end: end.value },
  })
  void api.events.delete(ref)

  const response: ResponseStatus = "accepted"
  void api.events.respond(ref, response)
  // @ts-expect-error RSVP uses the generated fixed set.
  void api.events.respond(ref, "maybe")
  // @ts-expect-error Event status uses the generated fixed set.
  const status: CalendarEvent["status"] = "unknown"
  void status

  void api.events.create({
    calendar_slug: "work",
    summary: "",
    // @ts-expect-error Public inputs take app EventTime values, not wire shapes.
    start: { kind: "date", date: "2026-09-18" },
    end,
  })
}

void checkContracts
