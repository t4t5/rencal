import { Temporal } from "@js-temporal/polyfill"
import { computed, type JSX, signal, Text, token, View } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { ItemMedia } from "@/components/ui/item"
import { TimeField } from "@/components/ui/time-field"
import { Tooltip } from "@/components/ui/tooltip"

import {
  dateInEventZone,
  displayEndDate,
  eventTzid,
  getViewerTzid,
  isAllDay,
  shouldShowDisplayEndDate,
  type EventTime,
  type EventTimeRange,
  wallclockTime,
  withRangeDisplayEndDate,
  withRangeEndWallclockTime,
  withRangeStartDate,
  withRangeStartWallclockTime,
  withRangeTimeZone,
  withRangeViewerZone,
} from "@/lib/event-time"
import { lastTimedRange } from "@/lib/last-timed-range"
import { cn } from "@/lib/utils"

import { ArrowRightIcon, ClockIcon, UndoIcon } from "@/icons"

import { TimeZoneSelect } from "./TimeZoneSelect"

export type DateTimeRange = EventTimeRange

function ZoneSwitchButton(props: { locked: boolean; readOnly?: boolean; onPress: () => void }) {
  const label = () =>
    props.locked
      ? props.readOnly
        ? "Show in event's time zone"
        : "Switch to event's time zone to edit"
      : "Show in your time zone"

  return (
    <View tooltip={<Tooltip label={label()} />}>
      <BaseButton
        onPress={props.onPress}
        accessibilityLabel={label()}
        class="size-(--control-height-xs) items-center justify-center rounded-(--radius-md) bg-secondary hover:bg-secondary-hover"
      >
        <View style={{ transform: [{ scaleX: props.locked ? 1 : -1 }] }}>
          <UndoIcon color={token("muted-foreground")} />
        </View>
      </BaseButton>
    </View>
  )
}

function TimeRow(props: {
  start: EventTime
  end: EventTime
  allDay: boolean
  readOnly?: boolean
  onChangeStart: (hour: number, minute: number) => void
  onChangeEnd: (hour: number, minute: number) => void
}) {
  const start = () => wallclockTime(props.start)
  const end = () => wallclockTime(props.end)
  const disabled = () => props.allDay || props.readOnly
  return (
    <View class={cn("flex-row items-center", props.allDay && "opacity-50")}>
      <View class="flex-row items-center gap-2 pl-2">
        <ItemMedia>
          <ClockIcon color={token("muted-foreground")} />
        </ItemMedia>
        <TimeField
          class="-ml-2"
          hour={start().hour}
          minute={start().minute}
          disabled={disabled()}
          accessibilityLabel="Start time"
          onChange={props.onChangeStart}
        />
      </View>
      <ArrowRightIcon class="mx-1" color={token("muted-foreground")} />
      <TimeField
        hour={end().hour}
        minute={end().minute}
        disabled={disabled()}
        accessibilityLabel="End time"
        onChange={props.onChangeEnd}
      />
    </View>
  )
}

function DateRow(props: {
  startDate: Temporal.PlainDate
  endDate: Temporal.PlainDate
  showEndDate: boolean
  showIcon: boolean
  readOnly?: boolean
  onChangeStart: (date: Temporal.PlainDate) => void
  onChangeEnd: (date: Temporal.PlainDate) => void
  trailing?: JSX.Element
}) {
  return (
    <View class="flex-row flex-wrap items-center">
      <View class={cn(!props.showIcon && "pl-6")}>
        <DatePicker
          date={props.startDate}
          setDate={props.onChangeStart}
          addon={
            <If when={props.showIcon}>
              <ItemMedia>
                <ClockIcon color={token("muted-foreground")} />
              </ItemMedia>
            </If>
          }
          readOnly={props.readOnly}
        />
      </View>
      <If when={props.showEndDate}>
        <ArrowRightIcon class="mx-1" color={token("muted-foreground")} />
        <DatePicker date={props.endDate} setDate={props.onChangeEnd} readOnly={props.readOnly} />
      </If>
      {props.trailing}
    </View>
  )
}

export function DateTimeSelect(props: {
  start: EventTime
  end: EventTime
  readOnly?: boolean
  onChange: (range: DateTimeRange) => void
}) {
  const range = () => ({ start: props.start, end: props.end })
  const allDay = () => isAllDay(props.start)
  const remembered = lastTimedRange(range)
  const tzid = () => eventTzid(props.start)
  const foreignZone = () => !allDay() && tzid() !== getViewerTzid()

  const timeZoneRequested = signal(false)
  const showTimeZone = () => !allDay() && (timeZoneRequested() || foreignZone())
  const canAddTimeZone = () => !allDay() && !props.readOnly && !showTimeZone()

  // Storing the zone ensures a newly loaded foreign zone starts locked.
  const unlockedTzid = signal<string | null>(null)
  const locked = () => foreignZone() && unlockedTzid() !== tzid()
  const inputsReadOnly = () => props.readOnly || locked()

  const shown = computed<EventTimeRange>(() => (locked() ? withRangeViewerZone(range()) : range()))
  // An all-day event with no remembered timed range has no times to show.
  const visibleTimeRange = () => (allDay() ? remembered() : shown())

  return (
    <View class="gap-1">
      <If when={visibleTimeRange()}>
        {(times) => (
          <TimeRow
            start={times().start}
            end={times().end}
            allDay={allDay()}
            readOnly={inputsReadOnly()}
            onChangeStart={(hour, minute) =>
              props.onChange(withRangeStartWallclockTime(range(), hour, minute))
            }
            onChangeEnd={(hour, minute) =>
              props.onChange(withRangeEndWallclockTime(range(), hour, minute))
            }
          />
        )}
      </If>
      <DateRow
        startDate={dateInEventZone(shown().start)}
        endDate={displayEndDate(shown())}
        showEndDate={shouldShowDisplayEndDate(shown())}
        showIcon={!visibleTimeRange()}
        readOnly={inputsReadOnly()}
        onChangeStart={(date) => props.onChange(withRangeStartDate(range(), date))}
        onChangeEnd={(date) => props.onChange(withRangeDisplayEndDate(range(), date))}
        trailing={
          <If when={canAddTimeZone()}>
            <Button variant="ghost" class="px-2" onPress={() => timeZoneRequested.set(true)}>
              <Text class="text-sm text-muted-foreground">Add timezone</Text>
            </Button>
          </If>
        }
      />
      <If when={showTimeZone()}>
        <View class="flex-row items-center gap-1">
          <TimeZoneSelect
            value={shown().start}
            readOnly={inputsReadOnly()}
            defaultOpen={timeZoneRequested()}
            onChange={(zone) => {
              timeZoneRequested.set(true)
              unlockedTzid.set(zone)
              props.onChange(withRangeTimeZone(range(), zone))
            }}
          />
          <If when={foreignZone()}>
            <ZoneSwitchButton
              locked={locked()}
              readOnly={props.readOnly}
              onPress={() => unlockedTzid.set(locked() ? tzid() : null)}
            />
          </If>
        </View>
      </If>
    </View>
  )
}
