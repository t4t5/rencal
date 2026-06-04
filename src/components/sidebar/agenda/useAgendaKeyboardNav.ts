import { RefObject, useEffect, useRef } from "react"

import { useAgendaFocused, useAgendaSelection } from "@/contexts/AgendaFocusContext"
import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { setEventAnchor } from "@/lib/event-anchor"
import { formatDateKey, isAllDay } from "@/lib/event-time"

// GlobalShortcuts focuses the agenda by id from its Tab handler.
export const AGENDA_EL_ID = "agenda-scroll-container"

// Vertical keys move the selection: up/k = previous, down/j = next.
const PREV_KEYS = new Set(["ArrowUp", "k"])
const NEXT_KEYS = new Set(["ArrowDown", "j"])

// Horizontal keys (and Tab) exit keyboard mode, back to day navigation.
const EXIT_KEYS = new Set(["ArrowLeft", "ArrowRight", "h", "l", "Tab"])

const STICKY_HEADER_PX = 32 // DaySection's sticky DateBar (h-8)
const SCROLL_PADDING_PX = 8

// Window in which a just-closed popover counts as having "consumed" an Escape.
const POPOVER_CLOSE_GRACE_MS = 250

interface AgendaItem {
  id: string
  dateKey: string
  date: Date
  event: CalendarEvent
}

export interface GroupedDay {
  dateKey: string
  date: Date
  events: CalendarEvent[]
}

