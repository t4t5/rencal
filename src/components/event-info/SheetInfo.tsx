import { EditEvent } from "@/components/event-info/EditEvent"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

import { useCalEvents } from "@/contexts/CalEventsContext"

export function SheetEvent() {
  const { activeEvent, setActiveEventId } = useCalEvents()

  return (
    <Sheet open={!!activeEvent} onOpenChange={() => setActiveEventId(null)}>
      <SheetContent>
        <SheetTitle className="hidden">{activeEvent?.summary}</SheetTitle>
        <SheetDescription className="hidden">{activeEvent?.summary}</SheetDescription>
        <EditEvent event={activeEvent} />
      </SheetContent>
    </Sheet>
  )
}
