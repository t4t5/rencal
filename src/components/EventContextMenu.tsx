import { t } from "@lingui/core/macro"
import type { ReactNode, RefObject } from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useDeleteEvent } from "@/contexts/DeleteEventContext"
import { useDuplicateEvent } from "@/contexts/DuplicateEventContext"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { setEventAnchor } from "@/lib/event-anchor"
import { isEventReadonly } from "@/lib/event-utils"

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
  const { setActiveEventKey } = useCalEvents()
  const { calendars } = useCalendars()
  const { canCreate } = useCreateEventGate()
  const { triggerDelete } = useDeleteEvent()
  const { triggerDuplicate } = useDuplicateEvent()

  const canDelete = !isEventReadonly(event, calendars)
  const canDuplicate = canCreate && !isEventReadonly(event, calendars)

  return (
    <ContextMenu onOpenChange={onOpenChange} modal={false}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            setTimeout(() => {
              if (anchorRef.current) {
                setEventAnchor(anchorRef.current)
              }
              setActiveEventKey(eventKey(event))
            })
          }}
        >
          {t`Edit event`}
        </ContextMenuItem>
        {canDuplicate && (
          <ContextMenuItem onClick={() => triggerDuplicate(event, anchorRef.current)}>
            {t`Duplicate event`}
            {/* eslint-disable-next-line lingui/no-unlocalized-strings -- keyboard key */}
            <ContextMenuShortcut>D</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {canDelete && (
          <ContextMenuItem variant="destructive" onClick={() => triggerDelete(event)}>
            {t`Delete event`}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
