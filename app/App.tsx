import { mount, signal, Text, View } from "nsh"

import { Overlays } from "@/components/Overlays"
import { dropFiles, startIcsImport } from "@/components/ics-import/ics-import"
import { Main } from "@/components/main/Main"
import { GlobalShortcuts } from "@/components/shortcuts/GlobalShortcuts"
import { Sidebar } from "@/components/sidebar/Sidebar"

import { loadLocalStorage } from "@/lib/local-storage"

import { loadCalendars } from "@/stores/calendar"
import { startClock } from "@/stores/clock"
import { startDeepLinks } from "@/stores/deep-links"
import { startEventStore } from "@/stores/events"
import { loadSettings } from "@/stores/settings"
import { startSync } from "@/stores/sync"
import { isWideWindow, loadViewState } from "@/stores/view"
import { startWindow } from "@/stores/window"
import { startThemes } from "@/themes/controller"

import "./fonts/GeistMono-Regular.ttf"

const ready = signal(false)
const failure = signal<string | null>(null)

async function start() {
  await loadLocalStorage()
  loadViewState()
  await loadSettings()
  await loadCalendars()
  await startThemes()
  startEventStore()
  startSync()
  startIcsImport()
  ready.set(true)
  startDeepLinks()
}

function App() {
  startClock()
  startWindow()
  start().catch((error: unknown) => failure.set(String(error)))
  return (
    <View class="flex-1 flex-row bg-background text-foreground" onFileDrop={dropFiles}>
      <If when={failure()}>
        <Text class="text-destructive p-4">{failure()}</Text>
      </If>
      <View class="absolute top-0 left-0 right-0 h-4" desktop={{ windowDrag: true }} />
      <If when={ready()}>
        <Sidebar />
        <If when={isWideWindow()}>
          <Main />
        </If>
        <Overlays />
        <GlobalShortcuts />
      </If>
    </View>
  )
}

mount(App)
