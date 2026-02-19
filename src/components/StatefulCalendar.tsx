import { addDays, addMonths, format, isBefore, startOfDay, subMonths } from "date-fns"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { CalendarBig, EventDotsProvider } from "@/components/ui/calendar-big"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

const HiddenComponent = () => <></>

export function StatefulCalendar() {
  const { activeDate, navigateToDate, calendars } = useCalendarState()
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
          addDot(format(current, "yyyy-MM-dd"), event.calendar_slug, color)
          current = addDays(current, 1)
        }
        // Single-day all-day event where start equals end
        if (!isBefore(start, end)) {
          addDot(format(start, "yyyy-MM-dd"), event.calendar_slug, color)
        }
      } else {
        addDot(format(event.start, "yyyy-MM-dd"), event.calendar_slug, color)
      }
    }

    return map
  }, [calendarEvents, calendars])

  const monthKey = format(activeDate, "yyyy-MM")
  const prevMonthKeyRef = useRef(monthKey)
  const directionRef = useRef(1)

  if (prevMonthKeyRef.current !== monthKey) {
    directionRef.current = monthKey > prevMonthKeyRef.current ? 1 : -1
    prevMonthKeyRef.current = monthKey
  }

  const direction = directionRef.current

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
    <div className="pt-4">
      <div className="flex items-center justify-between px-4 pb-4">
        <h2 className="text-2xl font-bold">{format(activeDate, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => navigateToDate(subMonths(activeDate, 1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => navigateToDate(addMonths(activeDate, 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>

      {gridHeight == null ? (
        <div ref={gridRef}>{calendar}</div>
      ) : (
        <div className="relative overflow-hidden shrink-0" style={{ height: gridHeight }}>
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={monthKey}
              className="absolute inset-x-0 top-0"
              custom={direction}
              initial="enter"
              animate="center"
              exit="exit"
              variants={{
                enter: (d: number) => ({ y: d * gridHeight }),
                center: { y: 0 },
                exit: (d: number) => ({ y: d * -gridHeight }),
              }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              {calendar}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
