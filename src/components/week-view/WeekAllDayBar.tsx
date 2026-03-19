import { useRef, useState } from "react"

import { DeleteConfirmDialog } from "@/components/event-info/DeleteConfirmDialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarState } from "@/contexts/CalendarStateContext"

import type { AllDayLaneItem } from "@/hooks/cal-events/useMonthEventLayout"
import { useDeleteEvent } from "@/hooks/useDeleteEvent"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockStyle } from "@/lib/event-styles"
import { isUserOrganizer } from "@/lib/event-utils"
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
  const { setActiveEventId } = useCalEvents()
  const { calendars } = useCalendarState()
  const { triggerDelete, deleteDialogProps } = useDeleteEvent()

  const [contextOpen, setContextOpen] = useState(false)

  const color = item.color ?? "var(--primary)"
  const isDashed = isPending || isDeclined || isDraft
  const canDelete = isUserOrganizer(item.event, calendars)
  const highlighted = isActive || contextOpen

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        "text-xs truncate px-1 py-px cursor-default leading-4 hover:brightness-110",
        highlighted && "brightness-150",
        isDeclined && "line-through",
        isDraft && "opacity-60",
        item.isStart ? "rounded-l ml-px" : "-ml-px",
        item.isEnd ? "rounded-r mr-px" : "-mr-px",
      )}
      style={{
        gridColumn: `${item.startCol} / ${item.endCol}`,
        gridRow: item.lane + 1,
        ...getEventBlockStyle(color, highlighted, isDashed),
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
    <>
      <ContextMenu onOpenChange={setContextOpen}>
        <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => {
              setTimeout(() => {
                if (ref.current) {
                  setEventAnchor(ref.current)
                }
                setActiveEventId(item.event.id)
              })
            }}
          >
            Edit event
          </ContextMenuItem>
          {canDelete && (
            <ContextMenuItem variant="destructive" onClick={() => triggerDelete(item.event)}>
              Delete event
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <DeleteConfirmDialog {...deleteDialogProps} />
    </>
  )
}
