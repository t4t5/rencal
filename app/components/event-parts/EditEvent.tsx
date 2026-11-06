import { cleanup, keymap, type JSX, signal, Text, token, untracked, View } from "nsh"
import type { RRule, RRuleSet } from "rrule"

import { Button } from "@/components/ui/button"
import { Menu, MenuItem } from "@/components/ui/menu"

import { api, getErrorMessage } from "@/lib/api"
import { type CalendarEvent, type ResponseStatus, withDates } from "@/lib/cal-events"
import { conferenceForCalendar } from "@/lib/conference"
import { eventColorForCalendar } from "@/lib/event-colors"
import {
  addMinutes,
  DEFAULT_DURATION_MINS,
  isAllDay,
  normalizeAllDayRange,
  toAllDay,
  toTimedAtStartOfDay,
} from "@/lib/event-time"
import { getUserResponseStatus, isEventReadonly } from "@/lib/event-utils"
import { lastTimedRange } from "@/lib/last-timed-range"
import { recurrenceToRRuleSet, rruleToRecurrence } from "@/lib/rrule-utils"
import { toast } from "@/lib/toast"

import { MoreHorizIcon } from "@/icons"
import { calendarOf, calendars } from "@/stores/calendar"
import { triggerDelete } from "@/stores/delete"
import { triggerDuplicate } from "@/stores/duplicate"
import { setActiveEventKey } from "@/stores/events"
import { requestSync } from "@/stores/sync"

import { EventInfo } from "./EventInfo"

function OverflowMenu(props: { onDuplicate: () => void; onDelete: () => void }) {
  return (
    <Menu
      placement="bottom"
      align="end"
      trigger={
        <Button variant="ghost" size="icon-xs" accessibilityLabel="More options">
          <MoreHorizIcon color={token("foreground")} />
        </Button>
      }
    >
      <MenuItem onSelect={props.onDuplicate} class="justify-between gap-4">
        <Text class="text-sm text-foreground">Duplicate event</Text>
        <Text class="text-xs text-muted-foreground">D</Text>
      </MenuItem>
      <MenuItem label="Delete event" destructive onSelect={props.onDelete} />
    </Menu>
  )
}

/**
 * The form of one event, edited as a copy and saved when it goes: mount it keyed
 * by the event, so that another event gets a fresh form and this one saves.
 */
export function EditEvent(props: {
  event: CalendarEvent
  onRequestSave: (current: CalendarEvent, original: CalendarEvent) => void
  children?: JSX.Element
}) {
  const original = props.event
  const dirty = signal(original)
  const update = (change: Partial<CalendarEvent>) =>
    dirty.update((event) => ({ ...event, ...change }))

  cleanup(() => {
    const current = untracked(dirty)
    if (JSON.stringify(current) !== JSON.stringify(original)) props.onRequestSave(current, original)
  })

  const isReadonly = () => isEventReadonly(dirty(), calendars())

  // By default this stays out of the way of a focused field, which deletes text.
  const pressDelete = () => {
    if (!isReadonly()) triggerDelete(dirty())
  }
  keymap.bind({ delete: pressDelete, backspace: pressDelete }, { when: "notEditing" })

  const remembered = lastTimedRange(() => ({ start: dirty().start, end: dirty().end }))

  // An occurrence's rule lives on its series master, so edit the copy it carries;
  // stores/recurrence.ts applies it to the series on save.
  const changeRecurrence = (rrule: RRule | RRuleSet | null) => {
    const next = rruleToRecurrence(rrule, dirty().start)
    update(dirty().recurring_event_id ? { master_recurrence: next } : { recurrence: next })
  }

  const recurrence = () => {
    const event = dirty()
    const effective = event.recurring_event_id ? event.master_recurrence : event.recurrence
    return effective ? recurrenceToRRuleSet(effective) : null
  }

  const responseStatus = () => getUserResponseStatus(dirty(), calendars())

  const rsvp = async (response: ResponseStatus) => {
    try {
      await api.events.rsvp(dirty(), response)
      void requestSync()
      setActiveEventKey(null)
    } catch (error) {
      toast.error("Failed to respond to invite", {
        description: getErrorMessage(error, "Failed to respond to invite"),
      })
      console.error("rsvp failed:", error)
    }
  }

  const changeAllDay = (checked: boolean) => {
    const { start, end } = dirty()
    if (checked) {
      const allDayStart = toAllDay(start)
      const { end: allDayEnd } = normalizeAllDayRange(allDayStart, toAllDay(end))
      dirty.set(withDates(dirty(), allDayStart, allDayEnd))
      return
    }
    const timedStart = isAllDay(start) ? toTimedAtStartOfDay(start) : start
    const last = remembered()
    dirty.set(
      withDates(
        dirty(),
        last?.start ?? timedStart,
        last?.end ?? addMinutes(timedStart, DEFAULT_DURATION_MINS),
      ),
    )
  }

  return (
    <View class="grow px-2 py-2">
      <View class="flex-row justify-end pb-1">
        {props.children}
        <If when={!isReadonly()}>
          <OverflowMenu
            onDuplicate={() => triggerDuplicate(dirty())}
            onDelete={() => triggerDelete(dirty())}
          />
        </If>
      </View>

      <EventInfo
        readonly={isReadonly()}
        summary={dirty().summary}
        onChangeSummary={(summary) => update({ summary })}
        description={dirty().description}
        onDescriptionChange={(description) => update({ description: description || null })}
        start={dirty().start}
        end={dirty().end}
        onChangeDateTime={({ start, end }) => dirty.set(withDates(dirty(), start, end))}
        allDay={isAllDay(dirty().start)}
        onAllDayChange={changeAllDay}
        location={dirty().location}
        onLocationChange={(location) => update({ location: location || null })}
        url={dirty().url}
        onUrlChange={(url) => update({ url: url || null })}
        calendar={calendarOf(dirty().calendar_slug)}
        onCalendarChange={(slug) => {
          const calendar = calendarOf(slug)
          update({
            calendar_slug: slug,
            conference: conferenceForCalendar(dirty().conference, calendar),
            color: eventColorForCalendar(dirty().color, calendar),
          })
        }}
        color={dirty().color}
        onColorChange={(color) => update({ color })}
        organizer={dirty().organizer}
        attendees={dirty().attendees}
        onAttendeesChange={(attendees) => update({ attendees })}
        conference={dirty().conference}
        onConferenceChange={(conference) => update({ conference })}
        recurrence={recurrence()}
        onRecurrenceChange={changeRecurrence}
        reminders={dirty().reminders}
        onReminderAdd={(mins) => {
          if (!dirty().reminders.includes(mins)) update({ reminders: [...dirty().reminders, mins] })
        }}
        onReminderRemove={(mins) =>
          update({ reminders: dirty().reminders.filter((other) => other !== mins) })
        }
        onRsvp={responseStatus() !== null ? rsvp : undefined}
        userResponseStatus={responseStatus()}
        isPendingInvite={responseStatus() === "needs-action"}
        onClose={() => setActiveEventKey(null)}
      />
    </View>
  )
}
