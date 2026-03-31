import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react"

import { EditEvent } from "@/components/event-info/EditEvent"
import { FastSheet, FastSheetContent } from "@/components/ui/fast-sheet"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import type { CalendarEvent } from "@/rpc/bindings"

import { useBreakpoint } from "@/hooks/useBreakpoint"

interface EventPopoverProps {
  activeEvent: CalendarEvent | null
  setActiveEvent: Dispatch<SetStateAction<CalendarEvent | null>>
  popoverDismissedRef: MutableRefObject<boolean>
  inputRef: RefObject<HTMLInputElement | null>
  eventDetailRef: RefObject<HTMLDivElement | null>
  resultsRef: RefObject<HTMLDivElement | null>
  side?: "left" | "right"
}

export function EventPopover({
  activeEvent,
  setActiveEvent,
  popoverDismissedRef,
  inputRef,
  eventDetailRef,
  resultsRef,
  side = "right",
}: EventPopoverProps) {
  const isMd = useBreakpoint("md")

  if (!isMd) {
    return (
      <EventSheet
        activeEvent={activeEvent}
        setActiveEvent={setActiveEvent}
        eventDetailRef={eventDetailRef}
      />
    )
  }

  return (
    <Popover
      open={!!activeEvent}
      onOpenChange={(open) => {
        if (!open) {
          popoverDismissedRef.current = true
          setActiveEvent(null)
        }
      }}
    >
      <PopoverAnchor asChild>
        <div
          className="fixed pointer-events-none"
          ref={(el) => {
            if (!el) return
            const anchorEl = side === "left" ? resultsRef.current : inputRef.current
            if (!anchorEl) return
            const rect = anchorEl.getBoundingClientRect()
            el.style.top = `${rect.top + rect.height / 2}px`
            el.style.left = `${side === "left" ? rect.left : rect.right}px`
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        ref={eventDetailRef}
        className="w-[350px] max-h-[80vh] overflow-y-auto p-0 shadow-2xl"
        side={side}
        align="center"
        sideOffset={8}
        collisionPadding={16}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (resultsRef.current?.contains(e.target as Node)) {
            e.preventDefault()
          }
        }}
      >
        <EditEvent event={activeEvent} />
      </PopoverContent>
    </Popover>
  )
}

function EventSheet({
  activeEvent,
  setActiveEvent,
  eventDetailRef,
}: {
  activeEvent: CalendarEvent | null
  setActiveEvent: Dispatch<SetStateAction<CalendarEvent | null>>
  eventDetailRef: RefObject<HTMLDivElement | null>
}) {
  const isOpen = !!activeEvent
  const eventRef = useRef(activeEvent)

  if (activeEvent) {
    eventRef.current = activeEvent
  }

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
    <FastSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setActiveEvent(null)
        }
      }}
    >
      <FastSheetContent ref={eventDetailRef} open={isOpen}>
        {displayEvent && <EditEvent event={displayEvent} />}
      </FastSheetContent>
    </FastSheet>
  )
}
