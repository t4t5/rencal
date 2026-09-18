// Compile-time contract checks. This function is never executed.
import { rpc } from "@/rpc"
import type { CalendarEvent, ResponseStatus } from "@/rpc/bindings"

import { emitAppEvent, listenAppEvent } from "./events"

function checkContracts(name: "theme-changed" | "rencal-config-changed") {
  listenAppEvent("caldir-config-changed", (settings) => {
    const format: "12h" | "24h" = settings.time_format
    void format
    // @ts-expect-error A settings notification has no theme payload.
    settings.css
  })
  listenAppEvent("events-changed", (payload) => {
    const empty: null = payload
    void empty
    // @ts-expect-error No-payload notifications cannot carry settings.
    payload.time_format
  })
  // @ts-expect-error Unknown notification name.
  listenAppEvent("event-changed", () => {})
  // @ts-expect-error Listener payloads are determined by the name.
  listenAppEvent("theme-changed", (_payload: number) => {})
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

  const response: ResponseStatus = "accepted"
  void rpc.caldir.rsvp("work", "event", response)
  // @ts-expect-error RSVP uses the generated fixed set.
  void rpc.caldir.rsvp("work", "event", "maybe")
  // @ts-expect-error Event status uses the generated fixed set.
  const status: CalendarEvent["status"] = "unknown"
  void status
}

void checkContracts
