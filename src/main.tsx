import React from "react"
import ReactDOM from "react-dom/client"

import { AuthProvider } from "@/contexts/AuthContext"
import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { EventDraftProvider } from "@/contexts/EventDraftContext"

import App from "@/App"

import { CalEventsProvider } from "./contexts/CalEventsContext"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <CalendarStateProvider>
        <CalEventsProvider>
          <EventDraftProvider>
            <App />
          </EventDraftProvider>
        </CalEventsProvider>
      </CalendarStateProvider>
    </AuthProvider>
  </React.StrictMode>,
)
