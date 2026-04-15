import { addDays, addMonths, format, isBefore, startOfDay, subMonths } from "date-fns"
import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { CalendarBig, EventDotsProvider } from "@/components/ui/calendar-big"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation, useCalendars } from "@/contexts/CalendarStateContext"

import { formatDateKey } from "@/lib/time"

import { ChevronDownIcon } from "@/icons/chevron-down"
import { ChevronUpIcon } from "@/icons/chevron-up"

const HiddenComponent = () => <></>

const SLIDE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)"

type LeavingPanel = { key: string; content: ReactNode; dir: number }

function SlidePresence({
  slideKey,
  direction,
  duration,
  children,
}: {
  slideKey: string
  direction: number
  duration: number
  children: ReactNode
}) {
  const [leaving, setLeaving] = useState<LeavingPanel | null>(null)
  const prevKeyRef = useRef(slideKey)
  const latestChildrenRef = useRef(children)

  if (prevKeyRef.current !== slideKey) {
    const prevKey = prevKeyRef.current
    const prevContent = latestChildrenRef.current
    prevKeyRef.current = slideKey
    if (duration > 0) {
      setLeaving({ key: prevKey, content: prevContent, dir: direction })
    } else {
      setLeaving(null)
    }
  }
  latestChildrenRef.current = children

  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => {
      setLeaving((prev) => (prev && prev.key === leaving.key ? null : prev))
    }, duration * 1000)
    return () => window.clearTimeout(t)
  }, [leaving, duration])

  const enterStyle: CSSProperties =
    leaving && duration > 0
      ? {
          animation: `slide-in-y ${duration}s ${SLIDE_EASING} forwards`,
          ["--slide-from" as string]: `${direction * 100}%`,
        }
      : {}

  return (
    <>
      {leaving && (
        <div
          key={leaving.key}
          className="absolute inset-x-0 top-0"
          style={{
            animation: `slide-out-y ${duration}s ${SLIDE_EASING} forwards`,
            ["--slide-to" as string]: `${-leaving.dir * 100}%`,
          }}
        >
          {leaving.content}
        </div>
      )}
      <div key={slideKey} className="absolute inset-x-0 top-0" style={enterStyle}>
        {children}
      </div>
    </>
  )
}

export function StatefulCalendar() {
  const { calendars } = useCalendars()
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { calendarEvents } = useCalEvents()

  const eventDotsByDate = useMemo(() => {
    const map = new Map<string, string[]>()
    const addedPerDate = new Map<string, Set<string>>()

    const calendarColorMap = new Map<string, string>()
    for (const cal of calendars) {
      if (cal.color) calendarColorMap.set(cal.slug, cal.color)
    }

    const addDot = (dateKey: string, calendarSlug: string, color: string) => {
      const added = addedPerDate.get(dateKey) ?? new Set()
      if (added.has(calendarSlug)) return
      added.add(calendarSlug)
      addedPerDate.set(dateKey, added)

      const colors = map.get(dateKey) ?? []
      colors.push(color)
      map.set(dateKey, colors)
    }

    for (const event of calendarEvents) {
      const color = calendarColorMap.get(event.calendar_slug)
      if (!color) continue

      if (event.all_day) {
        const start = startOfDay(event.start)
        const end = startOfDay(event.end)
        let current = start
        while (isBefore(current, end)) {
          addDot(formatDateKey(current), event.calendar_slug, color)
          current = addDays(current, 1)
        }
        // Single-day all-day event where start equals end
        if (!isBefore(start, end)) {
          addDot(formatDateKey(start), event.calendar_slug, color)
        }
      } else {
        addDot(formatDateKey(event.start), event.calendar_slug, color)
      }
    }

    return map
  }, [calendarEvents, calendars])

  const monthKey = format(activeDate, "yyyy-MM")
  const prevMonthKeyRef = useRef(monthKey)
  const directionRef = useRef(1)
  const lastMonthChangeRef = useRef(0)
  const isRapidRef = useRef(false)

  if (prevMonthKeyRef.current !== monthKey) {
    const now = Date.now()
    isRapidRef.current = now - lastMonthChangeRef.current < 200
    lastMonthChangeRef.current = now
    directionRef.current = monthKey > prevMonthKeyRef.current ? 1 : -1
    prevMonthKeyRef.current = monthKey
  }

  const direction = directionRef.current
  const animationDuration = isRapidRef.current ? 0 : 0.25

  const gridRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState<number | null>(null)

  useEffect(() => {
    if (gridHeight == null && gridRef.current) {
      setGridHeight(gridRef.current.offsetHeight)
    }
  }, [gridHeight])

  const handleDateSelect = useCallback(
    (date: Date) => {
      navigateToDate(date)
      // Remove focus from the day button so global shortcuts (arrows, etc.) work
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    },
    [navigateToDate],
  )

  const calendar = (
    <EventDotsProvider value={eventDotsByDate}>
      <CalendarBig
        mode="single"
        selected={activeDate}
        onSelect={handleDateSelect}
        month={activeDate}
        onMonthChange={handleDateSelect}
        className="bg-transparent p-0"
        required
        components={{
          MonthCaption: HiddenComponent,
          Nav: HiddenComponent,
        }}
      />
    </EventDotsProvider>
  )

  return (
    <div className="pt-4 select-none">
      <div className="flex items-center justify-between px-4 pb-4 h-12">
        <h2 className="text-2xl font-bold font-heading">
          {format(activeDate, "MMMM")}{" "}
          <span className="text-highlight font-normal">{format(activeDate, "yyyy")}</span>
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            round
            onClick={() => navigateToDate(subMonths(activeDate, 1))}
          >
            <ChevronUpIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            round
            onClick={() => navigateToDate(addMonths(activeDate, 1))}
          >
            <ChevronDownIcon className="size-4" />
          </Button>
        </div>
      </div>

      {gridHeight == null ? (
        <div ref={gridRef}>{calendar}</div>
      ) : (
        <div className="relative overflow-hidden shrink-0" style={{ height: gridHeight }}>
          <SlidePresence slideKey={monthKey} direction={direction} duration={animationDuration}>
            {calendar}
          </SlidePresence>
        </div>
      )}
    </div>
  )
}
