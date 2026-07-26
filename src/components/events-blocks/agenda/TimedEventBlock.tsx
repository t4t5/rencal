import { memo } from "react"

import { UntitledEventText } from "@/components/ui/untitled-event-text"

import type { TimeFormat } from "@/rpc/bindings"

import { useSettings } from "@/contexts/SettingsContext"

import { CalendarEvent } from "@/lib/cal-events"
import { getEventBlockColors } from "@/lib/event-styles"
import { formatDateKey, formatTime, isSameDay } from "@/lib/event-time"

export const AgendaTimedEventBlock = memo(function EventRow({
  event,
  calendarColor,
  dateKey,
}: {
  event: CalendarEvent
  calendarColor: string
  dateKey: string
}) {
  const { timeFormat } = useSettings()

  const colors = getEventBlockColors({ calendarColor, eventColor: event.color })
  const timeLabel = getTimeLabel(event, dateKey, timeFormat)

  return (
    <div className="flex gap-3 pl-3.5 pr-2">
      <div className="w-[3px] shrink-0 rounded" style={{ backgroundColor: colors.borderColor }} />
      <div className="relative text-sm">
        <div className="text-muted-foreground numerical text-xs h-4">{timeLabel}</div>
        <div className="font-medium">{event.summary || <UntitledEventText />}</div>
      </div>
    </div>
  )
})

/**
 * A multi-day timed event only appears as a timed row on the days it partially
 * covers (fully covered days render as all-day chips), so a row that isn't a
 * same-day range shows just the boundary it touches.
 */
function getTimeLabel(event: CalendarEvent, dateKey: string, timeFormat: TimeFormat): string {
  const { start, end } = event

  if (isSameDay(start, end)) {
    return `${formatTime(start, timeFormat)} - ${formatTime(end, timeFormat)}`
  }

  return formatDateKey(start) === dateKey
    ? `Starts at ${formatTime(start, timeFormat)}`
    : `Ends at ${formatTime(end, timeFormat)}`
}
