import { useLayoutEffect, useRef, useState } from "react"

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { getEventAnchor } from "@/lib/event-anchor"

import { EditEvent } from "./EditEvent"

export function PopoverEditEvent() {
  const { activeEvent, setActiveEventId } = useCalEvents()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useLayoutEffect(() => {
    if (!activeEvent) return

    const el = getEventAnchor()
    if (!el) return

    const rect = el.getBoundingClientRect()
    setPos({ top: rect.top + rect.height / 2, left: rect.left, width: rect.width })
  }, [activeEvent])

  return (
    <Popover
      open={!!activeEvent}
      onOpenChange={(open) => {
        if (!open) setActiveEventId(null)
      }}
    >
      <PopoverAnchor
        ref={anchorRef}
        className="fixed pointer-events-none"
        style={{ top: pos.top, left: pos.left, width: pos.width, height: 0 }}
      />
      <PopoverContent
        className="w-[350px] max-h-[80vh] overflow-y-auto p-0 shadow-2xl"
        side="right"
        align="center"
        sideOffset={8}
        collisionPadding={16}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          // If the click landed on an event element, let that element's
          // toggle handler manage the popover instead of auto-dismissing.
          const target = e.target as HTMLElement
          if (target.closest("[data-event-clickable]")) {
            e.preventDefault()
          } else {
            // Swallow the click so it doesn't reach underlying elements
            // (e.g. day cells in the month view that would trigger navigation).
            window.addEventListener(
              "click",
              (ev) => {
                ev.stopPropagation()
                ev.preventDefault()
              },
              { capture: true, once: true },
            )
          }
        }}
        onFocusOutside={(e) => {
          // Never dismiss the popover due to focus moving elsewhere —
          // onPointerDownOutside and Escape already handle intentional closes.
          e.preventDefault()
        }}
      >
        <EditEvent event={activeEvent} />
      </PopoverContent>
    </Popover>
  )
}
