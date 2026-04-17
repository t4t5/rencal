import React from "react"
import ReactDOM from "react-dom/client"

import { CalEventsProvider } from "@/contexts/CalEventsContext"
import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { EventDraftProvider } from "@/contexts/EventDraftContext"
import { SettingsProvider } from "@/contexts/SettingsContext"
import { SyncProvider } from "@/contexts/SyncContext"

import { preloadCalendarData } from "@/lib/preload-data"

import App from "@/App"
import { SettingsPage } from "@/Settings"

const params = new URLSearchParams(window.location.search)
const view = params.get("view")

async function bootstrap() {
  const preload = view === "settings" ? {} : await preloadCalendarData()

  const rootEl = document.getElementById("root")

  if (!rootEl) return null

  ReactDOM.createRoot(rootEl).render(
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
