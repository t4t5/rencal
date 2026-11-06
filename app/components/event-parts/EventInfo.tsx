import { type InputRef, type JSX, View } from "nsh"
import type { RRule, RRuleSet } from "rrule"

import { Textarea } from "@/components/ui/textarea"

import type { Calendar } from "@/lib/api"
import type { EventAttendee, ResponseStatus } from "@/lib/cal-events"
import type { EventConference } from "@/lib/conference"
import { supportsEventColor } from "@/lib/event-colors"
import type { EventTime } from "@/lib/event-time"
import { detectEventUrl } from "@/lib/event-url"
import { cn } from "@/lib/utils"

import { AllDayCheckbox } from "./inputs/AllDayCheckbox"
import { AttendeesDisplay } from "./inputs/AttendeesDisplay"
import { CalendarSelect } from "./inputs/CalendarSelect"
import { ConferenceDisplay } from "./inputs/ConferenceDisplay"
import { type DateTimeRange, DateTimeSelect } from "./inputs/DateTimeSelect"
import { EventColorPicker } from "./inputs/EventColorPicker"
import { LocationInput } from "./inputs/LocationInput"
import { NotesInput } from "./inputs/NotesInput"
import { ReminderSelect } from "./inputs/ReminderSelect"
import { RepeatSelect } from "./inputs/RepeatSelect"
import { RsvpBar } from "./inputs/RsvpBar"
import { RsvpSelect } from "./inputs/RsvpSelect"
import { UrlInput } from "./inputs/UrlInput"

const Separator = () => <View class="h-px bg-border opacity-75" />

function Section(props: { flushTop?: boolean; flushBottom?: boolean; children?: JSX.Element }) {
  return (
    <View class={cn("gap-1 py-2", props.flushTop && "pt-0", props.flushBottom && "pb-0")}>
      {props.children}
    </View>
  )
}

export function EventInfo(props: {
  readonly?: boolean
  summaryRef?: (ref: InputRef) => void
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
  color?: string | null
  onColorChange?: (color: string | null) => void
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
  const canEdit = () => !props.readonly
  const showSummary = () => canEdit() || !!props.summary?.trim()
  const hasAttendees = () => !!props.attendees?.length

  // Links in the location or notes double as a "virtual" URL field.
  const detectedUrl = () =>
    detectEventUrl({
      url: props.url ?? null,
      description: props.description ?? null,
      location: props.location ?? null,
      conference: props.conference ?? null,
    })

  // With attendees the three groups get separators; without, they read as one.
  const groupGap = () => (hasAttendees() ? undefined : "gap-1")

  return (
    <View class="grow">
      <If when={showSummary()}>
        <Section flushTop>
          <View class="min-h-(--control-height) justify-center">
            <Textarea
              ref={(input) => props.summaryRef?.(input)}
              testID="event-summary"
              placeholder="Event Title"
              value={props.summary ?? ""}
              class="text-base font-medium"
              readonly={props.readonly}
              submitBehavior="submit"
              onChange={({ value }) => props.onChangeSummary(value)}
              onSubmit={() => props.onClose?.()}
            />
          </View>
        </Section>
        <Separator />
      </If>

      <View
        class={cn(
          groupGap(),
          !hasAttendees() && "py-2",
          !hasAttendees() && !showSummary() && "pt-0",
        )}
      >
        <View
          class={cn("gap-1", hasAttendees() && "py-2", hasAttendees() && !showSummary() && "pt-0")}
        >
          <If when={canEdit() || !!props.location?.trim()}>
            <LocationInput
              value={props.location}
              onChange={props.onLocationChange}
              onClose={props.onClose}
              readOnly={props.readonly}
            />
          </If>
          <DateTimeSelect
            start={props.start}
            end={props.end}
            readOnly={props.readonly}
            onChange={props.onChangeDateTime}
          />
          <If when={canEdit() || props.allDay}>
            <AllDayCheckbox
              checked={props.allDay}
              onCheckedChange={props.onAllDayChange}
              readOnly={props.readonly}
            />
          </If>
          <If when={canEdit() || props.recurrence}>
            <RepeatSelect
              value={props.recurrence}
              start={props.start}
              onChange={props.onRecurrenceChange}
              readOnly={props.readonly}
            />
          </If>
          <ConferenceDisplay
            conference={props.conference}
            location={props.location}
            calendar={props.calendar}
            readonly={props.readonly}
            onConferenceChange={props.onConferenceChange}
          />
        </View>

        <If when={hasAttendees()}>
          <Separator />
        </If>
        <If when={hasAttendees() || canEdit()}>
          <View class={cn(hasAttendees() && "py-2")}>
            <AttendeesDisplay
              organizer={props.organizer}
              attendees={props.attendees}
              readOnly={props.readonly}
              onAttendeesChange={props.onAttendeesChange}
            />
          </View>
        </If>
        <If when={hasAttendees()}>
          <Separator />
        </If>

        <View class={cn("gap-1", hasAttendees() && "py-2")}>
          <If when={canEdit() || !!props.url?.trim() || detectedUrl()}>
            <UrlInput
              value={props.url}
              onChange={props.onUrlChange}
              onClose={props.onClose}
              readOnly={props.readonly}
              detected={detectedUrl()}
            />
          </If>
          <ReminderSelect
            reminders={props.reminders ?? []}
            onSelect={props.onReminderAdd}
            onRemove={props.onReminderRemove}
          />
          <If
            when={canEdit() && props.onColorChange && supportsEventColor(props.calendar)}
            else={
              <CalendarSelect
                calendar={props.calendar}
                onChange={props.onCalendarChange}
                readOnly={props.readonly}
              />
            }
          >
            <View class="flex-row gap-1">
              <View class="min-w-0 flex-1">
                <CalendarSelect calendar={props.calendar} onChange={props.onCalendarChange} />
              </View>
              <EventColorPicker
                color={props.color ?? null}
                calendar={props.calendar}
                onChange={(color) => props.onColorChange?.(color)}
              />
            </View>
          </If>
          <If when={canEdit() || !!props.description?.trim()}>
            <NotesInput
              value={props.description}
              onChange={props.onDescriptionChange}
              readOnly={props.readonly}
            />
          </If>
        </View>
      </View>

      <If when={props.onRsvp}>
        <Separator />
        <Section flushBottom>
          <If
            when={props.isPendingInvite}
            else={
              <RsvpSelect
                status={props.userResponseStatus}
                onRsvp={(response) => props.onRsvp?.(response)}
              />
            }
          >
            <RsvpBar onRsvp={(response) => props.onRsvp?.(response)} />
          </If>
        </Section>
      </If>
    </View>
  )
}
