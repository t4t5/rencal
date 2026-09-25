import { RRule, RRuleSet } from "rrule"

import { AllDayCheckbox } from "@/components/event-parts/inputs/AllDayCheckbox"
import { AttendeesDisplay } from "@/components/event-parts/inputs/AttendeesDisplay"
import { CalendarSelect } from "@/components/event-parts/inputs/CalendarSelect"
import { ConferenceDisplay } from "@/components/event-parts/inputs/ConferenceDisplay"
import { DateTimeSelect, type DateTimeRange } from "@/components/event-parts/inputs/DateTimeSelect"
import { LocationInput } from "@/components/event-parts/inputs/LocationInput"
import { ReminderSelect } from "@/components/event-parts/inputs/ReminderSelect"
import { RepeatSelect } from "@/components/event-parts/inputs/RepeatSelect"
import { UrlInput } from "@/components/event-parts/inputs/UrlInput"
import { Textarea } from "@/components/ui/textarea"

import type { Calendar } from "@/lib/api"
import type { EventAttendee, ResponseStatus } from "@/lib/cal-events"
import type { EventConference } from "@/lib/conference"
import type { EventTime } from "@/lib/event-time"
import { detectEventUrl } from "@/lib/event-url"
import { cn } from "@/lib/utils"

import { NotesInput } from "./inputs/NotesInput"
import { RsvpBar } from "./inputs/RsvpBar"
import { RsvpSelect } from "./inputs/RsvpSelect"

const Separator = () => <hr className="opacity-75" />

function EventInfoSection({
  children,
  flushTop,
  flushBottom,
}: {
  children: React.ReactNode
  flushTop?: boolean
  flushBottom?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[var(--control-row-gap)] py-2",
        flushTop && "pt-0",
        flushBottom && "pb-0",
      )}
    >
      {children}
    </div>
  )
}

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
  location,
  onLocationChange,
  url,
  onUrlChange,
  calendar,
  onCalendarChange,
  recurrence,
  onRecurrenceChange,
  description,
  onDescriptionChange,
  organizer,
  attendees,
  onAttendeesChange,
  conference,
  onConferenceChange,
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
  start: EventTime
  end: EventTime
  onChangeDateTime: (range: DateTimeRange) => void
  allDay: boolean
  onAllDayChange: (checked: boolean) => void
  location?: string | null
  onLocationChange: (location: string) => void
  url?: string | null
  onUrlChange: (url: string) => void
  recurrence: RRule | RRuleSet | null
  onRecurrenceChange: (recurrence: RRule | RRuleSet | null) => void
  calendar?: Calendar
  onCalendarChange: (calendarId: string) => void
  description?: string | null
  onDescriptionChange: (description: string) => void
  organizer?: EventAttendee | null
  attendees?: EventAttendee[]
  onAttendeesChange?: (attendees: EventAttendee[]) => void
  conference?: EventConference | null
  onConferenceChange?: (conference: EventConference | null) => void
  reminders?: number[]
  onReminderAdd: (mins: number) => void
  onReminderRemove: (mins: number) => void
  onRsvp?: (response: ResponseStatus) => void
  userResponseStatus?: ResponseStatus | null
  isPendingInvite?: boolean
}) {
  const canEdit = !readonly
  const showSummary = canEdit || !!summary?.trim()
  const hasAttendees = !!attendees?.length

  // Links in the location/notes double as a "virtual" URL field, so a
  // description like "Details: https://…" is one click away.
  const detectedUrl = detectEventUrl({
    url: url ?? null,
    description: description ?? null,
    location: location ?? null,
    conference: conference ?? null,
  })

  const fieldsBeforeAttendees = (
    <>
      {(canEdit || !!location?.trim()) && (
        <LocationInput
          value={location}
          onChange={onLocationChange}
          onClose={onClose}
          readOnly={readonly}
        />
      )}

      <DateTimeSelect start={start} end={end} readOnly={readonly} onChange={onChangeDateTime} />

      {(canEdit || allDay) && (
        <AllDayCheckbox checked={allDay} onCheckedChange={onAllDayChange} readOnly={readonly} />
      )}

      {(canEdit || recurrence) && (
        <RepeatSelect value={recurrence} onChange={onRecurrenceChange} readOnly={readonly} />
      )}

      <ConferenceDisplay
        conference={conference}
        location={location}
        calendar={calendar}
        readonly={readonly}
        onConferenceChange={onConferenceChange}
      />
    </>
  )

  const attendeesField = (hasAttendees || canEdit) && (
    <AttendeesDisplay
      organizer={organizer}
      attendees={attendees}
      readOnly={readonly}
      onAttendeesChange={onAttendeesChange}
    />
  )

  const fieldsAfterAttendees = (
    <>
      {(canEdit || !!url?.trim() || detectedUrl) && (
        <UrlInput
          value={url}
          onChange={onUrlChange}
          onClose={onClose}
          readOnly={readonly}
          detected={detectedUrl}
        />
      )}

      <ReminderSelect
        reminders={reminders ?? []}
        onSelect={onReminderAdd}
        onRemove={onReminderRemove}
      />

      <CalendarSelect calendar={calendar} onChange={onCalendarChange} readOnly={readonly} />

      {(canEdit || !!description?.trim()) && (
        <NotesInput value={description} onChange={onDescriptionChange} readOnly={readonly} />
      )}
    </>
  )

  return (
    <div data-slot="event-form-fields" className="flex flex-col grow">
      {showSummary && (
        <EventInfoSection flushTop>
          <div className="flex min-h-control items-center">
            <Textarea
              data-popover-entry
              ref={summaryRef}
              placeholder="Event Title"
              value={summary ?? ""}
              className="text-base font-medium"
              readOnly={readonly}
              onChange={(e) => onChangeSummary(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  onClose?.()
                }
              }}
            />
          </div>
        </EventInfoSection>
      )}

      {showSummary && <Separator />}

      {hasAttendees ? (
        <>
          <EventInfoSection flushTop={!showSummary}>{fieldsBeforeAttendees}</EventInfoSection>
          <Separator />
          <EventInfoSection>{attendeesField}</EventInfoSection>
          <Separator />
          <EventInfoSection flushBottom={!onRsvp}>{fieldsAfterAttendees}</EventInfoSection>
        </>
      ) : (
        <EventInfoSection flushTop={!showSummary} flushBottom={!onRsvp}>
          {fieldsBeforeAttendees}
          {attendeesField}
          {fieldsAfterAttendees}
        </EventInfoSection>
      )}

      {onRsvp && (
        <>
          <Separator />
          <EventInfoSection flushBottom>
            {isPendingInvite ? (
              <RsvpBar onRsvp={onRsvp} />
            ) : (
              <RsvpSelect status={userResponseStatus} onRsvp={onRsvp} />
            )}
          </EventInfoSection>
        </>
      )}
    </div>
  )
}
