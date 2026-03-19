import { format } from "date-fns"
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

import type { WeekTimedEventLayout } from "@/hooks/cal-events/useWeekEventLayout"
import { useDeleteEvent } from "@/hooks/useDeleteEvent"
import { setEventAnchor } from "@/lib/event-anchor"
import { getEventBlockStyle } from "@/lib/event-styles"
import { isUserOrganizer } from "@/lib/event-utils"
import { cn } from "@/lib/utils"

type WeekTimedEventProps = {
  layout: WeekTimedEventLayout
  isActive: boolean
  isPending: boolean
  isDeclined: boolean
  isDraft: boolean
  onClick: () => void
}

export function WeekTimedEvent({
  layout,
  isActive,
  isPending,
  isDeclined,
  isDraft,
  onClick,
}: WeekTimedEventProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { setActiveEventId } = useCalEvents()
  const { calendars } = useCalendarState()
  const { triggerDelete, deleteDialogProps } = useDeleteEvent()

  const [contextOpen, setContextOpen] = useState(false)

  const color = layout.color ?? "var(--primary)"
  const widthPercent = 100 / layout.totalColumns
  const leftPercent = layout.column * widthPercent
  const isDashed = isPending || isDeclined || isDraft
  const canDelete = isUserOrganizer(layout.event, calendars)
  const highlighted = isActive || contextOpen

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        "absolute overflow-hidden rounded px-1 py-0.5 text-xs cursor-default hover:brightness-110",
        !isDashed && "pl-2",
        highlighted && "brightness-150",
        isDeclined && "line-through",
        isDraft && "opacity-60",
      )}
      style={{
        top: `${layout.top}%`,
        height: `max(${layout.height}%, 2.125rem)`,
        left: `${leftPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
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
      {!isDashed && (
        <div
          className="w-[3px] absolute left-0 top-0 bottom-0"
          style={{ backgroundColor: color }}
        />
      )}

      <div className="truncate font-medium leading-tight">{layout.event.summary}</div>
      <div className="truncate opacity-80 leading-tight">
        {format(layout.event.start, "HH:mm")} – {format(layout.event.end, "HH:mm")}
      </div>
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
                setActiveEventId(layout.event.id)
              })
            }}
          >
            Edit event
          </ContextMenuItem>
          {canDelete && (
            <ContextMenuItem variant="destructive" onClick={() => triggerDelete(layout.event)}>
              Delete event
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <DeleteConfirmDialog {...deleteDialogProps} />
    </>
  )
}
