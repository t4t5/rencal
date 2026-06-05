import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { CalendarEvent } from "@/lib/cal-events"
import { getEventBlockClasses, getEventBlockStyle } from "@/lib/event-styles"
import { cn } from "@/lib/utils"

export const AgendaAllDayEventBlock = ({
  event,
  calendarColor,
  highlighted,
  isDashed,
  isDeclined,
  isDraft,
}: {
  event: CalendarEvent
  calendarColor: string
  highlighted: boolean
  isDashed: boolean
  isDeclined: boolean
  isDraft: boolean
}) => {
  const style = getEventBlockStyle({
    calendarColor,
    eventColor: event.color,
    highlighted,
    isDashed,
    isDraft,
  })

  return (
    <div
      className={cn(
        getEventBlockClasses(highlighted, isDeclined),
        "px-1 py-px leading-4 rounded inline-flex text-[13px]!",
        isDraft && "font-medium",
      )}
      style={style}
    >
      {event.summary || <UntitledEventText />}
    </div>
  )
}
