import { format } from "date-fns"
import { useEffect } from "react"

import { DaySection } from "@/components/events/DaySection"

import { useCalendar } from "@/contexts/CalendarContext"
import { useFetchGoogleEvents } from "@/hooks/useFetchGoogleEvents"

import { useGroupedEvents } from "./useGroupedEvents"
import { useJumpToScrolledDate } from "./useJumpToScrolledDate"

export function EventList() {
  const { activeDate, setActiveDate } = useCalendar()

  const { events, isLoading } = useFetchGoogleEvents({
    activeDate,
  })

  const { eventsByDate, datesWithEvents } = useGroupedEvents({ events })

  const { scrollContainerRef, addSectionRef, sectionRefs } = useJumpToScrolledDate({
    onSetActiveDate: setActiveDate,
    datesWithEvents,
  })

  // Scroll to currently active date as soon as events have loaded:
  useEffect(() => {
    if (!sectionRefs.current) return

    const section = sectionRefs.current.get(format(activeDate, "yyyy-MM-dd"))
    if (!section) return

    section.scrollIntoView({ behavior: "instant", block: "start" })
  }, [eventsByDate])

  if (isLoading) {
    return <div className="p-2 text-sm text-muted-foreground">Loading events...</div>
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div ref={scrollContainerRef} className="grow overflow-auto flex-col gap-6">
      {eventsByDate.map(({ date, events }) => {
        const dateStr = format(date, "yyyy-MM-dd")

        return (
          <DaySection
            key={date.toISOString()}
            ref={(el) => {
              if (!el) return
              addSectionRef(dateStr, el)
            }}
            events={events}
            date={date}
          />
        )
      })}
    </div>
  )
}
