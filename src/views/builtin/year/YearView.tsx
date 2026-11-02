import { Temporal } from "@js-temporal/polyfill"
import { useMemo } from "react"

import {
  Button,
  type CalendarEvent,
  ChevronLeftIcon,
  ChevronRightIcon,
  epochDay,
  useEventsInRange,
  useNavigation,
  useToday,
} from "@/sdk"

import { YearMonth } from "./YearMonth"

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const MAX_DOTS = 3

export function YearView() {
  const { activeDate, goToDate } = useNavigation()
  const today = useToday()

  const { year } = activeDate
  const yearStart = Temporal.PlainDate.from({ year, month: 1, day: 1 })
  const nextYearStart = yearStart.add({ years: 1 })
  const events = useEventsInRange(yearStart, nextYearStart)

  const firstDay = epochDay(yearStart)
  const lastDay = epochDay(nextYearStart) - 1
  const dots = useMemo(() => dotsByDay(events, firstDay, lastDay), [events, firstDay, lastDay])

  return (
    <div data-slot="year" className="flex flex-col h-full">
      <div
        data-slot="year-header"
        className="flex items-center justify-between shrink-0 px-(--layout-padding) pb-2"
      >
        <h2 data-slot="year-title" data-typography="heading" className="text-2xl font-bold">
          {year}
        </h2>

        <div data-slot="year-navigation" className="flex items-center gap-1">
          <Button
            data-direction="previous"
            aria-label="Previous year"
            variant="ghost"
            size="icon-xs"
            round
            tabIndex={-1}
            onClick={() => goToDate(activeDate.subtract({ years: 1 }))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            data-direction="next"
            aria-label="Next year"
            variant="ghost"
            size="icon-xs"
            round
            tabIndex={-1}
            onClick={() => goToDate(activeDate.add({ years: 1 }))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div data-slot="year-scroll" className="@container grow min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4 gap-6 px-(--layout-padding) pb-(--layout-padding)">
          {MONTHS.map((month) => (
            <YearMonth
              key={month}
              year={year}
              month={month}
              selectedDay={activeDate.month === month ? activeDate.day : null}
              todayDay={today.year === year && today.month === month ? today.day : null}
              dots={dots}
              onSelectDay={goToDate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Up to MAX_DOTS events per epoch day in [firstDay, lastDay], one per calendar.
function dotsByDay(
  events: readonly CalendarEvent[],
  firstDay: number,
  lastDay: number,
): Map<number, CalendarEvent[]> {
  const byDay = new Map<number, CalendarEvent[]>()

  for (const event of events) {
    const from = Math.max(epochDay(event.firstDay), firstDay)
    const to = Math.min(epochDay(event.lastDay), lastDay)

    for (let day = from; day <= to; day++) {
      const dayDots = byDay.get(day)
      if (!dayDots) {
        byDay.set(day, [event])
      } else if (
        dayDots.length < MAX_DOTS &&
        !dayDots.some((dot) => dot.calendarId === event.calendarId)
      ) {
        dayDots.push(event)
      }
    }
  }

  return byDay
}
