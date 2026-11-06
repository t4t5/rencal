/*
 * The sidebar's agenda: its rows, the keyboard's selected row, and the ghost
 * section for a day with no events. `Agenda.tsx` owns the list; everything else
 * that moves it comes through here.
 */
import { Temporal } from "@js-temporal/polyfill"
import { computed, signal, untracked, type ViewRef } from "nsh"

import {
  type AgendaItem,
  agendaItems,
  type AgendaRow,
  buildAgendaRows,
  keepUnchangedRows,
  rowIndexOf,
  stepAgendaItem,
} from "@/lib/agenda"
import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { draftToCalendarEvent } from "@/lib/draft-to-event"
import { dateInViewerZone, epochDay, plainDateFromEpochDay } from "@/lib/event-time"

import { activeDate, navigateToDate, setActiveDate } from "@/stores/calendar"
import { draftEvent, draftPopoverOpen, draftText, isDrafting } from "@/stores/draft"
import {
  agendaEvents,
  calendarEvents,
  eventsSettled,
  setActiveEventKey,
  setCalendarEvents,
} from "@/stores/events"
import { anchorPopover } from "@/stores/popover"

const ghost = signal<number | null>(null)
const selection = signal<AgendaItem | null>(null)

/** The event being composed, as the agenda and the views show it. */
export const draftCalEvent = computed(() => {
  if (draftPopoverOpen() || (isDrafting() && draftText())) {
    return draftToCalendarEvent(draftEvent())
  }
  return null
})

const listedEvents = computed(() => {
  const draft = draftCalEvent()
  return draft ? [...agendaEvents(), draft] : agendaEvents()
})

export const agendaHasEvents = () => listedEvents().length > 0

export const agendaRows = computed<AgendaRow[]>((previous) =>
  keepUnchangedRows(previous ?? [], buildAgendaRows(listedEvents(), ghost())),
)

export const stickyRows = computed(() =>
  agendaRows().flatMap((row, index) => (row.kind === "header" ? [index] : [])),
)

const items = computed(() => agendaItems(agendaRows()))

export const ghostDay = () => ghost()
export const showGhost = (date: Temporal.PlainDate) => ghost.set(epochDay(date))
export const clearGhost = () => ghost.set(null)

export const selectedItem = () => selection()
export const clearAgendaSelection = () => selection.set(null)

// A press selects a row only for as long as its event is open; the keyboard's stays.
let pressed = false
export const wasPressed = () => pressed

export function selectAgendaItem(item: AgendaItem, by: "press" | "keyboard" = "keyboard") {
  pressed = by === "press"
  selection.set(item)
  setActiveDate(plainDateFromEpochDay(item.day))
}

// The views of the rows on screen, by event and day: what a popover opens against.
const rowViews = new Map<string, () => ViewRef | undefined>()
const rowViewKey = (item: Pick<AgendaItem, "key" | "day">) => `${item.day}:${item.key}`

/** Called by a cell for the item it shows; returns how to stop. */
export function registerRowView(
  item: Pick<AgendaItem, "key" | "day">,
  view: () => ViewRef | undefined,
) {
  const key = rowViewKey(item)
  rowViews.set(key, view)
  return () => {
    // A cell that took the item over has registered already.
    if (rowViews.get(key) === view) rowViews.delete(key)
  }
}

/** Opens the item's event against its row, or in the window's middle if it's off screen. */
export async function openAgendaItem(item: AgendaItem) {
  await anchorPopover(rowViews.get(rowViewKey(item))?.())
  setActiveEventKey(item.key)
}

/** The selected event, if it's loaded. */
export const selectedEvent = (): CalendarEvent | null => {
  const key = selection()?.key
  return key ? (calendarEvents().find((event) => eventKey(event) === key) ?? null) : null
}

type RevealListener = (index: number, direction: 1 | -1 | 0) => void
let revealRow: RevealListener = () => {}

/** How the mounted agenda scrolls a row into view; returns how to stop. */
export function onRevealRow(listener: RevealListener) {
  revealRow = listener
  return () => {
    revealRow = () => {}
  }
}

export function stepAgendaSelection(delta: 1 | -1) {
  const next = stepAgendaItem(
    untracked(items),
    untracked(selection),
    delta,
    epochDay(untracked(activeDate)),
  )
  if (!next) return
  selectAgendaItem(next)
  revealRow(rowIndexOf(untracked(agendaRows), next), delta)
}

const addIfMissing = (events: CalendarEvent[], target: CalendarEvent) => {
  const key = eventKey(target)
  return events.some((event) => eventKey(event) === key) ? events : [...events, target]
}

/** Goes to `event`, loading its day first, and opens it. */
export async function jumpToEvent(event: CalendarEvent) {
  const date = dateInViewerZone(event.start)
  navigateToDate(date)
  await eventsSettled()
  setCalendarEvents((events) => addIfMissing(events, event))

  const day = epochDay(date)
  const key = eventKey(event)
  const candidates = untracked(items).filter((item) => item.day === day)
  // A recurring master stands for its occurrences, which carry its key as a prefix.
  const item =
    candidates.find((candidate) => candidate.key === key) ??
    (event.recurrence ? candidates.find((c) => c.key.startsWith(`${key}__`)) : undefined)
  if (!item) return
  revealRow(rowIndexOf(untracked(agendaRows), item), 0)
  await new Promise(requestAnimationFrame)
  await openAgendaItem(item)
}
