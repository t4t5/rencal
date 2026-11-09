/*
 * The event being composed: from the sidebar's natural-language input or in the
 * new-event popover. Views show it through `draftEvent()` while `isDrafting()`
 * or `draftPopoverOpen()`. To open the popover from a view:
 *
 *   await anchorPopover(cellRef, press)    // stores/popover.ts
 *   openDraftPopover({ start, end })
 */
import { batch, computed, LayoutAnimation, signal, untracked } from "nsh"

import { api, getErrorMessage } from "@/lib/api"
import {
  type CalendarEvent,
  type EventAttendee,
  reconcileOptimisticCreate,
  type Recurrence,
  rollbackOptimisticCreate,
} from "@/lib/cal-events"
import type { EventConference } from "@/lib/conference"
import {
  addMinutes,
  computeEventDateInfo,
  DEFAULT_DURATION_MINS,
  type EventTime,
  nowZoned,
} from "@/lib/event-time"
import { logger } from "@/lib/logger"
import { parseEventText } from "@/lib/magic-parser"
import { toast } from "@/lib/toast"

import { calendars } from "@/stores/calendar"
import { reloadEvents, setActiveEventKey, setCalendarEvents, activeEvent } from "@/stores/events"
import { defaultCalendar, defaultReminders } from "@/stores/settings"
import { requestSync } from "@/stores/sync"

export interface DraftEvent {
  summary: string
  description: string | null
  start: EventTime
  end: EventTime
  calendarId: string | null
  location: string | null
  url: string | null
  recurrence: Recurrence | null
  attendees: EventAttendee[]
  conference: EventConference | null
  color: string | null
}

const PARSE_DELAY_MS = 300

/** Now in the viewer's zone, rounded up to the next whole hour. */
function closestNextHour(): EventTime {
  const advanced = addMinutes(nowZoned(), 60)
  if (advanced.kind !== "datetime_zoned") return advanced
  return {
    kind: "datetime_zoned",
    value: advanced.value.with({
      minute: 0,
      second: 0,
      millisecond: 0,
    }),
  }
}

export const defaultCalendarId = computed(() => {
  const editable = calendars().filter((calendar) => !calendar.read_only)
  return (
    editable.find((calendar) => calendar.slug === defaultCalendar())?.slug ??
    editable[0]?.slug ??
    null
  )
})

function emptyDraft(): DraftEvent {
  const start = closestNextHour()
  return {
    summary: "",
    description: null,
    start,
    end: addMinutes(start, DEFAULT_DURATION_MINS),
    calendarId: untracked(defaultCalendarId),
    location: null,
    url: null,
    recurrence: null,
    attendees: [],
    conference: null,
    color: null,
  }
}

const drafting = signal(false)
const popoverOpen = signal(false)
const draft = signal<DraftEvent>(emptyDraft())
const reminders = signal<number[]>([])
const typed = signal("")
const held = signal<{ event: DraftEvent; reminders: number[] } | null>(null)

export const isDrafting = () => drafting()
export const draftPopoverOpen = () => popoverOpen()
export const draftEvent = () => held()?.event ?? draft()
export const draftReminders = () => held()?.reminders ?? reminders()
export const draftText = () => typed()

/** Keeps showing this draft after it's been created, for the fly animation. */
export const holdDraft = () =>
  held.set({ event: untracked(draft), reminders: untracked(reminders) })
export const releaseDraft = () => held.set(null)

export const setDraftEvent = (next: DraftEvent) => draft.set(next)
export const setDraftReminders = (next: number[]) => reminders.set(next)
export const updateDraft = (change: Partial<DraftEvent>) =>
  draft.update((current) => ({ ...current, ...change }))

let parseTimer: ReturnType<typeof setTimeout> | undefined
let hasParsedTime = false

