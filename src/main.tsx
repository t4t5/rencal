import React from "react"
import ReactDOM from "react-dom/client"

import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { EventDraftProvider } from "@/contexts/EventDraftContext"
import { SettingsProvider } from "@/contexts/SettingsContext"

import App from "@/App"
import { SettingsPage } from "@/Settings"

import { CalEventsProvider } from "./contexts/CalEventsContext"
import { SyncProvider } from "./contexts/SyncContext"

const params = new URLSearchParams(window.location.search)
const view = params.get("view")

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <CalendarStateProvider>
        {view === "settings" ? (
          <SettingsPage />
        ) : (
          <CalEventsProvider>
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
