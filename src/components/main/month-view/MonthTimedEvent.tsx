import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import { useSettings } from "@/contexts/SettingsContext"

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockColors } from "@/lib/event-styles"
import { formatTime } from "@/lib/time"
import { cn } from "@/lib/utils"

type MonthTimedEventProps = {
  item: TimedEventItem
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  dimmed: boolean
  onClick: () => void
}

export function MonthTimedEvent({
  item,
  isActive,
  isPending,
  isDeclined,
  isDraft,
  dimmed,
  onClick,
}: MonthTimedEventProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const { timeFormat } = useSettings()

  const highlighted = isActive || contextOpen

  const colors = getEventBlockColors({
    calendarColor: item.color,
    eventColor: item.eventColor,
    highlighted,
  })

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        "flex items-center gap-1 text-xs truncate cursor-default hover:bg-hover rounded shrink-0",
        highlighted && "bg-accent!",
        (isPending || isDeclined) && "opacity-50",
        !isDraft && dimmed && "opacity-50",
        isDraft && "font-medium border border-dashed",
        isDeclined && "line-through",
      )}
      style={
        isDraft
          ? {
              backgroundColor: colors.backgroundColor,
              borderColor: colors.borderColor,
              color: colors.textColor,
            }
          : undefined
      }
      onClick={
        isDraft
          ? undefined
          : (e) => {
              e.stopPropagation()
              setEventAnchor(e.currentTarget)
              onClick()
            }
      }
    >
      <div className="w-0.5 h-full shrink-0" style={{ backgroundColor: colors.borderColor }} />
      <span className="truncate">
        <span
          className="text-[10px] numerical"
          style={{
            color: colors.textColor,
          }}
        >
          {formatTime(item.event.start, timeFormat)}
        </span>{" "}
        {item.event.summary || <UntitledEventText />}
      </span>
    </div>
  )

  if (isDraft) return inner

  return (
    <EventContextMenu event={item.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}
