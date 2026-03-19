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

import type { TimedEventItem } from "@/hooks/cal-events/useMonthEventLayout"
import { useDeleteEvent } from "@/hooks/useDeleteEvent"
import { setEventAnchor } from "@/lib/event-anchor"
import { isUserOrganizer } from "@/lib/event-utils"
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
  const { setActiveEventId } = useCalEvents()
  const { calendars } = useCalendarState()
  const { triggerDelete, deleteDialogProps } = useDeleteEvent()

  const [contextOpen, setContextOpen] = useState(false)

  const canDelete = isUserOrganizer(item.event, calendars)
  const highlighted = isActive || contextOpen

  const inner = (
    <div
      ref={ref}
      data-event-clickable={!isDraft || undefined}
      className={cn(
        "flex items-center gap-1 text-xs truncate cursor-default px-0.5 hover:bg-hoverBg rounded shrink-0",
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
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: item.color ?? "var(--primary)" }}
      />
      <span className="truncate">{item.event.summary}</span>
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
