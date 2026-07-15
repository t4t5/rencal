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
import { IcsPreviewWindow } from "@/windows/IcsPreviewWindow"
import { SettingsWindow } from "@/windows/SettingsWindow"

const params = new URLSearchParams(window.location.search)
const appWindow = params.get("appWindow")
const icsFilePath = params.get("file")

function windowContent(preload: Awaited<ReturnType<typeof preloadCalendarData>>) {
  if (appWindow === "settings") return <SettingsWindow />
  if (appWindow === "icsPreview" && icsFilePath) return <IcsPreviewWindow filePath={icsFilePath} />
  return <AppWindow preload={preload} />
}

async function bootstrap() {
  const isMainWindow = appWindow !== "settings" && appWindow !== "icsPreview"
  const preload = isMainWindow ? await preloadCalendarData() : {}

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
            {windowContent(preload)}
          </CalendarStateProvider>
        </SettingsProvider>
      </ThemeProvider>
    </React.StrictMode>,
  )
}

void bootstrap()
