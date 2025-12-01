import { AllDayCheckbox } from "@/components/event-info/inputs/AllDayCheckbox"
import { CalendarSelect } from "@/components/event-info/inputs/CalendarSelect"
import { DateTimeSelect } from "@/components/event-info/inputs/DateTimeSelect"
import { LocationInput } from "@/components/event-info/inputs/LocationInput"
import { ReminderSelect } from "@/components/event-info/inputs/ReminderSelect"
import { Input } from "@/components/ui/input"

import { Calendar } from "@/db/types"

export function EventInfo({
  summary,
  onChangeSummary,
  start,
  onChangeStartDate,
  onChangeStartTime,
  end,
  onChangeEndDate,
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
  onChangeStartDate: (date: Date | null) => void
  onChangeStartTime: (time: string) => void
  end: Date
  onChangeEndDate: (date: Date | null) => void
  onChangeEndTime: (time: string) => void
  allDay: boolean
  onAllDayChange: (checked: boolean) => void
  location?: string | null
  onLocationChange: (location: string) => void
  calendar?: Calendar
  onCalendarChange: (calendarId: string) => void
}) {
  // className="text-lg outline-none! px-3 py-1 border border-transparent hover:border-border rounded-md"
  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Event Title"
        value={summary ?? ""}
        className="text-lg"
        onChange={(e) => onChangeSummary(e.target.value)}
      />

      <div className="flex flex-col gap-2">
        <DateTimeSelect
          start={start}
          end={end}
          allDay={allDay}
          onChangeStartDate={onChangeStartDate}
          onChangeStartTime={onChangeStartTime}
          onChangeEndDate={onChangeEndDate}
          onChangeEndTime={onChangeEndTime}
        />
        <AllDayCheckbox checked={allDay} onCheckedChange={onAllDayChange} />

        <div className="px-3">
          <hr />
        </div>

        <LocationInput value={location} onChange={onLocationChange} />

        <ReminderSelect />

        <CalendarSelect calendar={calendar} onChange={onCalendarChange} />
      </div>
    </div>
  )
}
