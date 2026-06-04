import { RefObject, useRef } from "react"

import { useAgendaFocused, useAgendaSelection } from "@/contexts/AgendaFocusContext"
import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { setEventAnchor } from "@/lib/event-anchor"
import { formatDateKey, isAllDay } from "@/lib/event-time"

// Stable id so GlobalShortcuts can focus the agenda from its Tab handler,
// mirroring the getElementById pattern used for the search input.
export const AGENDA_EL_ID = "agenda-scroll-container"

// hjkl + arrows all drive the vertical list: up/left = previous, down/right = next.
const PREV_KEYS = new Set(["ArrowUp", "ArrowLeft", "k", "h"])
const NEXT_KEYS = new Set(["ArrowDown", "ArrowRight", "j", "l"])

const STICKY_HEADER_PX = 32 // DaySection's sticky DateBar (h-8)
const SCROLL_PADDING_PX = 8

interface AgendaItem {
  id: string
  dateKey: string
  event: CalendarEvent
}

export interface GroupedDay {
  dateKey: string
  date: Date
  events: CalendarEvent[]
}

/**
 * Makes the agenda a keyboard-navigable list. While the scroll container is
 * focused (Tab to enter, Escape to leave), arrow keys + hjkl move a "selected"
 * item up/down, Enter opens it. The default selection is the first item in the
 * currently active day.
 */
export function useAgendaKeyboardNav({
  eventsByDate,
  scrollContainerRef,
}: {
  eventsByDate: GroupedDay[]
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) {
  const { setIsFocused } = useAgendaFocused()
  const { selectedItemId, setSelectedItemId } = useAgendaSelection()
  const { setActiveEventKey } = useCalEvents()
  const { activeDate } = useCalendarNavigation()

  // Read latest values inside event handlers without stale closures.
  const itemsRef = useRef<AgendaItem[]>([])
  const selectedIdRef = useRef<string | null>(null)
  const activeDateRef = useRef(activeDate)

  // Flatten into the same visual order DaySection renders: all-day chips first,
  // then timed rows, day by day.
  const items: AgendaItem[] = []
  for (const { dateKey, events } of eventsByDate) {
    const ordered = [
      ...events.filter((e) => isAllDay(e.start)),
      ...events.filter((e) => !isAllDay(e.start)),
    ]
    for (const event of ordered) {
      items.push({ id: `${dateKey}::${eventKey(event)}`, dateKey, event })
    }
  }
  itemsRef.current = items
  selectedIdRef.current = selectedItemId
  activeDateRef.current = activeDate

  const firstIdInActiveDay = (): string | null => {
    const list = itemsRef.current
    if (!list.length) return null
    const activeKey = formatDateKey(activeDateRef.current)
    // Date keys are YYYY-MM-DD, so lexical compare matches chronological order.
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
    if (id) scrollItemIntoView(id)
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

  const onBlur = () => {
    setIsFocused(false)
    select(null)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Let global combos (mod+f, etc.) and shifted keys pass through.
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return

    if (e.key === "Escape") {
      e.preventDefault()
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
    if (!isPrev && !isNext) return // let t / c / m / w / search still work

    // Stop the global day/week navigation hotkeys (bound on document) from firing.
    e.preventDefault()
    e.stopPropagation()
    move(isPrev ? -1 : 1)
  }

  return {
    agendaProps: {
      id: AGENDA_EL_ID,
      tabIndex: 0,
      onFocus,
      onBlur,
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
