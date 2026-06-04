import { type MouseEvent } from "react"

import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { CalendarEvent } from "@/lib/cal-events"
import { getEventBlockClasses, getEventBlockStyle } from "@/lib/event-styles"
import { cn } from "@/lib/utils"

export const AgendaAllDayEventBlock = ({
  event,
  itemId,
  calendarColor,
  highlighted,
  selected,
  isDashed,
  isDeclined,
  isDraft,
  onClick,
}: {
  event: CalendarEvent
  itemId: string
  calendarColor: string
  highlighted: boolean
  selected: boolean
  isDashed: boolean
  isDeclined: boolean
  isDraft: boolean
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
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
      data-event-clickable={!isDraft || undefined}
      data-agenda-item={itemId}
      onClick={onClick}
      className={cn(
        getEventBlockClasses(highlighted, isDeclined),
        "px-1 py-px leading-4 rounded inline-flex text-[13px]!",
        isDraft && "font-medium",
        selected && "ring-2 ring-ring",
      )}
      style={style}
    >
      {event.summary || <UntitledEventText />}
    </div>
  )
}
