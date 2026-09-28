// Global styles first, then the built-in themes (whose [data-theme] rules must
// win over the :root defaults declared in global.css).
import React from "react"
import ReactDOM from "react-dom/client"

import "@/global.css"
import "virtual:rencal-themes.css"

import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { SettingsProvider } from "@/contexts/SettingsContext"

import { api } from "@/lib/api"
import { setViewerTzid } from "@/lib/event-time"
import { type Preload, preloadCalendarData } from "@/lib/preload-data"

import { preloadExternalThemes, ThemeProvider } from "@/themes/ThemeRegistry"
import { AppWindow } from "@/windows/AppWindow"
import { SettingsWindow } from "@/windows/SettingsWindow"

const params = new URLSearchParams(window.location.search)
const appWindow = params.get("appWindow")

// Keep the viewer's zone in sync with the OS: the Rust watcher emits the new
// IANA tzid when /etc/localtime changes, and the viewer-zone store fans it out.
void api.notifications.listen("system-tz-changed", (event) => setViewerTzid(event))

async function bootstrap() {
  const [preload, externalThemes] = await Promise.all([
    appWindow === "settings" ? Promise.resolve<Preload>({}) : preloadCalendarData(),
    preloadExternalThemes(),
  ])

  const rootEl = document.getElementById("root")

  if (!rootEl) return null

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      {/* Theme, Settings, and CalendarState are shared by both windows. */}
      {/* The app-only provider chain continues in AppProviders. */}
      <ThemeProvider initialExternalThemes={externalThemes}>
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
