// Global styles first, then the built-in themes (whose [data-theme] rules must
// win over the :root defaults declared in global.css).
import { listen } from "@tauri-apps/api/event"
import React from "react"
import ReactDOM from "react-dom/client"

import "@/global.css"
import "virtual:rencal-themes.css"

import { SYSTEM_TZ_CHANGED } from "@/rpc/events"

import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { SettingsProvider } from "@/contexts/SettingsContext"

import { setViewerTzid } from "@/lib/event-time"
import { preloadCalendarData } from "@/lib/preload-data"

import { ThemeProvider } from "@/themes/ThemeRegistry"
import { AppWindow } from "@/windows/AppWindow"
import { SettingsWindow } from "@/windows/SettingsWindow"

const params = new URLSearchParams(window.location.search)
const appWindow = params.get("appWindow")

// Keep the viewer's zone in sync with the OS: the Rust watcher emits the new
// IANA tzid when /etc/localtime changes, and the viewer-zone store fans it out.
void listen<string>(SYSTEM_TZ_CHANGED, (event) => setViewerTzid(event.payload))

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
