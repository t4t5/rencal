import { Temporal } from "@js-temporal/polyfill"
import { useMemo } from "react"

import { BoardColumn } from "@/components/main/board-view/BoardColumn"

import { useCalEvents } from "@/contexts/CalEventsContext"

import { type CalendarEvent } from "@/lib/cal-events"
import { dateInViewerZone } from "@/lib/event-time"
import { getLocalTzid } from "@/lib/event-time/local-zone"

interface Bucket {
  id: string
  title: string
  events: CalendarEvent[]
  showDate: boolean
  isToday: boolean
}

function eventDateKey(event: CalendarEvent): string {
  const pd = dateInViewerZone(event.start)
  return pd.toString()
}

export function BoardView() {
  const { calendarEvents } = useCalEvents()

  const columns = useMemo(() => {
    const today = Temporal.Now.zonedDateTimeISO(getLocalTzid()).toPlainDate()
    const yesterday = today.subtract({ days: 1 })
    const tomorrow = today.add({ days: 1 })

    const dayOfWeek = today.dayOfWeek
    const daysUntilSunday = 7 - dayOfWeek
    const endOfWeek = today.add({ days: daysUntilSunday })

    function getBucketId(pd: Temporal.PlainDate): string {
      if (pd.equals(yesterday)) return "yesterday"
      if (pd.equals(today)) return "today"
      if (pd.equals(tomorrow)) return "tomorrow"
      if (
        Temporal.PlainDate.compare(pd, tomorrow) > 0 &&
        Temporal.PlainDate.compare(pd, endOfWeek) <= 0
      )
        return "this-week"
      return "past"
    }

    const bucketDefs: Record<string, { title: string; showDate: boolean; isToday: boolean }> = {
      yesterday: { title: "Yesterday", showDate: false, isToday: false },
      today: { title: "Today", showDate: false, isToday: true },
      tomorrow: { title: "Tomorrow", showDate: false, isToday: false },
      "this-week": { title: "This Week", showDate: true, isToday: false },
    }

    const buckets = new Map<string, CalendarEvent[]>()

    for (const event of calendarEvents) {
      const pd = dateInViewerZone(event.start)
      const bucketId = getBucketId(pd)
      if (bucketId === "past") continue

      const group = buckets.get(bucketId)
      if (group) {
        group.push(event)
      } else {
        buckets.set(bucketId, [event])
      }
    }

    const orderedIds = ["yesterday", "today", "tomorrow", "this-week"]

    return orderedIds.map((id) => {
      const def = bucketDefs[id]
      const events = buckets.get(id) ?? []
      if (id === "this-week") {
        events.sort((a, b) => {
          const aKey = eventDateKey(a)
          const bKey = eventDateKey(b)
          if (aKey !== bKey) return aKey < bKey ? -1 : 1
          return a.dateInfo.startMs - b.dateInfo.startMs
        })
      }
      return {
        id,
        title: def.title,
        events,
        showDate: def.showDate,
        isToday: def.isToday,
      } satisfies Bucket
    })
  }, [calendarEvents])

  return (
    <div className="flex h-full overflow-hidden">
      {columns.map((col, i) => (
        <BoardColumn
          key={col.id}
          title={col.title}
          events={col.events}
          showDate={col.showDate}
          isToday={col.isToday}
          isLast={i === columns.length - 1}
        />
      ))}
    </div>
  )
}
