// Global styles first, then the built-in themes (whose [data-theme] rules must
// win over the :root defaults declared in global.css).
import React from "react"
import ReactDOM from "react-dom/client"

import "@/global.css"
import "virtual:rencal-themes.css"

import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { SettingsProvider } from "@/contexts/SettingsContext"

import { preloadCalendarData } from "@/lib/preload-data"

import { ThemeProvider } from "@/themes/ThemeRegistry"
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
      <ThemeProvider>
        <SettingsProvider>
          <CalendarStateProvider
            initialCalendars={preload.initialCalendars}
            initialDate={preload.initialDate}
          >
            {appWindow === "settings" ? <SettingsWindow /> : <AppWindow preload={preload} />}
          </CalendarStateProvider>
        </SettingsProvider>
      </ThemeProvider>
    </React.StrictMode>,
  )
}

void bootstrap()
