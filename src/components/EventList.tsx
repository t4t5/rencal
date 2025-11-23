import { DaySection } from "@/components/events/DaySection"

import { useFetchGoogleEvents } from "@/hooks/useFetchGoogleEvents"

export function EventList({ activeDate }: { activeDate: Date }) {
  const { events, isLoading } = useFetchGoogleEvents({
    activeDate,
  })

  if (isLoading) {
    return <div className="p-2 text-sm text-muted-foreground">Loading events...</div>
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div>
      <DaySection events={events.slice(0, 15)} />
      <DaySection events={events.slice(0, 15)} />
    </div>
  )
}
