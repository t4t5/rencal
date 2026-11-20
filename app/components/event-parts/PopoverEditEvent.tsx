import {
  cleanup,
  createMotion,
  effect,
  type JSX,
  keymap,
  Overlay,
  Scroll,
  signal,
  untracked,
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
import { PopupStops, STOP_PLACE, type Stop } from "./popup-stops"

/**
 * The box of both event popovers. They open at a place, not at a trigger, which
 * is `Overlay`'s `Bounds` anchor; `nsh/base`'s `Popover` needs a trigger element.
 */
export function EventPopup(props: {
  /** Its name and file, for annotate mode. */
  name: string
  source: string
  onDismiss: (reason: "pressOutside" | "cancel") => void
  children?: JSX.Element
}) {
  const motion = createMotion({ enter: "zoomIn", duration: 100 })
  const stops = signal<{ place: number; stop: Stop }[]>([])
  const focused = signal<number | null>(null)
  const registry: PopupStops = {
    add: (place, stop) => {
      untracked(() => stops.update((list) => [...list, { place, stop }]))
      return () =>
        untracked(() => {
          stops.update((list) => list.filter((entry) => entry.stop !== stop))
          if (focused() === place) focused.set(null)
        })
    },
    setFocused: (place, on) =>
      untracked(() => {
        if (on) focused.set(place)
        else if (focused() === place) focused.set(null)
      }),
  }
  // GTK's Tab order doesn't put the popover after the calendar's focus, reaches
  // "More options" before the title, and leaves the popover at either end: Tab
  // from outside goes to the title, Shift+Tab to the end, and both wrap round.
  effect(() => {
    const list = [...stops()].sort((a, b) => a.place - b.place)
    const first = list[0]
    const last = list[list.length - 1]
    if (!first || !last || calendarCovered()) return
    if (!overlaysFocused()) {
      const entry = list.find((entry) => entry.place === STOP_PLACE.title) ?? first
      cleanup(
        keymap.bind(
          { tab: () => entry.stop.focus(), "shift+tab": () => last.stop.focus() },
          { when: "notEditing" },
        ),
      )
      return
    }
    const at = focused()
    const keys: Record<string, () => void> = {}
    if (at === first.place) keys["shift+tab"] = () => last.stop.focus()
    if (at === last.place) keys.tab = () => first.stop.focus()
    if (Object.keys(keys).length) cleanup(keymap.bind(keys, { when: "always" }))
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
        <PopupStops.Provider value={registry}>{props.children}</PopupStops.Provider>
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
  return (
    <EventPopup
      name="Event popover"
      source="components/event-parts/PopoverEditEvent.tsx"
      onDismiss={(reason) => {
        if (reason === "pressOutside") noteDismissed(eventKey(props.event()))
        setActiveEventKey(null)
      }}
    >
      <EditEvent event={props.event()} onRequestSave={requestSave} />
    </EventPopup>
  )
}