// Keyboard navigation for the agenda. While focused (Tab to enter), up/down +
// j/k move the selection and Enter opens the event; Escape, Tab, or any
// horizontal key (left/right/h/l) exits back to day navigation. Default
// selection is the first item in the active day.
export function useAgendaKeyboardNav({
  eventsByDate,
  scrollContainerRef,
}: {
  eventsByDate: GroupedDay[]
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) {
  const { setIsFocused } = useAgendaFocused()
  const { selectedItemId, setSelectedItemId } = useAgendaSelection()
  const { activeEvent, setActiveEventKey } = useCalEvents()
  const { activeDate, setActiveDate } = useCalendarNavigation()

  // Refs mirror state so handlers read fresh values without stale closures.
  const itemsRef = useRef<AgendaItem[]>([])
  const selectedIdRef = useRef<string | null>(null)
  const activeDateRef = useRef(activeDate)
  const activeEventRef = useRef(activeEvent)
  const prevActiveEventRef = useRef(activeEvent)
  const popoverClosedAtRef = useRef(0)

  // Flat list in DaySection's render order: all-day chips, then timed rows, per day.
  const items: AgendaItem[] = []
  for (const { dateKey, date, events } of eventsByDate) {
    const ordered = [
      ...events.filter((e) => isAllDay(e.start)),
      ...events.filter((e) => !isAllDay(e.start)),
    ]
    for (const event of ordered) {
      items.push({ id: `${dateKey}::${eventKey(event)}`, dateKey, date, event })
    }
  }
  itemsRef.current = items
  selectedIdRef.current = selectedItemId
  activeDateRef.current = activeDate
  activeEventRef.current = activeEvent

  // When a keyboard-opened popover closes, return focus to the agenda. The live
  // selection gates this so mouse-opened popovers don't steal focus.
  useEffect(() => {
    const had = prevActiveEventRef.current
    prevActiveEventRef.current = activeEvent
    if (had && !activeEvent && selectedIdRef.current) {
      popoverClosedAtRef.current = Date.now()
      scrollContainerRef.current?.focus()
    }
  }, [activeEvent])

  const firstIdInActiveDay = (): string | null => {
    const list = itemsRef.current
    if (!list.length) return null
    const activeKey = formatDateKey(activeDateRef.current)
    // YYYY-MM-DD keys: lexical compare == chronological.
    return (
      list.find((it) => it.dateKey === activeKey)?.id ??
      list.find((it) => it.dateKey > activeKey)?.id ??
      list[list.length - 1].id
    )
  }

  const scrollItemIntoView = (id: string) => {
    const container = scrollContainerRef.current
    if (!container) return
    const el = findItemEl(container, id)
    if (!el) return

    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const topBound = cRect.top + STICKY_HEADER_PX + SCROLL_PADDING_PX
    const bottomBound = cRect.bottom - SCROLL_PADDING_PX

    if (eRect.top < topBound) {
      container.scrollTop -= topBound - eRect.top
    } else if (eRect.bottom > bottomBound) {
      container.scrollTop += eRect.bottom - bottomBound
    }
  }

  const select = (id: string | null) => {
    setSelectedItemId(id)
    selectedIdRef.current = id
    if (!id) return

    scrollItemIntoView(id)

    // Make selected item's day active.
    // Use setActiveDate, not navigateToDate (we already scroll the agenda ourselves)
    const item = itemsRef.current.find((it) => it.id === id)
    if (item && item.dateKey !== formatDateKey(activeDateRef.current)) {
      activeDateRef.current = item.date
      setActiveDate(item.date)
    }
  }

  const move = (delta: number) => {
    const list = itemsRef.current
    if (!list.length) return

    const currentIndex = list.findIndex((it) => it.id === selectedIdRef.current)
    if (currentIndex === -1) {
      select(firstIdInActiveDay())
      return
    }

    const nextIndex = Math.min(list.length - 1, Math.max(0, currentIndex + delta))
    if (nextIndex !== currentIndex) select(list[nextIndex].id)
  }

  const openSelected = () => {
    const id = selectedIdRef.current
    const container = scrollContainerRef.current
    if (!id || !container) return

    const item = itemsRef.current.find((it) => it.id === id)
    if (!item) return

    const el = findItemEl(container, id)
    if (el) setEventAnchor(el)
    setActiveEventKey(eventKey(item.event))
  }

  const onFocus = () => {
    setIsFocused(true)
    const stillValid =
      selectedIdRef.current && itemsRef.current.some((it) => it.id === selectedIdRef.current)
    if (!stillValid) select(firstIdInActiveDay())
  }

  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Focus moving into the popover stays in keyboard mode so closing it returns here.
    if ((e.relatedTarget as HTMLElement | null)?.closest("[data-event-popover]")) return
    setIsFocused(false)
    select(null)
  }

  // Only Tab enters keyboard mode. A plain click on a non-focusable child focuses
  // the nearest focusable ancestor (this container), which would flip us into item
  // navigation. Block the browser's focus-on-mousedown so clicking the agenda — or
  // an event to open it — leaves the current focus alone. (No-op once we're already
  // focused, so in-mode clicks behave normally.)
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current === document.activeElement) return
    e.preventDefault()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Let global combos and shifted keys pass through.
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return

    if (e.key === "Escape") {
      // Escape that closes the popover shouldn't also exit the agenda. Radix may
      // close it before this runs, so a just-closed popover counts too. Otherwise
      // exit back to day nav.
      const popoverConsumedEscape =
        activeEventRef.current || Date.now() - popoverClosedAtRef.current < POPOVER_CLOSE_GRACE_MS
      if (popoverConsumedEscape) return
      e.preventDefault()
      scrollContainerRef.current?.blur()
      return
    }

    if (EXIT_KEYS.has(e.key)) {
      // stopPropagation so the global day-nav hotkeys (h/l/←/→) and the Tab
      // focus-agenda shortcut don't fire — Tab would otherwise re-focus us.
      e.preventDefault()
      e.stopPropagation()
      scrollContainerRef.current?.blur()
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      openSelected()
      return
    }

    const isPrev = PREV_KEYS.has(e.key)
    const isNext = NEXT_KEYS.has(e.key)
    if (!isPrev && !isNext) return // let other shortcuts (t/c/m/w/search) through

    // Block the global day/week nav hotkeys bound on document.
    e.preventDefault()
    e.stopPropagation()
    move(isPrev ? -1 : 1)
  }

  return {
    agendaProps: {
      id: AGENDA_EL_ID,
      // -1 keeps the agenda out of the natural tab order — it's focused only by the
      // Tab shortcut's programmatic .focus(), never by sequential tabbing or clicks.
      tabIndex: -1,
      onFocus,
      onBlur,
      onMouseDown,
      onKeyDown,
    },
  }
}

function findItemEl(container: HTMLElement, id: string): HTMLElement | null {
  const nodes = container.querySelectorAll<HTMLElement>("[data-agenda-item]")
  for (const node of nodes) {
    if (node.dataset.agendaItem === id) return node
  }
  return null
}
