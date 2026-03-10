import { useEffect, useRef, useState } from "react"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { HOUR_HEIGHT, type WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { cn } from "@/lib/utils"

import { WeekTimedEvent } from "./WeekTimedEvent"

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const TOTAL_HEIGHT = 24 * HOUR_HEIGHT

type WeekTimeGridProps = {
  weekDays: MonthDay[]
  timedByCol: WeekTimedEventLayout[][]
  activeEventId: string | null
  onEventClick: (id: string) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
}

export function WeekTimeGrid({
  weekDays,
  timedByCol,
  activeEventId,
  onEventClick,
  scrollRef,
}: WeekTimeGridProps) {
  const timeIndicatorRef = useRef<HTMLDivElement>(null)
  const [, setTick] = useState(0)

  // Auto-scroll to current time on mount
  const hasScrolled = useRef(false)
  useEffect(() => {
    if (hasScrolled.current || !scrollRef.current) return
    hasScrolled.current = true
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const targetScroll = (currentMinutes / 60) * HOUR_HEIGHT - scrollRef.current.clientHeight / 3
    scrollRef.current.scrollTop = Math.max(0, targetScroll)
  }, [scrollRef])

  // Update time indicator every 60s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const timeIndicatorTop = (currentMinutes / 60) * HOUR_HEIGHT

  // Find which column (if any) is today
  const todayColIndex = weekDays.findIndex((d) => d.isToday)

  return (
    <div className="relative" style={{ height: TOTAL_HEIGHT }}>
      {/* Hour grid lines + labels */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border first-of-type:border-none"
          style={{ top: hour * HOUR_HEIGHT }}
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
                <div
                  ref={timeIndicatorRef}
                  className="absolute left-0 right-0 z-10 pointer-events-none"
                  style={{ top: timeIndicatorTop }}
                >
                  <div className="absolute -left-1.5 -top-1.5 size-3 rounded-full bg-red-500" />
                  <div className="h-0.5 bg-red-500" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
