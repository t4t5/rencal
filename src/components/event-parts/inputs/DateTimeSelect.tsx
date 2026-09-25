import { Temporal } from "@js-temporal/polyfill"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { ItemMedia } from "@/components/ui/item"
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

  const [timeZoneRequested, setTimeZoneRequested] = useState(false)
  const showTimeZone = !allDay && (timeZoneRequested || foreignZone)
  const canAddTimeZone = !allDay && !readOnly && !showTimeZone

  // Storing the zone ensures a newly loaded foreign zone starts locked.
  const [unlockedTzid, setUnlockedTzid] = useState<string | null>(null)
  const locked = foreignZone && unlockedTzid !== tzid
  const inputsReadOnly = readOnly || locked

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
    setUnlockedTzid(nextTzid)
    onChange(withRangeTimeZone({ start, end }, nextTzid))
  }

  return (
    <div className="flex flex-col gap-[var(--control-row-gap)]">
      {/* Shared columns keep the end fields aligned across rows. */}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-y-[var(--control-row-gap)]">
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
                typography="field"
                className="px-[var(--control-padding-inline)] text-muted-foreground"
                onClick={() => setTimeZoneRequested(true)}
              >
                Add timezone
              </Button>
            )
          }
        />
      </div>
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
          size="icon-xs"
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
      className={cn("col-span-3 grid grid-cols-subgrid items-center", {
        "opacity-50": allDay,
      })}
    >
      <TimeInput
        value={start}
        addon={
          <ItemMedia>
            <ClockIcon />
          </ItemMedia>
        }
        readOnly={readOnly}
        disabled={allDay}
        onChange={onChangeStartTime}
      />

      <ArrowRightIcon className="size-4 text-muted-foreground" />

      <div className="justify-self-start">
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
  trailing?: React.ReactNode
}) => {
  return (
    <div className="col-span-3 grid grid-cols-subgrid items-center">
      {/* Without an icon, indent past the time's icon slot so the texts line up. */}
      <div
        className={cn(
          "justify-self-start",
          !icon && "pl-[calc(var(--control-leading-size)+var(--control-content-gap))]",
        )}
      >
        <DatePicker
          date={startDate}
          setDate={onChangeStart}
          addon={icon && <ItemMedia>{icon}</ItemMedia>}
          readOnly={readOnly}
        />
      </div>

      <div className="col-start-3 flex flex-wrap items-center gap-y-1">
        {showEndDate && <DatePicker date={endDate} setDate={onChangeEnd} readOnly={readOnly} />}
        {trailing}
      </div>
    </div>
  )
}
