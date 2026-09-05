import { Temporal } from "@js-temporal/polyfill"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { InputGroupAddon } from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { useLastTimedRange } from "@/hooks/useLastTimedRange"
import { useViewerTzid } from "@/hooks/useViewerTzid"
import {
  dateInEventZone,
  displayEndDate,
  eventTzid,
  isAllDay,
  shouldShowDisplayEndDate,
  type EventTime,
  type EventTimeRange,
  withRangeDisplayEndDate,
  withRangeEndWallclockTime,
  withRangeStartDate,
  withRangeStartWallclockTime,
  withRangeTimeZone,
  withRangeViewerZone,
} from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { ArrowRightIcon } from "@/icons/arrow-right"
import { ClockIcon } from "@/icons/clock"
import { UndoIcon } from "@/icons/undo"

import { TimeInput } from "./TimeInput"
import { TimeZoneSelect } from "./TimeZoneSelect"

export type DateTimeRange = EventTimeRange

// To make sure time + dates are aligned
const FIRST_INPUT_WIDTH = 140

export const DateTimeSelect = ({
  start,
  end,
  readOnly,
  onChange,
}: {
  start: EventTime
  end: EventTime
  readOnly?: boolean
  onChange: (range: DateTimeRange) => void
}) => {
  const allDay = isAllDay(start)
  const lastTimedRange = useLastTimedRange(start, end)
  const viewerTzid = useViewerTzid()
  const tzid = eventTzid(start)
  const foreignZone = !allDay && tzid !== viewerTzid

  // The timezone row is only shown for events in another zone than the
  // viewer's machine; otherwise a subtle "Add timezone" button sits next to
  // the date. Once the user reaches for it the row stays for the session,
  // even if they end up picking their own zone.
  const [timeZoneRequested, setTimeZoneRequested] = useState(false)
  const showTimeZone = !allDay && (timeZoneRequested || foreignZone)
  const canAddTimeZone = !allDay && !readOnly && !showTimeZone

  // An event in another zone opens in the viewer's clock with its inputs
  // locked, so a wallclock edit can't land in a zone the user isn't looking
  // at. The switch button next to the zone unlocks the inputs in the event's
  // own zone. This remembers the unlocked zone rather than a flag so that a
  // different event's zone starts locked again when the editor stays mounted
  // from one event to the next.
  const [unlockedTzid, setUnlockedTzid] = useState<string | null>(null)
  const locked = foreignZone && unlockedTzid !== tzid
  const inputsReadOnly = readOnly || locked

  // While locked the inputs show the same instants in the viewer's clock, and
  // the zone row names the viewer's zone to match; otherwise they show the
  // wallclock and zone stored on the event.
  const shown: EventTimeRange = locked ? withRangeViewerZone({ start, end }) : { start, end }
  // An all-day event with no remembered timed range has no times to show —
  // hide the time row entirely instead of rendering empty inputs.
  const visibleTimeRange = allDay ? lastTimedRange : shown
  const timeRowVisible = visibleTimeRange !== null

  const handleStartTime = (hour: number, minute: number) =>
    onChange(withRangeStartWallclockTime({ start, end }, hour, minute))

  const handleEndTime = (hour: number, minute: number) =>
    onChange(withRangeEndWallclockTime({ start, end }, hour, minute))

  const handleStartDate = (date: Temporal.PlainDate | null) => {
    if (!date) return
    onChange(withRangeStartDate({ start, end }, date))
  }

  const handleEndDate = (date: Temporal.PlainDate | null) => {
    if (!date) return
    onChange(withRangeDisplayEndDate({ start, end }, date))
  }

  const handleTimeZone = (nextTzid: string) => {
    setTimeZoneRequested(true)
    // A zone the user just picked is one they are editing in.
    setUnlockedTzid(nextTzid)
    onChange(withRangeTimeZone({ start, end }, nextTzid))
  }

  return (
    <div className="flex flex-col gap-1">
      {timeRowVisible && (
        <TimeSelect
          start={visibleTimeRange.start}
          end={visibleTimeRange.end}
          allDay={allDay}
          readOnly={inputsReadOnly}
          onChangeStartTime={handleStartTime}
          onChangeEndTime={handleEndTime}
        />
      )}
      <DateSelect
        startDate={dateInEventZone(shown.start)}
        endDate={displayEndDate(shown)}
        showEndDate={shouldShowDisplayEndDate(shown)}
        icon={timeRowVisible ? null : <ClockIcon />}
        readOnly={inputsReadOnly}
        onChangeStart={handleStartDate}
        onChangeEnd={handleEndDate}
        trailing={
          canAddTimeZone && (
            <Button
              type="button"
              variant="ghost"
              className="px-2 font-normal text-muted-foreground bodytext!"
              onClick={() => setTimeZoneRequested(true)}
            >
              Add timezone
            </Button>
          )
        }
      />
      {showTimeZone && (
        <div className="flex items-center gap-1">
          <TimeZoneSelect
            value={shown.start}
            readOnly={inputsReadOnly}
            defaultOpen={timeZoneRequested}
            onChange={handleTimeZone}
          />
          {foreignZone && (
            <ZoneSwitchButton
              locked={locked}
              readOnly={readOnly}
              onClick={() => setUnlockedTzid(locked ? tzid : null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** Toggles the inputs between the viewer's clock and the event's own zone. */
const ZoneSwitchButton = ({
  locked,
  readOnly,
  onClick,
}: {
  locked: boolean
  readOnly?: boolean
  onClick: () => void
}) => {
  const label = locked
    ? readOnly
      ? "Show in event's time zone"
      : "Switch to event's time zone to edit"
    : "Show in your time zone"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon-md"
          className="text-muted-foreground"
          aria-label={label}
          onClick={onClick}
        >
          <UndoIcon className={cn(!locked && "-scale-x-100")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const TimeSelect = ({
  start,
  end,
  allDay,
  readOnly,
  onChangeStartTime,
  onChangeEndTime,
}: {
  start: EventTime
  end: EventTime
  allDay: boolean
  readOnly?: boolean
  onChangeStartTime: (hour: number, minute: number) => void
  onChangeEndTime: (hour: number, minute: number) => void
}) => {
  return (
    <div
      className={cn("flex items-center", {
        "opacity-50": allDay,
      })}
    >
      <div className="flex items-center shrink-0" style={{ width: FIRST_INPUT_WIDTH }}>
        <TimeInput
          value={start}
          addon={
            <InputGroupAddon>
              <ClockIcon />
            </InputGroupAddon>
          }
          readOnly={readOnly}
          disabled={allDay}
          onChange={onChangeStartTime}
        />

        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="w-[111px] shrink-0">
        <TimeInput value={end} readOnly={readOnly} disabled={allDay} onChange={onChangeEndTime} />
      </div>
    </div>
  )
}

const DateSelect = ({
  startDate,
  endDate,
  showEndDate,
  icon,
  readOnly,
  onChangeStart,
  onChangeEnd,
  trailing,
}: {
  startDate: Temporal.PlainDate
  endDate: Temporal.PlainDate
  showEndDate: boolean
  icon?: React.ReactNode
  readOnly?: boolean
  onChangeStart: (date: Temporal.PlainDate | null) => void
  onChangeEnd: (date: Temporal.PlainDate | null) => void
  /** Rendered after the date pickers, e.g. the "Add timezone" button. */
  trailing?: React.ReactNode
}) => {
  return (
    <div className="flex flex-wrap gap-y-1">
      <div
        className="shrink-0 flex"
        style={{
          width: FIRST_INPUT_WIDTH,
        }}
      >
        <InputGroupAddon>{icon}</InputGroupAddon>
        <DatePicker date={startDate} setDate={onChangeStart} readOnly={readOnly} />
      </div>

      {showEndDate && <DatePicker date={endDate} setDate={onChangeEnd} readOnly={readOnly} />}

      {trailing}
    </div>
  )
}
