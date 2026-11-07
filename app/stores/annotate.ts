/*
 * Annotate mode, for development: pins with notes on the window, saved with a
 * screenshot as Markdown for an agent to read. `RENCAL_ANNOTATE` turns it on
 * and says where the notes go (`native/src/annotate.rs`).
 */
import { signal, windowSize } from "nsh"
import { Backend } from "rencal/native"

import type { CalendarEvent } from "@/lib/cal-events"
import { dayAt } from "@/lib/day-hits"
import {
  epochDay,
  formatLongDate,
  formatWallclockTime,
  isAllDay,
  toViewerZonedDateTime,
} from "@/lib/event-time"
import { measureRegions, type Region, regionsAt } from "@/lib/inspect"
import { toast } from "@/lib/toast"

import { activeDate } from "@/stores/calendar"
import { paletteOpen, searchOpen, shortcutsOpen } from "@/stores/commands"
import { draftPopoverOpen } from "@/stores/draft"
import { activeEvent, calendarEvents } from "@/stores/events"
import { timeFormat } from "@/stores/settings"
import { calendarView, settingsOpen, settingsTab, sidebarCollapsed } from "@/stores/view"
import { activeAppearance } from "@/themes"
import { activeTheme } from "@/themes/controller"

export type Pin = { id: number; x: number; y: number; note: string; context: string[] }

export const annotateEnabled = Backend.annotateEnabled()

const active = signal(false)
const pinList = signal<Pin[]>([])
const editing = signal<number | null>(null)
const saving = signal(false)
let regions: Region[] = []
let nextId = 1

export const annotating = () => active()
export const pins = () => pinList()
export const editingPin = () => pinList().find((pin) => pin.id === editing()) ?? null
export const annotateSaving = () => saving()

async function startAnnotate() {
  regions = await measureRegions()
  active.set(true)
}

export function stopAnnotate() {
  active.set(false)
  editing.set(null)
  pinList.set([])
}

export function addPin(x: number, y: number) {
  const id = nextId++
  pinList.set([...pinList(), { id, x, y, note: "", context: describePoint(x, y) }])
  editing.set(id)
}

export const editPin = (id: number) => editing.set(id)

/** Keeps the note, or drops the pin when it has none. */
export function finishPin(id: number, note: string) {
  const text = note.trim()
  pinList.set(
    text
      ? pinList().map((pin) => (pin.id === id ? { ...pin, note: text } : pin))
      : pinList().filter((pin) => pin.id !== id),
  )
  editing.set(null)
}

/** Closes the editor without changing the note; a new pin goes. */
export function cancelEdit() {
  const pin = editingPin()
  if (pin) finishPin(pin.id, pin.note)
}

/** Esc: the editor first, then the mode, unless notes would be lost. */
export function escapeAnnotate() {
  if (editing() !== null) return cancelEdit()
  if (pinList().length === 0) stopAnnotate()
}

/** The annotate key: starts, or saves the notes and stops. */
export function annotateKey() {
  if (!active()) return void startAnnotate()
  if (pinList().some((pin) => pin.note)) return void saveAnnotations()
  stopAnnotate()
}

export const regionsUnder = (x: number, y: number) => regionsAt(regions, x, y)

export async function saveAnnotations() {
  const list = pinList().filter((pin) => pin.note)
  if (list.length === 0 || saving()) return
  saving.set(true)
  editing.set(null)
  // Let the editor go before the screenshot.
  await new Promise((resolve) => setTimeout(resolve, 150))
  try {
    const path = await Backend.saveAnnotations(toMarkdown(list))
    toast.success("Notes saved", { description: path })
    stopAnnotate()
  } catch (error) {
    toast.error("Couldn’t save notes", { description: String(error) })
  } finally {
    saving.set(false)
  }
}

const label = (event: CalendarEvent) => `"${event.summary || "Untitled"}"`

function minuteOf(event: CalendarEvent, day: number, edge: "start" | "end") {
  if (edge === "start" && event.dateInfo.firstDay < day) return 0
  if (edge === "end" && event.dateInfo.lastDay > day) return 24 * 60
  const time = toViewerZonedDateTime(event[edge])
  return time.hour * 60 + time.minute
}

/** What lies under a window point: regions, then the day, time and events there. */
function describePoint(x: number, y: number): string[] {
  const lines = regionsUnder(x, y).map((region) => `${region.name} (\`${region.source}\`)`)
  const area = dayAt(x, y)
  if (!area) return lines

  const day = epochDay(area.day)
  const onDay = calendarEvents().filter(
    (event) => event.dateInfo.firstDay <= day && day <= event.dateInfo.lastDay,
  )
  if (area.zone === "timed") {
    const fraction = (y - area.rect.y) / area.rect.height
    const minute = Math.max(0, Math.min(24 * 60 - 1, Math.round((fraction * 24 * 60) / 5) * 5))
    const time = formatWallclockTime(Math.floor(minute / 60), minute % 60, timeFormat())
    lines.push(`${formatLongDate(area.day)} at ${time} (timed column)`)
    const under = onDay.filter(
      (event) =>
        !isAllDay(event.start) &&
        minuteOf(event, day, "start") <= minute &&
        minute < minuteOf(event, day, "end"),
    )
    if (under.length) lines.push(`Event: ${under.map(label).join(", ")}`)
  } else {
    lines.push(`${formatLongDate(area.day)} (${area.zone === "day" ? "day cell" : "all-day lane"})`)
    const shown = area.zone === "all-day" ? onDay.filter((e) => isAllDay(e.start)) : onDay
    if (shown.length) lines.push(`Events that day: ${shown.slice(0, 6).map(label).join(", ")}`)
  }
  return lines
}

function appState(): string[] {
  const size = windowSize()
  const open = [
    settingsOpen() && `Settings (${settingsTab()} tab)`,
    activeEvent() && `event ${label(activeEvent() as CalendarEvent)}`,
    draftPopoverOpen() && "new event popover",
    searchOpen() && "search",
    paletteOpen() && "command palette",
    shortcutsOpen() && "shortcuts sheet",
  ].filter(Boolean)
  return [
    `View: ${calendarView()}, on ${activeDate().toString()}`,
    `Window: ${Math.round(size.width)}×${Math.round(size.height)}${sidebarCollapsed() ? ", sidebar collapsed" : ""}`,
    `Theme: ${activeTheme()} (${activeAppearance()})`,
    `Open: ${open.length ? open.join(", ") : "nothing"}`,
  ]
}

function toMarkdown(list: Pin[]): string {
  const notes = list.map((pin, index) =>
    [
      `### ${index + 1}. ${pin.note}`,
      "",
      `- At (${Math.round(pin.x)}, ${Math.round(pin.y)})`,
      ...pin.context.map((line) => `- ${line}`),
    ].join("\n"),
  )
  return [
    "## App state",
    "",
    ...appState().map((line) => `- ${line}`),
    "",
    "## Notes",
    "",
    "Numbers match the pins in the screenshot. Points are in window coordinates.",
    "",
    notes.join("\n\n"),
    "",
  ].join("\n")
}
