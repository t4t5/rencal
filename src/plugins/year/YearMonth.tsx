import { Temporal } from "@js-temporal/polyfill"
import { memo } from "react"

import {
  type CalendarEvent,
  cn,
  epochDay,
  formatMonth,
  startOfWeek,
  useDisplaySettings,
  useEventAppearance,
} from "@/sdk"

const WEEKDAY_LETTERS = {
  monday: ["M", "T", "W", "T", "F", "S", "S"],
  sunday: ["S", "M", "T", "W", "T", "F", "S"],
}
// Every month gets six rows so the months line up across the grid.
const GRID_DAYS = 42

const isWeekend = (date: Temporal.PlainDate) => date.dayOfWeek >= 6

export const YearMonth = memo(function YearMonth({
  year,
  month,
  selectedDay,
  todayDay,
  dots,
  onSelectDay,
}: {
  year: number
  month: number
  // Day of month of the selected date and of today, when they fall in this month.
  selectedDay: number | null
  todayDay: number | null
  dots: Map<number, CalendarEvent[]>
  onSelectDay: (date: Temporal.PlainDate) => void
}) {
  const { firstDayOfWeek } = useDisplaySettings()
  const monthStart = Temporal.PlainDate.from({ year, month, day: 1 })
  const gridStart = startOfWeek(monthStart, firstDayOfWeek)
  const gridStartDay = epochDay(gridStart)
  const days = Array.from({ length: GRID_DAYS }, (_, i) => gridStart.add({ days: i }))

  return (
    <section data-slot="year-month" className="flex flex-col gap-1 min-w-0">
      <div
        data-slot="year-month-title"
        className="self-start px-1 text-sm font-medium cursor-default"
      >
        {formatMonth(monthStart, "long")}
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAY_LETTERS[firstDayOfWeek].map((letter, i) => {
          const weekend = isWeekend(gridStart.add({ days: i }))
          return (
            <div
              key={i}
              data-slot="year-weekday"
              data-typography="numerical"
              data-weekend={weekend || undefined}
              className={cn(
                "py-1 text-center text-2xs font-medium uppercase text-muted-foreground",
                weekend && "bg-weekend",
              )}
            >
              {letter}
            </div>
          )
        })}

        {days.map((date, i) => {
          const weekend = isWeekend(date)
          if (date.month !== month) {
            return <div key={i} className={cn("h-8", weekend && "bg-weekend")} />
          }

          return (
            <YearDay
              key={i}
              date={date}
              isSelected={date.day === selectedDay}
              isToday={date.day === todayDay}
              isWeekend={weekend}
              dots={dots.get(gridStartDay + i)}
              onSelect={onSelectDay}
            />
          )
        })}
      </div>
    </section>
  )
})

function YearDay({
  date,
  isSelected,
  isToday,
  isWeekend,
  dots,
  onSelect,
}: {
  date: Temporal.PlainDate
  isSelected: boolean
  isToday: boolean
  isWeekend: boolean
  dots: CalendarEvent[] | undefined
  onSelect: (date: Temporal.PlainDate) => void
}) {
  return (
    <div
      data-slot="year-day"
      data-selected={isSelected || undefined}
      data-weekend={isWeekend || undefined}
      className={cn(
        "group/day relative flex h-8 justify-center pt-1 cursor-default",
        isWeekend && "bg-weekend",
      )}
      onClick={() => onSelect(date)}
    >
      <span
        data-slot="year-day-number"
        data-typography="numerical"
        data-today={isToday || undefined}
        className={cn(
          "flex size-5 items-center justify-center rounded-circle text-xs",
          isToday && "bg-today text-today-foreground",
          isSelected && !isToday && "bg-selected text-selected-foreground",
          !isToday && !isSelected && "group-hover/day:bg-hover",
        )}
      >
        {date.day}
      </span>

      {dots && (
        <div
          data-slot="year-event-dots"
          className="pointer-events-none absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-[3px]"
        >
          {dots.map((event) => (
            <EventDot key={event.key} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}

function EventDot({ event }: { event: CalendarEvent }) {
  const { style } = useEventAppearance(event)
  return <span className="size-1 rounded-circle bg-(--calendar-event-color)" style={style} />
}
