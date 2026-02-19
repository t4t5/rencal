import { format, getMonth, getYear } from "date-fns"
import { RefObject, useCallback, useEffect, useRef } from "react"

import { MonthAllDayBar } from "@/components/month-view/MonthAllDayBar"
import { MonthDayCell } from "@/components/month-view/MonthDayCell"

import type { WeekLayout } from "@/hooks/cal-events/useMonthEventLayout"
import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { cn } from "@/lib/utils"

const MAX_ALL_DAY_LANES = 3
const SNAP_DELAY_MS = 100

type MonthGridProps = {
  weeks: MonthDay[][]
  weekLayouts: WeekLayout[]
  activeDate: Date
  activeEventId: string | null
  anchorWeekIndex: number
  scrollRef: RefObject<HTMLDivElement | null>
  onDayClick: (date: Date) => void
  onEventClick: (eventId: string) => void
  onScrollDateChange: (date: Date) => void
}

export function MonthGrid({
  weeks,
  weekLayouts,
  activeDate,
  activeEventId,
  anchorWeekIndex,
  scrollRef,
  onDayClick,
  onEventClick,
  onScrollDateChange,
}: MonthGridProps) {
  const weekRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const isScrollingProgrammatically = useRef(false)
  const hasInitialized = useRef(false)

  const activeMonth = getMonth(activeDate)
  const activeYear = getYear(activeDate)

  const isCurrentMonth = useCallback(
    (day: MonthDay) => getMonth(day.date) === activeMonth && getYear(day.date) === activeYear,
    [activeMonth, activeYear],
  )

  // Scroll to anchor week on mount
  useEffect(() => {
    if (hasInitialized.current) return
    const el = weekRefs.current.get(anchorWeekIndex)
    if (el) {
      isScrollingProgrammatically.current = true
      el.scrollIntoView({ block: "start" })
      hasInitialized.current = true
      requestAnimationFrame(() => {
        isScrollingProgrammatically.current = false
      })
    }
  }, [anchorWeekIndex])

  // Handle scroll to detect which week is at the top
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    let ticking = false
    let snapTimeout: ReturnType<typeof setTimeout> | null = null

    const findClosestWeek = () => {
      const containerTop = container.scrollTop
      let closestIdx = 0
      let closestDist = Infinity

      weekRefs.current.forEach((el, idx) => {
        const dist = Math.abs(el.offsetTop - containerTop)
        if (dist < closestDist) {
          closestDist = dist
          closestIdx = idx
        }
      })

      return closestIdx
    }

    const onScroll = () => {
      if (isScrollingProgrammatically.current) return

      // Always reset the snap timer on every scroll event
      if (snapTimeout) clearTimeout(snapTimeout)
      snapTimeout = setTimeout(() => {
        const idx = findClosestWeek()
        const el = weekRefs.current.get(idx)
        if (el) {
          isScrollingProgrammatically.current = true
          container.scrollTo({ top: el.offsetTop, behavior: "smooth" })
          setTimeout(() => {
            isScrollingProgrammatically.current = false
          }, 500)
        }
      }, SNAP_DELAY_MS)

      // Throttled date tracking
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const closestWeek = findClosestWeek()
        const week = weeks[closestWeek]
        if (week) {
          const thursday = week[3]
          onScrollDateChange(thursday.date)
        }
      })
    }

    container.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", onScroll)
      if (snapTimeout) clearTimeout(snapTimeout)
    }
  }, [weeks, onScrollDateChange])

  return (
    <div ref={scrollRef} className="flex flex-col grow overflow-y-auto relative">
      {weeks.map((weekDays, weekIndex) => {
        const layout = weekLayouts[weekIndex]
        const visibleAllDay = layout.allDayItems.filter((item) => item.lane < MAX_ALL_DAY_LANES)
        const visibleLaneCount = Math.min(layout.maxLane + 1, MAX_ALL_DAY_LANES)

        return (
          <div
            key={weekDays[0].dateKey}
            ref={(el) => {
              if (el) weekRefs.current.set(weekIndex, el)
            }}
            className="flex flex-col shrink-0 border-b border-border last:border-b-0"
            style={{ minHeight: "calc(100% / 6)" }}
          >
            {/* Day numbers row */}
            <div className="grid grid-cols-7">
              {weekDays.map((day) => (
                <div
                  key={day.dateKey}
                  className={cn(
                    "flex justify-end p-1 pb-0 cursor-default border-r border-border last:border-r-0",
                    day.isWeekend && "bg-weekendBg",
                    !isCurrentMonth(day) && "opacity-40",
                  )}
                  onClick={() => onDayClick(day.date)}
                >
                  <span
                    className={cn(
                      "text-xs w-5 h-5 flex items-center justify-center",
                      day.isToday && "bg-primary text-primary-foreground rounded-full",
                    )}
                  >
                    {format(day.date, "d")}
                  </span>
                </div>
              ))}
            </div>

            {/* All-day spanning bars zone */}
            {visibleAllDay.length > 0 && (
              <div
                className="grid grid-cols-7 gap-y-0.5"
                style={{
                  gridTemplateRows: `repeat(${visibleLaneCount}, auto)`,
                }}
              >
                {weekDays.map((day, colIndex) => (
                  <div
                    key={`bg-${day.dateKey}`}
                    className={cn(
                      colIndex < 6 && "border-r border-border",
                      day.isWeekend && "bg-weekendBg",
                      !isCurrentMonth(day) && "opacity-40",
                    )}
                    style={{
                      gridColumn: colIndex + 1,
                      gridRow: `1 / ${visibleLaneCount + 1}`,
                    }}
                  />
                ))}
                {visibleAllDay.map((item) => (
                  <MonthAllDayBar
                    key={`${item.event.id}-w${weekIndex}`}
                    item={item}
                    isActive={item.event.id === activeEventId}
                    onClick={() => onEventClick(item.event.id)}
                  />
                ))}
              </div>
            )}

            {/* Day cells with timed events */}
            <div className="grid grid-cols-7 grow">
              {weekDays.map((day, colIndex) => {
                const allDayOnDay = layout.allDayItems.filter(
                  (item) => item.startCol <= colIndex + 1 && item.endCol > colIndex + 1,
                )
                const visibleAllDayOnDay = allDayOnDay.filter(
                  (item) => item.lane < MAX_ALL_DAY_LANES,
                )
                const hiddenAllDay = allDayOnDay.length - visibleAllDayOnDay.length

                return (
                  <MonthDayCell
                    key={day.dateKey}
                    day={day}
                    isCurrentMonth={isCurrentMonth(day)}
                    timedEvents={layout.timedByCol[colIndex]}
                    hiddenAllDayCount={hiddenAllDay}
                    activeEventId={activeEventId}
                    onClick={() => onDayClick(day.date)}
                    onEventClick={onEventClick}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
