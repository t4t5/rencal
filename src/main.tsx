import React from "react"
import ReactDOM from "react-dom/client"

import App from "@/App"
import { AuthProvider } from "@/contexts/AuthContext"
import { CalendarProvider } from "@/contexts/CalendarContext"
import { StorageProvider } from "@/contexts/StorageContext"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StorageProvider>
      <AuthProvider>
        <CalendarProvider>
          <App />
        </CalendarProvider>
      </AuthProvider>
    </StorageProvider>
  </React.StrictMode>,
)
