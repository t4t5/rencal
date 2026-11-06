import { effect, type InputRef } from "nsh"

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
  let summary: InputRef | undefined
  setTimeout(() => summary?.focus(), 0)
  return (
    <EventPopup onDismiss={closeDraftPopover}>
      <ComposeEventInner summaryRef={(ref) => (summary = ref)} onCreated={closeDraftPopover} />
    </EventPopup>
  )
}
