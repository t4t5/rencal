import { useEffect, useRef } from "react"

import { EditEvent } from "@/components/event-info/EditEvent"
import { FastSheet, FastSheetContent } from "@/components/ui/fast-sheet"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { DragRegion } from "../ui/drag-region"

export function SheetEvent() {
  const { activeEvent, setActiveEventId } = useCalEvents()
  const isOpen = !!activeEvent
  const eventRef = useRef(activeEvent)

  // Keep a ref to the last non-null event so we can render it during the
  // close transition (the panel slides out with content still visible).
  if (activeEvent) {
    eventRef.current = activeEvent
  }

  // Clear the stale ref after the close transition finishes
  useEffect(() => {
    if (!isOpen) {
      const id = setTimeout(() => {
        eventRef.current = null
      }, 150)
      return () => clearTimeout(id)
    }
  }, [isOpen])

  const displayEvent = activeEvent ?? eventRef.current

  return (
    <FastSheet open={isOpen} onOpenChange={() => setActiveEventId(null)}>
      <FastSheetContent open={isOpen}>
        {displayEvent && (
          <EditEvent event={displayEvent}>
            <DragRegion className="h-7 grow" />
          </EditEvent>
        )}
      </FastSheetContent>
    </FastSheet>
  )
}
