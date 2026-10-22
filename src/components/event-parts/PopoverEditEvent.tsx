import { useLayoutEffect, useMemo, useRef, useState } from "react"

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useRecurrenceEdit } from "@/contexts/RecurrenceEditContext"

import {
  EVENT_POPOVER_GAP,
  EVENT_POPOVER_PADDING,
  EVENT_POPOVER_WIDTH,
  fitPopoverAnchor,
  getEventAnchor,
} from "@/lib/event-anchor"

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
      const fitted = fitPopoverAnchor(rect)
      setAnchorRect(new DOMRect(fitted.left, fitted.top + fitted.height / 2, fitted.width, 0))
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
        className="max-h-[80vh] overflow-y-auto p-0 shadow-2xl"
        style={{ width: EVENT_POPOVER_WIDTH }}
        side="right"
        align="center"
        sideOffset={EVENT_POPOVER_GAP}
        collisionPadding={EVENT_POPOVER_PADDING}
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