export function setDraftText(text: string) {
  typed.set(text)
  if (!hasParsedTime) updateDraft({ summary: text })

  clearTimeout(parseTimer)
  parseTimer = setTimeout(() => {
    const parsed = parseEventText(text)
    hasParsedTime = parsed.start !== null || parsed.recurrence !== null || parsed.location !== null
    updateDraft({
      summary: parsed.summary,
      recurrence: parsed.recurrence,
      location: parsed.location,
      ...(parsed.start && {
        start: parsed.start,
        end: parsed.end ?? addMinutes(parsed.start, DEFAULT_DURATION_MINS),
      }),
    })
  }, PARSE_DELAY_MS)
}

export function resetDraft() {
  clearTimeout(parseTimer)
  hasParsedTime = false
  batch(() => {
    draft.set(emptyDraft())
    reminders.set(untracked(defaultReminders))
  })
}

/** The "+" growing into the input and back. */
export const COMPOSE_ANIMATION = LayoutAnimation.create(200, "easeOut", "opacity")

/** Starts composing in the sidebar, the "+" growing into the input. */
export function startDrafting() {
  if (!untracked(canCreate)) {
    promptToConnect()
    return
  }
  LayoutAnimation.configureNext(COMPOSE_ANIMATION)
  resetDraft()
  drafting.set(true)
}

export function stopDrafting() {
  drafting.set(false)
}

/** Opens the new-event popover; only one of it and the edit popover shows. */
export function openDraftPopover(change: Partial<DraftEvent> = {}, withReminders?: number[]) {
  if (!untracked(canCreate)) {
    promptToConnect()
    return
  }
  batch(() => {
    if (untracked(activeEvent)) setActiveEventKey(null)
    drafting.set(false)
    draft.set({ ...emptyDraft(), ...change })
    reminders.set(withReminders ?? untracked(defaultReminders))
    popoverOpen.set(true)
  })
}

export function closeDraftPopover() {
  popoverOpen.set(false)
  resetDraft()
}

export async function createDraftEvent() {
  const event = untracked(draft)
  const eventReminders = untracked(reminders)
  const calendarSlug = event.calendarId
  if (!calendarSlug) return

  const optimistic: CalendarEvent = {
    id: crypto.randomUUID(),
    recurring_event_id: null,
    summary: event.summary,
    description: event.description,
    location: event.location,
    url: event.url,
    start: event.start,
    end: event.end,
    dateInfo: computeEventDateInfo(event.start, event.end),
    status: "confirmed",
    availability: "busy",
    recurrence: event.recurrence,
    master_recurrence: null,
    reminders: eventReminders,
    organizer: null,
    attendees: event.attendees,
    conference: event.conference,
    calendar_slug: calendarSlug,
    color: event.color,
    updated: null,
  }
  setCalendarEvents((events) => [...events, optimistic])

  logger.info("Create event:", event)
  resetDraft()
  typed.set("")

  let created: CalendarEvent
  try {
    created = await api.events.create({
      calendar_slug: calendarSlug,
      summary: event.summary,
      description: event.description,
      location: event.location,
      url: event.url,
      start: event.start,
      end: event.end,
      recurrence: event.recurrence,
      reminders: eventReminders,
      attendees: event.attendees,
      conference: event.conference,
      color: event.color,
    })
  } catch (error) {
    setCalendarEvents((events) => rollbackOptimisticCreate(events, optimistic))
    toast.error("Failed to create event", {
      description: getErrorMessage(error, "Failed to create event"),
    })
    console.error("create_event failed:", error)
    return
  }

  // create_event returns only the master VEVENT; refetch to expand the instances.
  if (event.recurrence) await reloadEvents()
  else setCalendarEvents((events) => reconcileOptimisticCreate(events, optimistic, created))
  void requestSync()
}

export const canCreate = computed(() => calendars().some((calendar) => !calendar.read_only))

const connectPrompt = signal(false)

export const connectPromptOpen = () => connectPrompt()
export const closeConnectPrompt = () => connectPrompt.set(false)

/** No writable calendar: ask the user to connect one. */
export const promptToConnect = () => connectPrompt.set(true)
