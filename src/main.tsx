import React from "react"
import ReactDOM from "react-dom/client"

import { Toaster } from "@/components/ui/sonner"

import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { EventDraftProvider } from "@/contexts/EventDraftContext"

import App from "@/App"
import { SettingsPage } from "@/pages/SettingsPage"

import { CalEventsProvider } from "./contexts/CalEventsContext"

const params = new URLSearchParams(window.location.search)
const view = params.get("view")

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CalendarStateProvider>
      {view === "settings" ? (
        <SettingsPage />
      ) : (
        <CalEventsProvider>
          <EventDraftProvider>
            <App />
            <Toaster />
          </EventDraftProvider>
        </CalEventsProvider>
      )}
    </CalendarStateProvider>
  </React.StrictMode>,
)
