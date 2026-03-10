import { format, startOfWeek } from "date-fns"
import { AnimatePresence, motion } from "motion/react"
import { useRef } from "react"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useWeekDays } from "@/hooks/cal-events/useWeekDays"
import { useWeekEventLayout } from "@/hooks/cal-events/useWeekEventLayout"

import { WeekHeader } from "./WeekHeader"
import { WeekTimeGrid } from "./WeekTimeGrid"

export function WeekView() {
  const { activeDate, calendars } = useCalendarState()
  const { calendarEvents, toggleActiveEventId, activeEvent } = useCalEvents()

  const weekStart = startOfWeek(activeDate, { weekStartsOn: 1 })
  const weekKey = format(weekStart, "yyyy-MM-dd")

  const weekDays = useWeekDays(activeDate)
  const layout = useWeekEventLayout(weekDays, calendarEvents, calendars)

  // Track direction for animation
  const prevWeekKeyRef = useRef(weekKey)
  const directionRef = useRef(0)

  if (prevWeekKeyRef.current !== weekKey) {
    directionRef.current = weekKey > prevWeekKeyRef.current ? 1 : -1
    prevWeekKeyRef.current = weekKey
  }

  const direction = directionRef.current

  return (
    <div className="flex flex-col h-full">
      <WeekHeader
        weekDays={weekDays}
        allDayItems={layout.allDayItems}
        maxAllDayLane={layout.maxAllDayLane}
        activeEventId={activeEvent?.id ?? null}
        onEventClick={toggleActiveEventId}
      />

      <div className="relative grow overflow-hidden">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={weekKey}
            className="absolute inset-0"
            custom={direction}
            initial="enter"
            animate="center"
            exit="exit"
            variants={{
              enter: (d: number) => ({ x: d === 0 ? 0 : d * 300, opacity: d === 0 ? 1 : 0.5 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -300, opacity: 0.5 }),
            }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            <WeekTimeGrid
              weekDays={weekDays}
              timedByCol={layout.timedByCol}
              activeEventId={activeEvent?.id ?? null}
              onEventClick={toggleActiveEventId}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
