import React from "react"
import ReactDOM from "react-dom/client"

import { AuthProvider } from "@/contexts/AuthContext"
import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { EventComposerProvider } from "@/contexts/EventComposerContext"

import App from "@/App"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <CalendarStateProvider>
        <EventComposerProvider>
          <App />
        </EventComposerProvider>
      </CalendarStateProvider>
    </AuthProvider>
  </React.StrictMode>,
)
