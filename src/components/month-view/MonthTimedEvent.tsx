import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { cn } from "@/lib/utils"

type MonthTimedEventProps = {
  item: TimedEventItem
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  onClick: () => void
}

export function MonthTimedEvent({
  item,
  isActive,
  isPending,
  isDeclined,
  isDraft,
  onClick,
}: MonthTimedEventProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)

  const highlighted = isActive || contextOpen

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        "flex items-center gap-1 text-xs truncate cursor-default px-1 hover:bg-hoverBg rounded shrink-0",
        highlighted && "bg-accent!",
        (isPending || isDeclined || isDraft) && "opacity-50",
        isDeclined && "line-through",
      )}
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
      <div
        className="size-1.5 rounded-circle shrink-0"
        style={{ backgroundColor: item.color ?? "var(--primary)" }}
      />
      <span className="truncate">{item.event.summary}</span>
    </div>
  )

  if (isDraft) return inner

  return (
    <EventContextMenu event={item.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}
