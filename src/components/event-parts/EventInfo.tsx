import { RRule, RRuleSet } from "rrule"

import { AllDayCheckbox } from "@/components/event-parts/inputs/AllDayCheckbox"
import { AttendeesDisplay } from "@/components/event-parts/inputs/AttendeesDisplay"
import { CalendarSelect } from "@/components/event-parts/inputs/CalendarSelect"
import { ConferenceLink } from "@/components/event-parts/inputs/ConferenceLink"
import { DateTimeSelect, type DateTimeRange } from "@/components/event-parts/inputs/DateTimeSelect"
import { LocationInput } from "@/components/event-parts/inputs/LocationInput"
import { ReminderSelect } from "@/components/event-parts/inputs/ReminderSelect"
import { RepeatSelect } from "@/components/event-parts/inputs/RepeatSelect"
import { Textarea } from "@/components/ui/textarea"

import type { Calendar, EventAttendee, ResponseStatus } from "@/rpc/bindings"

import { cn } from "@/lib/utils"

import { NotesInput } from "./inputs/NotesInput"
import { RsvpBar } from "./inputs/RsvpBar"
import { RsvpSelect } from "./inputs/RsvpSelect"

const Divider = () => (
  <div className="my-2 px-3">
    <hr />
  </div>
)

export function EventInfo({
  readonly,
  summaryRef,
  summary,
  onChangeSummary,
  start,
  end,
  onChangeDateTime,
  allDay,
  onAllDayChange,
  showTime,
  location,
  onLocationChange,
  calendar,
  onCalendarChange,
  recurrence,
  onRecurrenceChange,
  description,
  onDescriptionChange,
  organizer,
  attendees,
  conferenceUrl,
  reminders,
  onReminderAdd,
  onReminderRemove,
  onRsvp,
  userResponseStatus,
  isPendingInvite,
  onClose,
}: {
  readonly?: boolean
  summaryRef?: React.Ref<HTMLTextAreaElement>
  summary?: string | null
  onChangeSummary: (summary: string) => void
  onClose?: () => void
  start: Date
  end: Date
  onChangeDateTime: (range: DateTimeRange) => void
  allDay: boolean
  onAllDayChange: (checked: boolean) => void
  location?: string | null
  onLocationChange: (location: string) => void
  recurrence: RRule | RRuleSet | null
  onRecurrenceChange: (recurrence: RRule | RRuleSet | null) => void
  calendar?: Calendar
  onCalendarChange: (calendarId: string) => void
  showTime?: boolean
  description?: string | null
  onDescriptionChange: (description: string) => void
  organizer?: EventAttendee | null
  attendees?: EventAttendee[]
  conferenceUrl?: string | null
  reminders?: number[]
  onReminderAdd: (mins: number) => void
  onReminderRemove: (mins: number) => void
  onRsvp?: (response: ResponseStatus) => void
  userResponseStatus?: ResponseStatus | null
  isPendingInvite?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 grow">
      <Textarea
        ref={summaryRef}
        placeholder="Event Title"
        value={summary ?? ""}
        className={cn("text-lg", readonly && "hover:border-transparent! focus:bg-transparent!")}
        readOnly={readonly}
        onChange={(e) => onChangeSummary(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            onClose?.()
          }
        }}
      />

      <div className="flex flex-col gap-1">
        <LocationInput
          value={location}
          onChange={onLocationChange}
          onClose={onClose}
          readOnly={readonly}
        />

        <DateTimeSelect
          start={start}
          end={end}
          allDay={allDay}
          showTime={showTime}
          readOnly={readonly}
          onChange={onChangeDateTime}
          onClose={onClose}
        />
        <AllDayCheckbox checked={allDay} onCheckedChange={onAllDayChange} readOnly={readonly} />

        <RepeatSelect value={recurrence} onChange={onRecurrenceChange} readOnly={readonly} />

        {conferenceUrl && <ConferenceLink url={conferenceUrl} />}
        <AttendeesDisplay organizer={organizer} attendees={attendees} />

        {!calendar?.read_only && (
          <ReminderSelect
            reminders={reminders ?? []}
            onSelect={onReminderAdd}
            onRemove={onReminderRemove}
          />
        )}

        <CalendarSelect calendar={calendar} onChange={onCalendarChange} readOnly={readonly} />

        <NotesInput value={description} onChange={onDescriptionChange} readOnly={readonly} />

        {onRsvp && (
          <>
            <Divider />
            {isPendingInvite ? (
              <RsvpBar onRsvp={onRsvp} />
            ) : (
              <RsvpSelect status={userResponseStatus} onRsvp={onRsvp} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
