import { UntitledEventText } from "@/components/ui/untitled-event-text"

import type { CalendarEvent } from "@/lib/cal-events"

export const AgendaAllDayEventBlock = ({ event }: { event: CalendarEvent }) => (
  <span data-slot="calendar-event-title">{event.summary || <UntitledEventText />}</span>
)
