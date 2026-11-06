import { type InputRef, View } from "nsh"
import { rrulestr } from "rrule"

import { Button } from "@/components/ui/button"

import { conferenceForCalendar } from "@/lib/conference"
import { eventColorForCalendar } from "@/lib/event-colors"
import {
  addDays,
  addMinutes,
  DEFAULT_DURATION_MINS,
  type EventTime,
  isAllDay,
  normalizeAllDayRange,
  toAllDay,
  toTimedAtStartOfDay,
} from "@/lib/event-time"
import { lastTimedRange } from "@/lib/last-timed-range"
import { daysToFirstOccurrence, rruleToRecurrence } from "@/lib/rrule-utils"

import { calendarOf } from "@/stores/calendar"
import {
  createDraftEvent,
  draftEvent,
  draftReminders,
  setDraftReminders,
  updateDraft,
} from "@/stores/draft"

import { EventInfo } from "./EventInfo"

export function ComposeEventInner(props: {
  summaryRef?: (ref: InputRef) => void
  onCreated: () => void
  onBeforeCreate?: (start: EventTime) => void
}) {
  const remembered = lastTimedRange(() => ({ start: draftEvent().start, end: draftEvent().end }))

  const create = async () => {
    props.onBeforeCreate?.(draftEvent().start)
    await createDraftEvent()
    props.onCreated()
  }

  const changeAllDay = (checked: boolean) => {
    const { start, end } = draftEvent()
    if (checked) {
      const allDayStart = toAllDay(start)
      const { end: allDayEnd } = normalizeAllDayRange(allDayStart, toAllDay(end))
      updateDraft({ start: allDayStart, end: allDayEnd })
      return
    }
    const timedStart = isAllDay(start) ? toTimedAtStartOfDay(start) : start
    const last = remembered()
    updateDraft({
      start: last?.start ?? timedStart,
      end: last?.end ?? addMinutes(timedStart, DEFAULT_DURATION_MINS),
    })
  }

  return (
    <View class="px-2 pt-2">
      <EventInfo
        onClose={() => void create()}
        summaryRef={(input) => props.summaryRef?.(input)}
        summary={draftEvent().summary}
        onChangeSummary={(summary) => updateDraft({ summary })}
        description={draftEvent().description}
        onDescriptionChange={(description) => updateDraft({ description: description || null })}
        start={draftEvent().start}
        end={draftEvent().end}
        onChangeDateTime={({ start, end }) => updateDraft({ start, end })}
        allDay={isAllDay(draftEvent().start)}
        onAllDayChange={changeAllDay}
        location={draftEvent().location}
        onLocationChange={(location) => updateDraft({ location: location || null })}
        url={draftEvent().url}
        onUrlChange={(url) => updateDraft({ url: url || null })}
        conference={draftEvent().conference}
        onConferenceChange={(conference) => updateDraft({ conference })}
        calendar={draftEvent().calendarId ? calendarOf(draftEvent().calendarId!) : undefined}
        onCalendarChange={(slug) => {
          const calendar = calendarOf(slug)
          updateDraft({
            calendarId: slug,
            conference: conferenceForCalendar(draftEvent().conference, calendar),
            color: eventColorForCalendar(draftEvent().color, calendar),
          })
        }}
        color={draftEvent().color}
        onColorChange={(color) => updateDraft({ color })}
        attendees={draftEvent().attendees}
        onAttendeesChange={(attendees) => updateDraft({ attendees })}
        recurrence={draftEvent().recurrence ? rrulestr(draftEvent().recurrence!.rrule) : null}
        onRecurrenceChange={(rrule) => {
          const { start, end } = draftEvent()
          const next = rruleToRecurrence(rrule, start)
          // Move the event onto the rule's first day, e.g. a Thursday draft set
          // to repeat Mon–Wed starts next Monday.
          const shift = next ? daysToFirstOccurrence(start, next.rrule) : 0
          updateDraft({ start: addDays(start, shift), end: addDays(end, shift), recurrence: next })
        }}
        reminders={draftReminders()}
        onReminderAdd={(mins) => setDraftReminders([...draftReminders(), mins])}
        onReminderRemove={(mins) =>
          setDraftReminders(draftReminders().filter((other) => other !== mins))
        }
      />
      <View class="py-2">
        <Button class="w-full" label="Add Event" onPress={() => void create()} />
      </View>
    </View>
  )
}
