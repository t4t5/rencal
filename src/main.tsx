import React from "react"
import ReactDOM from "react-dom/client"

import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { EventDraftProvider } from "@/contexts/EventDraftContext"
import { SettingsProvider } from "@/contexts/SettingsContext"

import App from "@/App"
import { SettingsPage } from "@/Settings"

import { CalEventsProvider } from "./contexts/CalEventsContext"
import { SyncProvider } from "./contexts/SyncContext"
import { getCalendarEventsForRange, getStartRangeForDate } from "./lib/cal-events-range"
import { logger } from "./lib/logger"
import type { DateRange } from "./lib/types"
import { rpc } from "./rpc"
import type { Calendar, CalendarEvent } from "./rpc/bindings"

const params = new URLSearchParams(window.location.search)
const view = params.get("view")

type Preload = {
  initialCalendars?: Calendar[]
  initialEvents?: CalendarEvent[]
  initialDate?: Date
  initialRange?: DateRange
}

async function preloadCalendarData(): Promise<Preload> {
  try {
    const initialDate = new Date()
    const initialCalendars = await rpc.caldir.list_calendars()
    const slugs = initialCalendars.map((c) => c.slug)

    if (slugs.length === 0) {
      return { initialCalendars, initialEvents: [], initialDate }
    }

    const initialRange = getStartRangeForDate(initialDate)
    const initialEvents = await getCalendarEventsForRange(
      slugs,
      initialRange.start,
      initialRange.end,
    )
    return { initialCalendars, initialEvents, initialDate, initialRange }
  } catch (err) {
    logger.error("Preload failed, falling back to lazy load", err)
    return {}
  }
}

async function bootstrap() {
  const preload = view === "settings" ? {} : await preloadCalendarData()

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <SettingsProvider>
        <CalendarStateProvider
          initialCalendars={preload.initialCalendars}
          initialDate={preload.initialDate}
        >
          {view === "settings" ? (
            <SettingsPage />
          ) : (
            <CalEventsProvider
              initialEvents={preload.initialEvents}
              initialRange={preload.initialRange}
            >
              <SyncProvider>
                <EventDraftProvider>
                  <App />
                </EventDraftProvider>
              </SyncProvider>
            </CalEventsProvider>
          )}
        </CalendarStateProvider>
      </SettingsProvider>
    </React.StrictMode>,
  )
}

void bootstrap()
