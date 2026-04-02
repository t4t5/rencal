import type { ReactNode, RefObject } from "react"

import { DeleteConfirmDialog } from "@/components/event-info/DeleteConfirmDialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import type { CalendarEvent } from "@/rpc/bindings"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"

import { useDeleteEvent } from "@/hooks/useDeleteEvent"
import { setEventAnchor } from "@/lib/event-anchor"
import { isUserOrganizer } from "@/lib/event-utils"

type EventContextMenuProps = {
  event: CalendarEvent
  anchorRef: RefObject<HTMLElement | null>
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function EventContextMenu({
  event,
  anchorRef,
  onOpenChange,
  children,
}: EventContextMenuProps) {
  const { setActiveEventId } = useCalEvents()
  const { calendars } = useCalendars()
  const { triggerDelete, deleteDialogProps } = useDeleteEvent()

  const canDelete = isUserOrganizer(event, calendars)

  return (
    <>
      <ContextMenu onOpenChange={onOpenChange} modal={false}>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => {
              setTimeout(() => {
                if (anchorRef.current) {
                  setEventAnchor(anchorRef.current)
                }
                setActiveEventId(event.id)
              })
            }}
          >
            Edit event
          </ContextMenuItem>
          {canDelete && (
            <ContextMenuItem variant="destructive" onClick={() => triggerDelete(event)}>
              Delete event
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <DeleteConfirmDialog {...deleteDialogProps} />
    </>
  )
}
