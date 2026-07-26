import { format } from "date-fns"
import { memo } from "react"

import { TimedAgendaEventDisplayMode } from "@/components/sidebar/agenda/agendaEventDisplay"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import type { TimeFormat } from "@/rpc/bindings"

import { useSettings } from "@/contexts/SettingsContext"

import { CalendarEvent } from "@/lib/cal-events"
import { getEventBlockColors } from "@/lib/event-styles"
import { formatTime, isSameDay, toInteropDate } from "@/lib/event-time"

export const AgendaTimedEventBlock = memo(function EventRow({
  event,
  calendarColor,
  displayMode,
}: {
  event: CalendarEvent
  calendarColor: string
  displayMode: TimedAgendaEventDisplayMode
}) {
  const { timeFormat } = useSettings()

  const colors = getEventBlockColors({ calendarColor, eventColor: event.color })
  const timeLabel = getTimeLabel(event, displayMode, timeFormat)

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

function getTimeLabel(
  event: CalendarEvent,
  displayMode: TimedAgendaEventDisplayMode,
  timeFormat: TimeFormat,
): string {
  const { start, end } = event

  if (displayMode === "starts-at") {
    return `Starts at ${formatTime(start, timeFormat)}`
  }

  if (displayMode === "ends-at") {
    return `Ends at ${formatTime(end, timeFormat)}`
  }

  const startTime = formatTime(start, timeFormat)
  const endTime = formatTime(end, timeFormat)

  if (isSameDay(start, end)) {
    return `${startTime} - ${endTime}`
  }

  const startDate = format(toInteropDate(start), "MMM d,")
  const endDate = format(toInteropDate(end), "MMM d,")

  return `${startDate} ${startTime} - ${endDate} ${endTime}`
}
