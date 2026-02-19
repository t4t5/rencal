import { MonthGrid } from "@/components/month-view/MonthGrid"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import { useMonthEventLayout } from "@/hooks/cal-events/useMonthEventLayout"
import { useMonthGrid } from "@/hooks/cal-events/useMonthGrid"
import { cn } from "@/lib/utils"

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function MonthView() {
  const { activeDate, calendars, navigateToDate } = useCalendarState()
  const { calendarEvents, setActiveEventId, activeEvent } = useCalEvents()

  const weeks = useMonthGrid(activeDate)
  const weekLayouts = useMonthEventLayout(weeks, calendarEvents, calendars)

  return (
    <div className="hidden lg:flex flex-col grow border-l border-l-border min-w-0">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "text-xs text-muted-foreground py-2 text-center font-medium",
              i >= 5 && "bg-weekendBg",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <MonthGrid
        weeks={weeks}
        weekLayouts={weekLayouts}
        onDayClick={(date) => navigateToDate(date)}
        activeEventId={activeEvent?.id ?? null}
        onEventClick={(eventId) => setActiveEventId(eventId)}
      />
    </div>
  )
}
