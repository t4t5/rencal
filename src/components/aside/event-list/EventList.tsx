import { useVirtualizer } from "@tanstack/react-virtual"
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { flushSync } from "react-dom"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { useCalEventsInfiniteScroll } from "@/hooks/cal-events/useCalEventsInfiniteScroll"
import { useEventsWithDraft } from "@/hooks/cal-events/useEventsWithDraft"
import { useGroupedEvents } from "@/hooks/cal-events/useGroupedEvents"
import { CalendarEvent } from "@/lib/cal-events"
import { formatDateKey, isAllDay } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { DaySection } from "./DaySection"
import { WelcomeEmptyState } from "./WelcomeEmptyState"

type Section = {
  date: Date
  events: CalendarEvent[]
  isGhost: boolean
}

// Matches `h-8` on DaySection's sticky header — used by activeDate logic and size estimates.
const HEADER_PX = 32

export function EventList() {
  const { calendars, isLoadingCalendars } = useCalendars()
  const { activeDate, setActiveDate, registerScrollToDate, isNavigating, setIsNavigating } =
    useCalendarNavigation()

  const { calendarEvents: events, isInitialLoading } = useCalEvents()
  const { events: eventsWithDraft, draftCalEvent } = useEventsWithDraft(events)
  const { eventsByDate } = useGroupedEvents({ events: eventsWithDraft })

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [hasInitiallyScrolled, setHasInitiallyScrolled] = useState(false)
  const [ghostDate, setGhostDate] = useState<Date | null>(null)
  const ghostDateRef = useRef<Date | null>(null)
  ghostDateRef.current = ghostDate
  const ghostScrollBehaviorRef = useRef<ScrollBehavior>("smooth")
  const hasInitiallyScrolledRef = useRef(false)
  const pendingInitialGhostScrollRef = useRef(false)
  const initialRevealRafRef = useRef<number | null>(null)

  useCalEventsInfiniteScroll({
    scrollContainerRef,
    enabled: hasInitiallyScrolled,
  })

  const sectionsToRender = useMemo((): Section[] => {
    const sections: Section[] = eventsByDate.map(({ date, events }) => ({
      date,
      events,
      isGhost: false,
    }))

    if (ghostDate) {
      const ghostDateStr = formatDateKey(ghostDate)
      const alreadyExists = sections.some(({ date }) => formatDateKey(date) === ghostDateStr)
      if (!alreadyExists) {
        sections.push({ date: ghostDate, events: [], isGhost: true })
        sections.sort((a, b) => a.date.getTime() - b.date.getTime())
      }
    }

    return sections
  }, [eventsByDate, ghostDate])

  const sectionIndexByDate = useMemo(() => {
    const map = new Map<string, number>()
    sectionsToRender.forEach((s, i) => map.set(formatDateKey(s.date), i))
    return map
  }, [sectionsToRender])

  // Stable ref so estimateSize doesn't re-create the virtualizer on each render.
  const sectionsRef = useRef(sectionsToRender)
  sectionsRef.current = sectionsToRender

  const estimateSize = useCallback((index: number) => {
    const section = sectionsRef.current[index]
    if (!section) return 80
    const allDayCount = section.events.filter((e) => isAllDay(e.start)).length
    const timedCount = section.events.length - allDayCount
    // Header (32) + all-day row (~26 if any) + timed rows (~44 each) + bottom padding (8)
    const allDayRows = allDayCount > 0 ? 26 : 0
    return HEADER_PX + allDayRows + timedCount * 44 + 8
  }, [])

  const getItemKey = useCallback((index: number) => {
    const section = sectionsRef.current[index]
    return section ? formatDateKey(section.date) : index
  }, [])

  const virtualizer = useVirtualizer({
    count: sectionsToRender.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    getItemKey,
    overscan: 5,
  })

  // Suppress scroll-driven activeDate updates briefly after programmatic scrolls
  // (initial scroll, navigation, prepend correction). Without this, the offset
  // we just programmatically applied would be read back as a "user scroll" and
  // emit the wrong activeDate.
  const ignoreScrollUntilRef = useRef(0)

  const finishInitialScroll = useEffectEvent(() => {
    setIsNavigating(false)
    if (initialRevealRafRef.current !== null) cancelAnimationFrame(initialRevealRafRef.current)
    initialRevealRafRef.current = requestAnimationFrame(() => {
      initialRevealRafRef.current = null
      setHasInitiallyScrolled(true)
    })
  })

  // Preserve scroll position when sections are prepended (infinite-scroll loading
  // a previous range). Without this, the prepended items would push the user's
  // current view down.
  const prevFirstKeyRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    const curFirstKey = sectionsToRender[0] ? formatDateKey(sectionsToRender[0].date) : null
    const prevKey = prevFirstKeyRef.current
    prevFirstKeyRef.current = curFirstKey

    if (!prevKey || !curFirstKey || prevKey === curFirstKey) return

    const prevIdxInNew = sectionIndexByDate.get(prevKey)
    if (prevIdxInNew === undefined || prevIdxInNew === 0) return

    let prependedHeight = 0
    for (let i = 0; i < prevIdxInNew; i++) {
      prependedHeight += estimateSize(i)
    }
    ignoreScrollUntilRef.current = Date.now() + 200
    virtualizer.scrollToOffset((virtualizer.scrollOffset ?? 0) + prependedHeight, {
      align: "start",
    })
  })

  const scrollToDate = useEffectEvent((date: Date, behavior: ScrollBehavior = "smooth") => {
    const targetDateStr = formatDateKey(date)
    const idx = sectionIndexByDate.get(targetDateStr)

    if (idx !== undefined) {
      // Remove ghost synchronously so virtualizer measures the final layout
      flushSync(() => setGhostDate(null))
      ignoreScrollUntilRef.current = Date.now() + 400
      virtualizer.scrollToIndex(idx, {
        align: "start",
        behavior: behavior === "smooth" ? "smooth" : "auto",
      })
      return true
    } else {
      // No events on this date — show a ghost section
      ghostScrollBehaviorRef.current = behavior
      setGhostDate(date)
      return false
    }
  })

  // Once a ghost section appears, scroll to it and watch for it leaving the viewport
  useEffect(() => {
    if (!ghostDate) return
    const ghostDateStr = formatDateKey(ghostDate)
    const idx = sectionIndexByDate.get(ghostDateStr)
    if (idx === undefined) return

    ignoreScrollUntilRef.current = Date.now() + 400
    virtualizer.scrollToIndex(idx, {
      align: "start",
      behavior: ghostScrollBehaviorRef.current === "smooth" ? "smooth" : "auto",
    })
    if (pendingInitialGhostScrollRef.current) {
      pendingInitialGhostScrollRef.current = false
      finishInitialScroll()
    }

    const el = scrollContainerRef.current
    if (!el) return

    let hasBeenVisible = false
    let rafId: number | null = null
    const check = () => {
      rafId = null
      const items = virtualizer.getVirtualItems()
      const ghostItem = items.find((i) => i.index === idx)
      const viewTop = el.scrollTop
      const viewBottom = viewTop + el.clientHeight
      const isVisible = !!ghostItem && ghostItem.start < viewBottom && ghostItem.end > viewTop
      if (isVisible) hasBeenVisible = true
      else if (hasBeenVisible) setGhostDate(null)
    }
    const handler = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(check)
    }
    el.addEventListener("scroll", handler, { passive: true })
    return () => {
      el.removeEventListener("scroll", handler)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [ghostDate, sectionIndexByDate, virtualizer])

  useEffect(() => {
    return () => {
      if (initialRevealRafRef.current !== null) cancelAnimationFrame(initialRevealRafRef.current)
    }
  }, [])

  // The "currently visible" section is the one whose box contains the point
  // just below the sticky header (scrollTop + HEADER_PX).
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    let rafId: number | null = null
    const handler = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (ghostDateRef.current) return
        if (isNavigating()) return
        if (Date.now() < ignoreScrollUntilRef.current) return

        const point = el.scrollTop + HEADER_PX
        const items = virtualizer.getVirtualItems()
        const item = items.find((i) => point >= i.start && point < i.end)
        if (item === undefined) return
        const section = sectionsRef.current[item.index]
        if (section && !section.isGhost) {
          setActiveDate(section.date)
        }
      })
    }
    el.addEventListener("scroll", handler, { passive: true })
    return () => {
      el.removeEventListener("scroll", handler)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [virtualizer, isNavigating, setActiveDate])

  useEffect(() => {
    registerScrollToDate(scrollToDate)
  }, [])

  const scrollContainerHeight = virtualizer.scrollRect?.height ?? 0
  useEffect(() => {
    if (hasInitiallyScrolledRef.current) return
    if (eventsByDate.length === 0) return
    if (scrollContainerHeight === 0) return

    setIsNavigating(true)

    let secondRafId: number | null = null
    const firstRafId = requestAnimationFrame(() => {
      secondRafId = requestAnimationFrame(() => {
        if (hasInitiallyScrolledRef.current) return
        const scrolledImmediately = scrollToDate(activeDate, "instant")
        hasInitiallyScrolledRef.current = true
        if (scrolledImmediately) {
          finishInitialScroll()
        } else {
          pendingInitialGhostScrollRef.current = true
        }
      })
    })

    return () => {
      cancelAnimationFrame(firstRafId)
      if (secondRafId !== null) cancelAnimationFrame(secondRafId)
    }
  }, [activeDate, eventsByDate, finishInitialScroll, scrollContainerHeight])

  if (isInitialLoading || isLoadingCalendars) {
    return <div className="grow" />
  }

  if (calendars.length === 0) {
    return <WelcomeEmptyState />
  }

  if (events.length === 0) {
    return <div className="p-2 text-sm text-muted-foreground">No events</div>
  }

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        "grow overflow-auto select-none bg-background",
        !hasInitiallyScrolled && "invisible",
      )}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const section = sectionsToRender[virtualRow.index]
          if (!section) return null
          const dateStr = formatDateKey(section.date)

          return (
            <div
              key={dateStr}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: `${virtualRow.start}px`,
                left: 0,
                width: "100%",
              }}
            >
              <DaySection
                events={section.events}
                date={section.date}
                calendars={calendars}
                draftEvent={draftCalEvent}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
