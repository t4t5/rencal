import React from "react"
import ReactDOM from "react-dom/client"

import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { SettingsProvider } from "@/contexts/SettingsContext"

import { preloadCalendarData } from "@/lib/preload-data"

import { AppWindow } from "@/windows/AppWindow"
import { SettingsWindow } from "@/windows/SettingsWindow"

const params = new URLSearchParams(window.location.search)
const appWindow = params.get("appWindow")

async function bootstrap() {
  const preload = appWindow === "settings" ? {} : await preloadCalendarData()

  const rootEl = document.getElementById("root")

  if (!rootEl) return null

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <SettingsProvider>
        <CalendarStateProvider
          initialCalendars={preload.initialCalendars}
          initialDate={preload.initialDate}
        >
          {appWindow === "settings" ? <SettingsWindow /> : <AppWindow preload={preload} />}
        </CalendarStateProvider>
      </SettingsProvider>
    </React.StrictMode>,
  )
}

void bootstrap()
