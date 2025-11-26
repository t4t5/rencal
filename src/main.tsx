import React from "react"
import ReactDOM from "react-dom/client"

import { AuthProvider } from "@/contexts/AuthContext"
import { CalendarStateProvider } from "@/contexts/CalendarStateContext"

import App from "@/App"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <CalendarStateProvider>
        <App />
      </CalendarStateProvider>
    </AuthProvider>
  </React.StrictMode>,
)
