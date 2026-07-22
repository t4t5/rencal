// Global styles first, then the built-in themes (whose [data-theme] rules must
// win over the :root defaults declared in global.css).
import React, { ReactNode, useEffect, useState } from "react"
import ReactDOM from "react-dom/client"

import "@/global.css"
import "virtual:rencal-themes.css"

import { DataDirGate } from "@/components/setup/DataDirGate"

import { CalendarStateProvider } from "@/contexts/CalendarStateContext"
import { SettingsProvider } from "@/contexts/SettingsContext"

import { Preload, preloadCalendarData } from "@/lib/preload-data"

import { ThemeProvider } from "@/themes/ThemeRegistry"
import { AppWindow } from "@/windows/AppWindow"
import { SettingsWindow } from "@/windows/SettingsWindow"

const params = new URLSearchParams(window.location.search)
const appWindow = params.get("appWindow")

async function bootstrap() {
  const rootEl = document.getElementById("root")

  if (!rootEl) return null

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ThemeProvider>
        {appWindow === "settings" ? (
          <AppProviders>
            <SettingsWindow />
          </AppProviders>
        ) : (
          <DataDirGate>
            <MainWindowRoot />
          </DataDirGate>
        )}
      </ThemeProvider>
    </React.StrictMode>,
  )
}

function MainWindowRoot() {
  const [preload, setPreload] = useState<Preload | null>(null)

  useEffect(() => {
    void preloadCalendarData().then(setPreload)
  }, [])

  if (!preload) return null

  return (
    <AppProviders preload={preload}>
      <AppWindow preload={preload} />
    </AppProviders>
  )
}

function AppProviders({ children, preload = {} }: { children: ReactNode; preload?: Preload }) {
  return (
    <SettingsProvider>
      <CalendarStateProvider
        initialCalendars={preload.initialCalendars}
        initialDate={preload.initialDate}
      >
        {children}
      </CalendarStateProvider>
    </SettingsProvider>
  )
}

void bootstrap()
