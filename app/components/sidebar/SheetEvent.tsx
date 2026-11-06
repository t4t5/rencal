import { Scroll } from "nsh"
import { Sheet } from "nsh/base"

import { EditEvent } from "@/components/event-parts/EditEvent"

import { eventKey } from "@/lib/cal-events"

import { activeEvent, setActiveEventKey } from "@/stores/events"
import { requestSave } from "@/stores/recurrence"

/** The narrow window's event: a sheet from the right, in place of the popover. */
export function SheetEvent() {
  const shown = () => {
    const event = activeEvent()
    return event ? [event] : []
  }
  return (
    <Sheet
      open={!!activeEvent()}
      side="right"
      onOpenChange={(event) => {
        if (!event.open) setActiveEventKey(null)
      }}
      backdropClass="bg-overlay"
      popupClass="w-3/4 max-w-sm border-l border-border bg-background shadow-lg"
    >
      <Scroll class="flex-1 min-h-0">
        <Each of={shown()} key={eventKey}>
          {(event) => <EditEvent event={event()} onRequestSave={requestSave} />}
        </Each>
      </Scroll>
    </Sheet>
  )
}
