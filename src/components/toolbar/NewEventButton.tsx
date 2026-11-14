import { CommandTooltip } from "@/components/shortcuts/CommandTooltip"
import { Button } from "@/components/ui/button"

import { useCalEvents } from "@/contexts/CalEventsContext"
import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { useOpenDayDraft } from "@/hooks/useOpenDayDraft"
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"
import { getLastEventEndTime } from "@/lib/active-day-draft"
import { largestDayElement } from "@/lib/day-grid"

import { PlusIcon } from "@/icons/plus"

export const NEW_EVENT_BUTTON_EL_ID = "new-event-button"

// Stands in for the sidebar's compose button while the sidebar is hidden. It opens a new
// event on the selected day; if that day isn't on screen, it brings the sidebar back to
// compose there.
export function NewEventButton() {
  const { collapsed, setCollapsed } = useSidebarCollapse()
  const { activeDate } = useCalendarNavigation()
  const { calendarEvents } = useCalEvents()
  const { setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const openDayDraft = useOpenDayDraft()

  if (!collapsed) return null

  const newEvent = () => {
    if (!canCreate) {
      promptToConnect()
      return
    }
    const el = largestDayElement(activeDate)
    if (el) {
      openDayDraft(activeDate, el, { start: getLastEventEndTime(activeDate, calendarEvents) })
      return
    }
    setCollapsed(false)
    setDefaultDraftEvent()
    setIsDrafting(true)
  }

  return (
    <CommandTooltip text="Create new event" action="event.new">
      <Button
        id={NEW_EVENT_BUTTON_EL_ID}
        aria-label="Create new event"
        tabIndex={-1}
        size="icon"
        variant="ghost"
        onClick={newEvent}
      >
        <PlusIcon className="size-4" />
      </Button>
    </CommandTooltip>
  )
}
