import { ReactNode } from "react"

import { AllDaySection } from "@/components/event-info/AllDaySection"
import { LocationSection } from "@/components/event-info/LocationSection"
import { TimeSection } from "@/components/event-info/TimeSection"

import { Calendar } from "@/db/types"

import { CalendarItem } from "../settings/CalendarItem"

export function EventInfo({
  summary,
  onChangeSummary,
  start,
  onChangeStartTime,
  end,
  onChangeEndTime,
  allDay,
  onAllDayChange,
  children,
  location,
  onLocationChange,
  calendar,
}: {
  summary?: string | null
  onChangeSummary: (summary: string) => void
  start: Date
  onChangeStartTime: (time: string) => void
  end: Date
  onChangeEndTime: (time: string) => void
  allDay: boolean
  onAllDayChange: (checked: boolean) => void
  children?: ReactNode
  location?: string | null
  onLocationChange: (location: string) => void
  calendar?: Calendar
}) {
  return (
    <div className="flex flex-col gap-4">
      <input
        value={summary ?? ""}
        className="text-lg outline-none!"
        onChange={(e) => onChangeSummary(e.target.value)}
      />

      <div className="flex flex-col gap-4">
        <TimeSection
          start={start}
          end={end}
          allDay={allDay}
          onChangeStartTime={onChangeStartTime}
          onChangeEndTime={onChangeEndTime}
        />
        <AllDaySection checked={allDay} onCheckedChange={onAllDayChange} />

        <hr />

        <LocationSection value={location} onChange={onLocationChange} />

        {!!calendar && <CalendarItem calendar={calendar} />}
      </div>

      {children}
    </div>
  )
}
