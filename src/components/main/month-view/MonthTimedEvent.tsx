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

  const highlighted = isActive || contextOpen
  const color = item.color ?? "var(--primary)"

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        "flex items-center gap-1 text-xs truncate cursor-default px-1 hover:bg-hover rounded shrink-0",
        highlighted && "bg-accent!",
        (isPending || isDeclined) && "opacity-50",
        !isDraft && dimmed && "opacity-50",
        isDraft && "font-medium border border-dashed",
        isDeclined && "line-through",
      )}
      style={
        isDraft
          ? {
              backgroundColor: `color-mix(in srgb, ${color} 15%, var(--background))`,
              borderColor: `oklch(from ${color} l calc(c * 1.4) h)`,
              color: `color-mix(in srgb, oklch(from ${color} l calc(c * 1.4) h) 60%, var(--foreground))`,
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
      <div className="size-1.5 rounded-circle shrink-0" style={{ backgroundColor: color }} />
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
