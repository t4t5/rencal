import { useRef, useState } from "react"

import { EventContextMenu } from "@/components/EventContextMenu"
import { UntitledEventText } from "@/components/ui/untitled-event-text"

import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import { pointAnchorFromClick, setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockClasses, getEventBlockStyle } from "@/lib/event-styles"
import { cn } from "@/lib/utils"

type WeekAllDayBarProps = {
  item: AllDayLaneItem
  /** Added to item.startCol/endCol so the bar aligns with the parent grid's day columns. */
  colOffset: number
  /** Added to item.lane so the bar lands on the right row in the parent grid. */
  rowOffset: number
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  dimmed: boolean
  onClick: () => void
}

export function WeekAllDayBar({
  item,
  colOffset,
  rowOffset,
  isActive,
  isPending,
  isDeclined,
  isDraft,
  dimmed,
  onClick,
}: WeekAllDayBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [contextOpen, setContextOpen] = useState(false)

  const color = item.color ?? "var(--primary)"
  const isDashed = isPending || isDeclined
  const highlighted = isActive || contextOpen
  const fillsRow = item.endCol - item.startCol >= 7

  const inner = (
    <div
      className="p-0.5 py-px pr-[3px]"
      style={{
        gridColumn: `${item.startCol + colOffset} / ${item.endCol + colOffset}`,
        gridRow: item.lane + 1 + rowOffset,
      }}
    >
      <div
        ref={ref}
        data-event-clickable={!isDraft || undefined}
        className={cn(
          getEventBlockClasses(highlighted, isDeclined),
          "truncate px-1 py-px leading-4 rounded",
          !isDraft && dimmed && "opacity-50",
          isDraft && "font-medium",
        )}
        style={getEventBlockStyle(color, item.eventColor, highlighted, isDashed, isDraft)}
        onClick={
          isDraft
            ? undefined
            : (e) => {
                e.stopPropagation()
                setEventAnchor(fillsRow ? pointAnchorFromClick(e) : e.currentTarget)
                onClick()
              }
        }
      >
        {item.event.summary || <UntitledEventText />}
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
