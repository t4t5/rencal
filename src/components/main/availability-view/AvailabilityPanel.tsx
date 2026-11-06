import { Temporal } from "@js-temporal/polyfill"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { TimeZoneSelect } from "@/components/event-parts/inputs/TimeZoneSelect"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useSettings } from "@/contexts/SettingsContext"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import { getErrorMessage } from "@/lib/api"
import { DAY_MINUTES, formatShortDate } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"
import { CloseIcon } from "@/icons/close"
import { CopyIcon } from "@/icons/copy"
import { PlusIcon } from "@/icons/plus"

import { TimeSelect } from "./TimeSelect"
import {
  dropRange,
  editRange,
  pickRange,
  setDuration,
  setTheirTzid,
  tickDay,
  useAvailability,
} from "./availability-store"
import { freeTimesMessage } from "./free-times-message"
import {
  LAST_START_MINUTES,
  nextRange,
  offeredSpans,
  type PickedDay,
  rangeFrom,
  TIME_STEP_MINUTES,
} from "./picked-days"

const PANEL_WIDTH = 360
const DURATIONS = [15, 30, 45, 60, 90]
const COPIED_MS = 1500

/** The inspector on the right: your times, then the message they turn into. */
export function AvailabilityPanel() {
  const { days } = useAvailability()

  return (
    <aside
      data-slot="availability-panel"
      className="flex flex-col shrink-0 min-h-0 border-l border-border bg-background"
      style={{ width: PANEL_WIDTH }}
    >
      <div className="flex flex-col gap-4 overflow-y-auto p-4 grow min-h-0">
        <DurationField />
        {days.map((day) => (
          <DayRow key={day.date.toString()} day={day} />
        ))}
        <NewDayRow />
      </div>
      <MessageSection />
    </aside>
  )
}

function DurationField() {
  const { durationMinutes } = useAvailability()

  return (
    <section className="flex items-center justify-between gap-3">
      <Label className="text-sm font-medium">Duration</Label>
      <Select value={String(durationMinutes)} onValueChange={(next) => setDuration(Number(next))}>
        <SelectTrigger variant="default" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DURATIONS.map((minutes) => (
            <SelectItem key={minutes} value={String(minutes)}>
              {minutes} min
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  )
}

function DayRow({ day }: { day: PickedDay }) {
  const { durationMinutes } = useAvailability()
  const { date, ranges, offered } = day
  const id = `availability-day-${date.toString()}`
  const spare = nextRange(ranges, durationMinutes)

  return (
    <div data-slot="availability-day" className="flex flex-col gap-1">
      <div className="flex items-center gap-2 h-control">
        <Checkbox
          id={id}
          checked={offered}
          onCheckedChange={(checked) => tickDay(date, checked === true)}
        />
        <Label htmlFor={id} className={cn("text-sm", !offered && "text-muted-foreground")}>
          {formatShortDate(date)}
        </Label>
      </div>

      {ranges.map((range, index) => (
        <div key={index} className="flex items-center gap-1 pl-6">
          <TimeSelect
            value={range.startMinutes}
            min={0}
            max={LAST_START_MINUTES}
            disabled={!offered}
            onChange={(startMinutes) =>
              editRange(
                date,
                index,
                startMinutes < range.endMinutes
                  ? { ...range, startMinutes }
                  : rangeFrom(startMinutes, durationMinutes),
              )
            }
          />
          <span className="text-muted-foreground">–</span>
          <TimeSelect
            value={range.endMinutes}
            min={range.startMinutes + TIME_STEP_MINUTES}
            max={DAY_MINUTES}
            disabled={!offered}
            onChange={(endMinutes) => editRange(date, index, { ...range, endMinutes })}
          />
          <div className="ml-auto">
            {index > 0 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Remove times"
                onClick={() => dropRange(date, index)}
              >
                <CloseIcon className="size-4" />
              </Button>
            ) : (
              spare &&
              offered && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Add times"
                  onClick={() => pickRange(date, spare)}
                >
                  <PlusIcon className="size-4" />
                </Button>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Always last: pick a day, then a start, and it becomes a real row. */
function NewDayRow() {
  const { durationMinutes } = useAvailability()
  const [date, setDate] = useState<Temporal.PlainDate | null>(null)

  return (
    <div data-slot="availability-new-day" className="flex flex-col gap-1">
      <div className="flex items-center gap-2 h-control">
        <Checkbox checked={false} disabled aria-label="New date" />
        <DatePicker
          date={date}
          setDate={setDate}
          placeholder="Day"
          className={cn(
            "border-0 px-0 data-[state=open]:bg-transparent",
            !date &&
              "text-muted-foreground hover:text-foreground data-[state=open]:text-foreground",
          )}
        />
      </div>
      <div className="flex items-center gap-1 pl-6">
        <TimeSelect
          value={null}
          min={0}
          max={LAST_START_MINUTES}
          placeholder="Start"
          disabled={!date}
          onChange={(startMinutes) => {
            if (!date) return
            pickRange(date, rangeFrom(startMinutes, durationMinutes))
            setDate(null)
          }}
        />
        <span className="text-muted-foreground">–</span>
        <TimeSelect value={null} min={0} max={0} placeholder="End" disabled />
      </div>
    </div>
  )
}

function MessageSection() {
  const { days, durationMinutes, theirTzid } = useAvailability()
  const { timeFormat } = useSettings()
  const viewerTzid = useViewerTzid()
  const tzid = theirTzid ?? viewerTzid
  const windows = offeredSpans(days, viewerTzid)
  const message =
    windows.length > 0 ? freeTimesMessage({ windows, durationMinutes }, tzid, timeFormat) : null

  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    // Dragging to select part of the message shouldn't copy all of it.
    if (!message || window.getSelection()?.toString()) return
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
    } catch (err) {
      toast.error("Couldn't copy", { description: getErrorMessage(err, "Clipboard unavailable") })
    }
  }

  return (
    <section className="flex flex-col gap-3 p-4 border-t border-border shrink-0">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">Their timezone</Label>
        <div className="w-44">
          <TimeZoneSelect
            value={{ kind: "datetime_zoned", value: Temporal.Now.zonedDateTimeISO(tzid) }}
            onChange={setTheirTzid}
          />
        </div>
      </div>
      <div
        className={cn(
          "group relative overflow-hidden rounded-md border border-border bg-muted/30",
          message && "cursor-pointer",
        )}
        onClick={() => void copy()}
      >
        <div
          data-slot="availability-message"
          className={cn(
            "h-32 overflow-y-auto whitespace-pre-wrap p-3 pb-10 text-sm select-text",
            !message && "text-muted-foreground",
          )}
        >
          {message ?? "Pick some times and your message appears here."}
        </div>
        {message && (
          <Button
            variant="secondary"
            size={copied ? "sm" : "icon-sm"}
            aria-label={copied ? undefined : "Copy message"}
            title={copied ? undefined : "Copy message"}
            className="absolute right-2 bottom-2 transition-colors group-hover:bg-secondary-hover"
          >
            {copied ? (
              <>
                <CheckIcon className="size-4" />
                Copied!
              </>
            ) : (
              <CopyIcon className="size-4" />
            )}
          </Button>
        )}
      </div>
    </section>
  )
}
