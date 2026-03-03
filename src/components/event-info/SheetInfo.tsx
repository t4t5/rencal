import { useDeferredValue } from "react"

import { EditEvent } from "@/components/event-info/EditEvent"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

import { useCalEvents } from "@/contexts/CalEventsContext"

export function SheetEvent() {
  const { activeEvent, setActiveEventId } = useCalEvents()
  const deferredEvent = useDeferredValue(activeEvent)

  return (
    <Sheet open={!!activeEvent} onOpenChange={() => setActiveEventId(null)}>
      <SheetContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetTitle className="hidden">{activeEvent?.summary}</SheetTitle>
        <SheetDescription className="hidden">{activeEvent?.summary}</SheetDescription>
        {deferredEvent && <EditEvent event={deferredEvent} />}
      </SheetContent>
    </Sheet>
  )
}
