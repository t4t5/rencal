import { AllDayCheckbox } from "@/components/event-info/inputs/AllDayCheckbox"
import { CalendarSelect } from "@/components/event-info/inputs/CalendarSelect"
import { DateTimeSelect } from "@/components/event-info/inputs/DateTimeSelect"
import { LocationInput } from "@/components/event-info/inputs/LocationInput"

import { Calendar } from "@/db/types"

export function EventInfo({
  summary,
  onChangeSummary,
  start,
  onChangeStartTime,
  end,
  onChangeEndTime,
  allDay,
  onAllDayChange,
  location,
  onLocationChange,
  calendar,
  onCalendarChange,
}: {
  summary?: string | null
  onChangeSummary: (summary: string) => void
  start: Date
  onChangeStartTime: (time: string) => void
  end: Date
  onChangeEndTime: (time: string) => void
  allDay: boolean
  onAllDayChange: (checked: boolean) => void
  location?: string | null
  onLocationChange: (location: string) => void
  calendar?: Calendar
  onCalendarChange: (calendarId: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <input
        value={summary ?? ""}
        className="text-lg outline-none! px-3 py-1 border border-transparent hover:border-border rounded-md"
        onChange={(e) => onChangeSummary(e.target.value)}
      />

      <div className="flex flex-col gap-2">
        <DateTimeSelect
          start={start}
          end={end}
          allDay={allDay}
          onChangeStartTime={onChangeStartTime}
          onChangeEndTime={onChangeEndTime}
        />
        <AllDayCheckbox checked={allDay} onCheckedChange={onAllDayChange} />

        <div className="px-3">
          <hr />
        </div>

        <LocationInput value={location} onChange={onLocationChange} />

        <CalendarSelect calendar={calendar} onChange={onCalendarChange} />
      </div>
    </div>
  )
}
