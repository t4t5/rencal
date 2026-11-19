import {
  cleanup,
  createMotion,
  effect,
  type InputRef,
  type JSX,
  keymap,
  Overlay,
  Scroll,
  signal,
  windowSize,
} from "nsh"

import { POPUP_SURFACE } from "@/components/ui/popover"

import { type CalendarEvent, eventKey } from "@/lib/cal-events"
import { EVENT_POPOVER_GAP, EVENT_POPOVER_PADDING, EVENT_POPOVER_WIDTH } from "@/lib/event-anchor"
import { inspectable } from "@/lib/inspect"
import { cn } from "@/lib/utils"

import { annotating } from "@/stores/annotate"
import { calendarCovered } from "@/stores/commands"
import { activeEvent, setActiveEventKey } from "@/stores/events"
import { noteDismissed, overlaysFocused, popoverAnchor } from "@/stores/popover"
import { requestSave } from "@/stores/recurrence"

import { EditEvent } from "./EditEvent"

/**
 * The box of both event popovers. They open at a place, not at a trigger, which
 * is `Overlay`'s `Bounds` anchor; `nsh/base`'s `Popover` needs a trigger element.
 */
export function EventPopup(props: {
  /** Its name and file, for annotate mode. */
  name: string
  source: string
  /** Where Tab from outside goes, as `data-popover-entry` was. */
  entry?: () => InputRef | null
  onDismiss: (reason: "pressOutside" | "cancel") => void
  children?: JSX.Element
}) {
  const motion = createMotion({ enter: "zoomIn", duration: 100 })
  // GTK's Tab order doesn't put the popover after the calendar's focus, and
  // reaches "More options" before the title: Tab from outside goes in here.
  effect(() => {
    const entry = props.entry?.()
    if (!entry || overlaysFocused() || calendarCovered()) return
    cleanup(keymap.bind("tab", () => entry.focus(), { when: "notEditing" }))
  })
  return (
    <Overlay
      ref={inspectable(props.name, props.source, { floating: true })}
      anchor={popoverAnchor()}
      placement="right"
      align="center"
      offset={EVENT_POPOVER_GAP}
      margin={EVENT_POPOVER_PADDING}
      class={cn(POPUP_SURFACE, "overflow-hidden shadow-2xl")}
      style={{ width: EVENT_POPOVER_WIDTH, maxHeight: windowSize().height * 0.8, ...motion.style }}
      // Annotate mode's layer is above it: its presses and Escape aren't leaving.
      onPressOutside={() => !annotating() && props.onDismiss("pressOutside")}
      onCancel={() => !annotating() && props.onDismiss("cancel")}
    >
      <Scroll class="min-h-0 shrink" scrollbar={false}>
        {props.children}
      </Scroll>
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
      {(event) => <EditPopup event={event} />}
    </Each>
  )
}

function EditPopup(props: { event: () => CalendarEvent }) {
  const summary = signal<InputRef | null>(null)
  return (
    <EventPopup
      name="Event popover"
      source="components/event-parts/PopoverEditEvent.tsx"
      entry={summary}
      onDismiss={(reason) => {
        if (reason === "pressOutside") noteDismissed(eventKey(props.event()))
        setActiveEventKey(null)
      }}
    >
      <EditEvent
        event={props.event()}
        summaryRef={(input) => summary.set(input)}
        onRequestSave={requestSave}
      />
    </EventPopup>
  )
}
