import { format } from "date-fns"
import { memo } from "react"

import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useSettings } from "@/contexts/SettingsContext"

import { CalendarEvent } from "@/lib/cal-events"
import { getEventBlockColors } from "@/lib/event-styles"
import { formatTime, isSameDay, toInteropDate } from "@/lib/event-time"

export const ListViewEventBlock = memo(function EventRow({
  event,
  calendarColor,
}: {
  event: CalendarEvent
  calendarColor: string | null
}) {
  const { timeFormat } = useSettings()
  const from = event.start
  const to = event.end

  const colors = getEventBlockColors({ calendarColor, eventColor: event.color })

  return (
    <div className="flex gap-3 pl-3.5 pr-2">
      <div
        className="w-[3px] bg-primary rounded"
        style={{
          ...(calendarColor ? { backgroundColor: colors.borderColor } : {}),
        }}
      />
      <div className="relative text-sm">
        <div className="text-muted-foreground numerical text-xs h-4">
          {isSameDay(from, to)
            ? `${formatTime(from, timeFormat)} - ${formatTime(to, timeFormat)}`
            : `${format(toInteropDate(from), "MMM d,")} ${formatTime(from, timeFormat)} - ${format(toInteropDate(to), "MMM d,")} ${formatTime(to, timeFormat)}`}
        </div>
        <div className="font-medium">{event.summary || <UntitledEventText />}</div>
      </div>
    </div>
  )
})
