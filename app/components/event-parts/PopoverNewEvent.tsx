import { effect } from "nsh"

import { closeDraftPopover, draftPopoverOpen } from "@/stores/draft"
import { activeEvent } from "@/stores/events"

import { ComposeEventInner } from "./ComposeEvent"
import { EventPopup } from "./PopoverEditEvent"

export function PopoverNewEvent() {
  // Only one of the two popovers shows.
  effect(() => {
    if (activeEvent() && draftPopoverOpen()) closeDraftPopover()
  })

  return (
    <If when={draftPopoverOpen()}>
      <NewEventPopup />
    </If>
  )
}

function NewEventPopup() {
  return (
    <EventPopup
      name="New event popover"
      source="components/event-parts/PopoverNewEvent.tsx"
      onDismiss={closeDraftPopover}
    >
      <ComposeEventInner autoFocusSummary onCreated={closeDraftPopover} />
    </EventPopup>
  )
}
