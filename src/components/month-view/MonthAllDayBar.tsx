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
import { isUserOrganizer } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

type MonthAllDayBarProps = {
  item: AllDayLaneItem
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  onClick: () => void
}

export function MonthAllDayBar({
  item,
  isActive,
  isPending,
  isDeclined,
  onClick,
}: MonthAllDayBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { setActiveEventId } = useCalEvents()
  const { calendars } = useCalendarState()
  const { triggerDelete, deleteDialogProps } = useDeleteEvent()

  const [contextOpen, setContextOpen] = useState(false)

  const color = item.color ?? "var(--primary)"
  const canDelete = isUserOrganizer(item.event, calendars)
  const highlighted = isActive || contextOpen

  return (
    <>
      <ContextMenu onOpenChange={setContextOpen}>
        <ContextMenuTrigger asChild>
          <div
            ref={ref}
            data-event-clickable
            className={cn(
              "text-xs truncate px-1 py-px cursor-default leading-4 hover:brightness-110",
              highlighted && "brightness-150",
              (isPending || isDeclined) && "opacity-50",
              isDeclined && "line-through",
              item.isStart ? "rounded-l ml-px" : "-ml-px",
              item.isEnd ? "rounded-r mr-px" : "-mr-px",
            )}
            style={{
              gridColumn: `${item.startCol} / ${item.endCol}`,
              gridRow: item.lane + 1,
              backgroundColor: highlighted
                ? `color-mix(in srgb, ${color} 50%, black)`
                : `color-mix(in srgb, ${color} 30%, black)`,
              color: highlighted
                ? `color-mix(in srgb, ${color} 30%, white)`
                : `color-mix(in srgb, ${color} 70%, white)`,
            }}
            onClick={(e) => {
              e.stopPropagation()
              setEventAnchor(e.currentTarget)
              onClick()
            }}
          >
            {item.event.summary}
          </div>
        </ContextMenuTrigger>
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
