import { createMotion, type JSX, Overlay, Scroll, windowSize } from "nsh"

import { POPUP_SURFACE } from "@/components/ui/popover"

import { eventKey } from "@/lib/cal-events"
import { EVENT_POPOVER_GAP, EVENT_POPOVER_PADDING, EVENT_POPOVER_WIDTH } from "@/lib/event-anchor"
import { cn } from "@/lib/utils"

import { activeEvent, setActiveEventKey } from "@/stores/events"
import { noteDismissed, popoverAnchor } from "@/stores/popover"
import { requestSave } from "@/stores/recurrence"

import { EditEvent } from "./EditEvent"

/**
 * The box of both event popovers. They open at a place, not at a trigger, which
 * is `Overlay`'s `Bounds` anchor; `nsh/base`'s `Popover` needs a trigger element.
 */
export function EventPopup(props: {
  onDismiss: (reason: "pressOutside" | "cancel") => void
  children?: JSX.Element
}) {
  const motion = createMotion({ enter: "zoomIn", duration: 100 })
  return (
    <Overlay
      anchor={popoverAnchor()}
      placement="right"
      align="center"
      offset={EVENT_POPOVER_GAP}
      margin={EVENT_POPOVER_PADDING}
      class={cn(POPUP_SURFACE, "overflow-hidden shadow-2xl")}
      style={{ width: EVENT_POPOVER_WIDTH, maxHeight: windowSize().height * 0.8, ...motion.style }}
      onPressOutside={() => props.onDismiss("pressOutside")}
      onCancel={() => props.onDismiss("cancel")}
    >
      <Scroll class="min-h-0 shrink">{props.children}</Scroll>
    </Overlay>
  )
}

export function PopoverEditEvent() {
  const shown = () => {
    const event = activeEvent()
    return event ? [event] : []
  }
  return (
    <Each of={shown()} key={eventKey}>
      {(event) => (
        <EventPopup
          onDismiss={(reason) => {
            if (reason === "pressOutside") noteDismissed(eventKey(event()))
            setActiveEventKey(null)
          }}
        >
          <EditEvent event={event()} onRequestSave={requestSave} />
        </EventPopup>
      )}
    </Each>
  )
}
