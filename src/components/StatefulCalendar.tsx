import { addMonths, format, subMonths } from "date-fns"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { CalendarBig } from "@/components/ui/calendar-big"

import { useCalendarState } from "@/contexts/CalendarStateContext"

const HiddenComponent = () => <></>

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
