import { useRef, useState, MouseEventHandler } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"

import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockClasses, getEventBlockStyle } from "@/lib/event-styles"
import { cn } from "@/lib/utils"

export function MonthAllDayEvent({
  item,
  isActive,
  isPending,
  isDeclined,
  isDraft,
  onClick,
}: {
  item: AllDayLaneItem
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  onClick: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)

  const color = item.color ?? "var(--primary)"
  const highlighted = isActive || contextOpen

  const handleClick: MouseEventHandler<HTMLDivElement> | undefined = (e) => {
    if (!isDraft) {
      e.stopPropagation()
      setEventAnchor(e.currentTarget)
      onClick()
    }
  }

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        getEventBlockClasses(highlighted, isDeclined),
        "truncate px-1 py-px leading-4",
        (isPending || isDeclined || isDraft) && "opacity-50",
        item.isStart ? "rounded-l ml-0.5" : "-ml-0.5",
        item.isEnd ? "rounded-r mr-[3px]" : "-mr-0.5",
      )}
      style={{
        gridColumn: `${item.startCol} / ${item.endCol}`,
        gridRow: item.lane + 1,
        ...getEventBlockStyle(color, highlighted, false),
      }}
      onClick={handleClick}
    >
      {item.event.summary}
    </div>
  )

  if (isDraft) return inner

  return (
    <EventContextMenu event={item.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}
