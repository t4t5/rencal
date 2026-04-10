import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"

import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockClasses, getEventBlockStyle } from "@/lib/event-styles"
import { cn } from "@/lib/utils"

type WeekAllDayBarProps = {
  item: AllDayLaneItem
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  onClick: () => void
}

export function WeekAllDayBar({
  item,
  isActive,
  isPending,
  isDeclined,
  isDraft,
  onClick,
}: WeekAllDayBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)

  const color = item.color ?? "var(--primary)"
  const isDashed = isPending || isDeclined || isDraft
  const highlighted = isActive || contextOpen

  const inner = (
    <div
      className="p-0.5 py-px"
      style={{
        gridColumn: `${item.startCol} / ${item.endCol}`,
        gridRow: item.lane + 1,
      }}
    >
      <div
        ref={ref}
        data-event-clickable={!isDraft || undefined}
        className={cn(
          getEventBlockClasses(highlighted, isDeclined),
          "truncate px-1 py-px leading-4 rounded",
          isDraft && "opacity-60",
        )}
        style={getEventBlockStyle(color, highlighted, isDashed)}
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
    </div>
  )

  if (isDraft) return inner

  return (
    <EventContextMenu event={item.event} anchorRef={ref} onOpenChange={setContextOpen}>
      {inner}
    </EventContextMenu>
  )
}
