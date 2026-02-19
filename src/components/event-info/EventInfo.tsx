import { RRule, RRuleSet } from "rrule"

import { AllDayCheckbox } from "@/components/event-info/inputs/AllDayCheckbox"
import { CalendarSelect } from "@/components/event-info/inputs/CalendarSelect"
import { DateTimeSelect } from "@/components/event-info/inputs/DateTimeSelect"
import { LocationInput } from "@/components/event-info/inputs/LocationInput"
import { ReminderSelect } from "@/components/event-info/inputs/ReminderSelect"
import { RepeatSelect } from "@/components/event-info/inputs/RepeatSelect"
import { Textarea } from "@/components/ui/textarea"

import { Calendar } from "@/rpc/bindings"

import { NotesInput } from "./inputs/NotesInput"

const Divider = () => (
  <div className="my-2 px-3">
    <hr />
  </div>
)

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
  recurrence,
  onRecurrenceChange,
  description,
  onDescriptionChange,
  reminders,
  onReminderAdd,
  onReminderRemove,
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
  recurrence: RRule | RRuleSet | null
  onRecurrenceChange: (recurrence: RRule | RRuleSet | null) => void
  calendar?: Calendar
  onCalendarChange: (calendarId: string) => void
  description?: string | null
  onDescriptionChange: (description: string) => void
  reminders?: number[]
  onReminderAdd: (mins: number) => void
  onReminderRemove: (mins: number) => void
}) {
  return (
    <div className="flex flex-col gap-2 grow">
      <Textarea
        placeholder="Event Title"
        value={summary ?? ""}
        className="text-lg"
        onChange={(e) => onChangeSummary(e.target.value)}
      />

      <div className="flex flex-col gap-1">
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

        <RepeatSelect value={recurrence} onChange={onRecurrenceChange} />

        <Divider />

        <LocationInput value={location} onChange={onLocationChange} />

        <ReminderSelect
          reminders={reminders ?? []}
          onSelect={onReminderAdd}
          onRemove={onReminderRemove}
        />

        <Divider />

        <CalendarSelect calendar={calendar} onChange={onCalendarChange} />

        <NotesInput value={description} onChange={onDescriptionChange} />
      </div>
    </div>
  )
}
