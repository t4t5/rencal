import {
  type MutableRefObject,
  ReactNode,
  createContext,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react"

import { rpc } from "@/rpc"

import {
  type CalendarEvent,
  type Recurrence,
  recurrenceToRpc,
  rpcToCalendarEvent,
} from "@/lib/cal-events"
import {
  addMinutes,
  computeEventDateInfo,
  DEFAULT_DURATION_MINS,
  nowZoned,
  type EventTime,
} from "@/lib/event-time"
import { toRpcEventTime } from "@/lib/event-time/rpc"
import { logger } from "@/lib/logger"
import { parseEventText } from "@/lib/magic-parser"

import { useCalEvents } from "./CalEventsContext"
import { useCalendars } from "./CalendarStateContext"
import { useSettings } from "./SettingsContext"
import { useSync } from "./SyncContext"

interface DraftEvent {
  summary: string
  description: string | null
  start: EventTime
  end: EventTime
  calendarId: string | null
  location: string | null
  recurrence: Recurrence | null
}

interface EventTextContextType {
  text: string
  setText: (text: string) => void
}

type BeforeCreateHandler = (start: EventTime) => void

interface EventDraftContextType {
  isDrafting: boolean
  setIsDrafting: (isDrafting: boolean) => void

  draftPopoverOpen: boolean
  setDraftPopoverOpen: (open: boolean) => void

  defaultCalendarId: string | null

  draftEvent: DraftEvent
  setDraftEvent: (event: DraftEvent) => void

  draftReminders: number[]
  setDraftReminders: (reminders: number[]) => void

  setDefaultDraftEvent: () => void
  createDraftEvent: () => Promise<void>

  /** Fires synchronously at the very start of `createDraftEvent`, before any state resets. */
  beforeCreateHandlerRef: MutableRefObject<BeforeCreateHandler | null>
}

const EventTextContext = createContext({} as EventTextContextType)
const EventDraftContext = createContext({} as EventDraftContextType)

export function useEventText() {
  return useContext(EventTextContext)
}

export function useEventDraft() {
  return useContext(EventDraftContext)
}

/** ZonedDateTime in viewer's local zone, rounded up to the next whole hour. */
function getClosestNextHour(): EventTime {
  const now = nowZoned()
  // Add 1 hour, then round down to the start of that hour.
  const advanced = addMinutes(now, 60)
  if (advanced.kind !== "datetime_zoned") return advanced
  const z = advanced.value.with({
    minute: 0,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  })
  return { kind: "datetime_zoned", value: z }
}

export function EventDraftProvider({ children }: { children: ReactNode }) {
  const { calendars } = useCalendars()
  const { defaultCalendar, defaultReminders } = useSettings()
  const [isDrafting, setIsDrafting] = useState(false)
  const [draftPopoverOpen, _setDraftPopoverOpen] = useState(false)

  const defaultCalendarId =
    (defaultCalendar && calendars.some((c) => c.slug === defaultCalendar)
      ? defaultCalendar
      : calendars[0]?.slug) ?? null

  const [text, _setText] = useState("")
  const [draftReminders, setDraftReminders] = useState<number[]>([])
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasParsedTimeRef = useRef(false)

  const generateDefaultDraftEvent = useCallback((): DraftEvent => {
    const start = getClosestNextHour()
    return {
      summary: "",
      description: null,
      start,
      end: addMinutes(start, DEFAULT_DURATION_MINS),
      calendarId: defaultCalendarId,
      location: null,
      recurrence: null,
    }
  }, [defaultCalendarId])

  const [draftEvent, setDraftEvent] = useState<DraftEvent>(generateDefaultDraftEvent())

  const setText = useCallback((newText: string) => {
    _setText(newText)

    if (!hasParsedTimeRef.current) {
      startTransition(() => {
        setDraftEvent((prev) => ({ ...prev, summary: newText }))
      })
    }

    if (parseTimerRef.current) clearTimeout(parseTimerRef.current)

    parseTimerRef.current = setTimeout(() => {
      const parsed = parseEventText(newText)

      hasParsedTimeRef.current =
        parsed.start !== null || parsed.recurrence !== null || parsed.location !== null

      startTransition(() => {
        setDraftEvent((prev) => {
          const updates: Partial<DraftEvent> = {
            summary: parsed.summary,
            recurrence: parsed.recurrence,
            location: parsed.location,
          }
          if (parsed.start) {
            updates.start = parsed.start
            updates.end = parsed.end ?? addMinutes(parsed.start, DEFAULT_DURATION_MINS)
          }
          return { ...prev, ...updates }
        })
      })
    }, 300)
  }, [])

  const setDefaultDraftEvent = useCallback(() => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current)
    hasParsedTimeRef.current = false
    setDraftEvent(generateDefaultDraftEvent())
    setDraftReminders(defaultReminders)
  }, [generateDefaultDraftEvent, defaultReminders])

  const setDraftPopoverOpen = useCallback(
    (open: boolean) => {
      _setDraftPopoverOpen(open)
      if (open) setDraftReminders(defaultReminders)
      else setDefaultDraftEvent()
    },
    [setDefaultDraftEvent, defaultReminders],
  )

  const { setCalendarEvents } = useCalEvents()
  const { sync } = useSync()

  const beforeCreateHandlerRef = useRef<BeforeCreateHandler | null>(null)

  const createDraftEvent = useCallback(async () => {
    if (!draftEvent.calendarId) return

    beforeCreateHandlerRef.current?.(draftEvent.start)

    const optimisticId = crypto.randomUUID()

    const optimisticEvent: CalendarEvent = {
      id: optimisticId,
      recurring_event_id: null,
      summary: draftEvent.summary ?? "",
      description: draftEvent.description,
      location: draftEvent.location ?? null,
      start: draftEvent.start,
      end: draftEvent.end,
      dateInfo: computeEventDateInfo(draftEvent.start, draftEvent.end),
      status: "confirmed",
      recurrence: draftEvent.recurrence,
      master_recurrence: null,
      reminders: draftReminders,
      organizer: null,
      attendees: [],
      conference_url: null,
      calendar_slug: draftEvent.calendarId,
      color: null,
      updated: null,
    }
    setCalendarEvents((prev) => [...prev, optimisticEvent])

    logger.info("Create event:", draftEvent)
    setDefaultDraftEvent()
    _setText("")

    const created = await rpc.caldir.create_event({
      calendar_slug: draftEvent.calendarId,
      summary: draftEvent.summary ?? "",
      description: draftEvent.description,
      location: draftEvent.location ?? null,
      start: toRpcEventTime(draftEvent.start),
      end: toRpcEventTime(draftEvent.end),
      recurrence: draftEvent.recurrence ? recurrenceToRpc(draftEvent.recurrence) : null,
      reminders: draftReminders,
    })

    setCalendarEvents((prev) =>
      prev.map((e) => (e.id === optimisticId ? rpcToCalendarEvent(created) : e)),
    )
    void sync()
  }, [draftEvent, draftReminders, sync, setDefaultDraftEvent, setCalendarEvents])

  const textValue = useMemo<EventTextContextType>(() => ({ text, setText }), [text, setText])

  const draftValue = useMemo<EventDraftContextType>(
    () => ({
      isDrafting,
      setIsDrafting,
      draftPopoverOpen,
      setDraftPopoverOpen,
      defaultCalendarId,
      draftEvent,
      setDraftEvent,
      draftReminders,
      setDraftReminders,
      setDefaultDraftEvent,
      createDraftEvent,
      beforeCreateHandlerRef,
    }),
    [
      isDrafting,
      draftPopoverOpen,
      defaultCalendarId,
      draftEvent,
      draftReminders,
      setDefaultDraftEvent,
      setDraftPopoverOpen,
      createDraftEvent,
    ],
  )

  return (
    <EventTextContext.Provider value={textValue}>
      <EventDraftContext.Provider value={draftValue}>{children}</EventDraftContext.Provider>
    </EventTextContext.Provider>
  )
}
