import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"

import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockStyle } from "@/lib/event-styles"
import { cn } from "@/lib/utils"

type MonthAllDayBarProps = {
  item: AllDayLaneItem
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  onClick: () => void
}

export function MonthAllDayBar({
  item,
  isActive,
  isPending,
  isDeclined,
  isDraft,
  onClick,
}: MonthAllDayBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)

  const color = item.color ?? "var(--primary)"
  const highlighted = isActive || contextOpen

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        "text-xs truncate px-1 py-px cursor-default leading-4",
        highlighted ? "brightness-150" : "hover:brightness-110",
        (isPending || isDeclined || isDraft) && "opacity-50",
        isDeclined && "line-through",
        item.isStart ? "rounded-l ml-px" : "-ml-px",
        item.isEnd ? "rounded-r mr-px" : "-mr-px",
      )}
      style={{
        gridColumn: `${item.startCol} / ${item.endCol}`,
        gridRow: item.lane + 1,
        ...getEventBlockStyle(color, highlighted, false),
      }}
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
