import { format } from "date-fns"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { CalendarBig } from "@/components/ui/calendar-big"

import { useCalendarState } from "@/contexts/CalendarStateContext"

export function StatefulCalendar() {
  const { activeDate, navigateToDate } = useCalendarState()

  const monthKey = format(activeDate, "yyyy-MM")
  const prevMonthKeyRef = useRef(monthKey)
  const directionRef = useRef(1)

  if (prevMonthKeyRef.current !== monthKey) {
    directionRef.current = monthKey > prevMonthKeyRef.current ? 1 : -1
    prevMonthKeyRef.current = monthKey
  }

  const direction = directionRef.current

  const containerRef = useRef<HTMLDivElement>(null)
  const [fixedHeight, setFixedHeight] = useState<number | null>(null)

  useEffect(() => {
    if (fixedHeight == null && containerRef.current) {
      setFixedHeight(containerRef.current.offsetHeight)
    }
  }, [fixedHeight])

  const handleDateSelect = useCallback(
    (date: Date) => {
      navigateToDate(date)
    },
    [navigateToDate],
  )

  const calendar = (
    <CalendarBig
      mode="single"
      selected={activeDate}
      onSelect={handleDateSelect}
      month={activeDate}
      onMonthChange={handleDateSelect}
      className="bg-transparent p-0 pt-4"
      required
    />
  )

  if (fixedHeight == null) {
    return <div ref={containerRef}>{calendar}</div>
  }

  return (
    <div className="relative overflow-hidden shrink-0" style={{ height: fixedHeight }}>
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={monthKey}
          className="absolute inset-x-0 top-0"
          custom={direction}
          initial="enter"
          animate="center"
          exit="exit"
          variants={{
            enter: (d: number) => ({ y: d * fixedHeight }),
            center: { y: 0 },
            exit: (d: number) => ({ y: d * -fixedHeight }),
          }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        >
          {calendar}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
