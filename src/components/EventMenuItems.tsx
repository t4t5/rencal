import { t } from "@lingui/core/macro"

import { ContextMenuItem, ContextMenuShortcut } from "@/components/ui/context-menu"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendars } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useDeleteEvent } from "@/contexts/DeleteEventContext"
import { useDuplicateEvent } from "@/contexts/DuplicateEventContext"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { type PopoverAnchor, setEventAnchor } from "@/lib/event-anchor"
import { isEventReadonly } from "@/lib/event-utils"

/** The context menu's items for `event`; popovers they open sit beside `anchor`. */
export function EventMenuItems({ event, anchor }: { event: CalendarEvent; anchor: PopoverAnchor }) {
  const { setActiveEventKey } = useCalEvents()
  const { calendars } = useCalendars()
  const { canCreate } = useCreateEventGate()
  const { triggerDelete } = useDeleteEvent()
  const { triggerDuplicate } = useDuplicateEvent()

  const canDelete = !isEventReadonly(event, calendars)
  const canDuplicate = canCreate && !isEventReadonly(event, calendars)

  return (
    <>
      <ContextMenuItem
        onClick={() => {
          setTimeout(() => {
            setEventAnchor(anchor)
            setActiveEventKey(eventKey(event))
          })
        }}
      >
        {t`Edit event`}
      </ContextMenuItem>
      {canDuplicate && (
        <ContextMenuItem onClick={() => triggerDuplicate(event, anchor)}>
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
    </>
  )
}
