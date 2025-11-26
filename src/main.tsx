import React from "react"
import ReactDOM from "react-dom/client"

import App from "@/App"
import { AuthProvider } from "@/contexts/AuthContext"
import { CalendarProvider } from "@/contexts/CalendarContext"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <CalendarProvider>
        <App />
      </CalendarProvider>
    </AuthProvider>
  </React.StrictMode>,
)
