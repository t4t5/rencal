import { useLayoutEffect, useMemo, useRef, useState } from "react"

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useRecurrenceEdit } from "@/contexts/RecurrenceEditContext"

import { getEventAnchor } from "@/lib/event-anchor"

import { EditEvent } from "./EditEvent"
import { useEventPopoverTabTrap } from "./useEventPopoverTabTrap"

export function PopoverEditEvent() {
  const { activeEvent, setActiveEventKey } = useCalEvents()
  const { requestSave } = useRecurrenceEdit()
  const contentRef = useRef<HTMLDivElement>(null)
  const [anchorRect, setAnchorRect] = useState(() => new DOMRect())
  // A new virtual reference explicitly triggers positioning. Moving the old
  // zero-height DOM anchor can go unnoticed by Radix's resize observer.
  const anchorRef = useMemo(
    () => ({ current: { getBoundingClientRect: () => anchorRect } }),
    [anchorRect],
  )

  useLayoutEffect(() => {
    if (!activeEvent) return

    const rect = getEventAnchor()?.getBoundingClientRect()
    if (rect) {
      setAnchorRect(new DOMRect(rect.left, rect.top + rect.height / 2, rect.width, 0))
    }
  }, [activeEvent])

  useEventPopoverTabTrap({ enabled: !!activeEvent, contentRef })

  return (
    <Popover
      open={!!activeEvent}
      onOpenChange={(open) => {
        if (!open) setActiveEventKey(null)
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        ref={contentRef}
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
        <EditEvent event={activeEvent} onRequestSave={requestSave} />
      </PopoverContent>
    </Popover>
  )
}
