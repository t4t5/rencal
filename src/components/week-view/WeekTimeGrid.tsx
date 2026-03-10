import { format } from "date-fns"
import { useEffect, useState } from "react"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import type { WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { cn } from "@/lib/utils"

import { WeekTimedEvent } from "./WeekTimedEvent"

function CurrentTimeIndicator({ topPercent, time }: { topPercent: number; time: Date }) {
  const [colonVisible, setColonVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => setColonVisible((v) => !v), 1_000)
    return () => clearInterval(interval)
  }, [])

  const hour = format(time, "h")
  const minutes = format(time, "mm")
  const ampm = format(time, "aaa")

  return (
    <div
      className="absolute -left-3.5 -right-2 z-10 pointer-events-none flex items-center"
      style={{ top: `${topPercent}%`, transform: "translateY(-50%)" }}
    >
      <span className="text-[11px] font-medium text-active shrink-0 leading-none bg-background">
        {hour}
        <span className={cn(!colonVisible && "invisible")}>:</span>
        {minutes}
        {ampm}
      </span>
      <div className="ml-1 grow border-t border-dashed border-active" />
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

type WeekTimeGridProps = {
  weekDays: MonthDay[]
  timedByCol: WeekTimedEventLayout[][]
  activeEventId: string | null
  onEventClick: (id: string) => void
}

export function WeekTimeGrid({
  weekDays,
  timedByCol,
  activeEventId,
  onEventClick,
}: WeekTimeGridProps) {
  const [, setTick] = useState(0)

  // Update time indicator every 60s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const timeIndicatorTopPercent = (currentMinutes / (24 * 60)) * 100

  // Find which column (if any) is today
  const todayColIndex = weekDays.findIndex((d) => d.isToday)

  return (
    <div className="relative h-full">
      {/* Hour grid lines + labels */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border first-of-type:border-none"
          style={{ top: `${(hour / 24) * 100}%` }}
        >
          <span className="absolute -top-1 left-1.5 text-[10px] text-muted-foreground w-10">
            {String(hour).padStart(2, "0")}:00
          </span>
        </div>
      ))}

      {/* Day columns */}
      <div className="absolute top-0 bottom-0 right-0" style={{ left: 52 }}>
        <div className="grid grid-cols-7 h-full">
          {weekDays.map((day, colIndex) => (
            <div
              key={day.dateKey}
              className={cn("relative border-r border-border", day.isWeekend && "bg-weekendBg")}
            >
              {/* Timed events */}
              {timedByCol[colIndex].map((layout) => (
                <WeekTimedEvent
                  key={layout.event.id}
                  layout={layout}
                  isActive={activeEventId === layout.event.id}
                  onClick={() => onEventClick(layout.event.id)}
                />
              ))}

              {/* Current time indicator */}
              {colIndex === todayColIndex && (
                <CurrentTimeIndicator topPercent={timeIndicatorTopPercent} time={now} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
