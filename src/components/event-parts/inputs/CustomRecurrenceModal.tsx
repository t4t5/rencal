import { Temporal } from "@js-temporal/polyfill"
import { FormEvent, useId, useState } from "react"
import { RRule, RRuleSet } from "rrule"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Modal,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useSettings } from "@/contexts/SettingsContext"

import {
  RECURRENCE_UNITS,
  customRecurrenceFromRule,
  customRecurrenceToRule,
  describeRecurrence,
  isEditableRecurrence,
  toggleWeekday,
  type RecurrenceEnd,
  type RecurrenceUnit,
} from "@/lib/custom-recurrence"
import { dateInEventZone, type EventTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

// Indexed Monday = 0 … Sunday = 6, like rrule.js.
const WEEKDAYS = [
  { short: "Mo", long: "Monday" },
  { short: "Tu", long: "Tuesday" },
  { short: "We", long: "Wednesday" },
  { short: "Th", long: "Thursday" },
  { short: "Fr", long: "Friday" },
  { short: "Sa", long: "Saturday" },
  { short: "Su", long: "Sunday" },
]

const MAX_INTERVAL = 999
const MAX_COUNT = 999
const DEFAULT_COUNT = 10

const isWholeNumberIn = (value: number, max: number) =>
  Number.isInteger(value) && value >= 1 && value <= max

export function CustomRecurrenceModal({
  value,
  start,
  onSave,
  onClose,
}: {
  value: RRule | RRuleSet | null
  /** The event's start: its weekday seeds a new weekly rule and bounds the end date. */
  start: EventTime
  onSave: (rule: RRule) => void
  onClose: () => void
}) {
  if (!isEditableRecurrence(value)) {
    return <ReadOnlyRecurrence value={value!} start={start} onClose={onClose} />
  }
  return <CustomRecurrenceForm value={value} start={start} onSave={onSave} onClose={onClose} />
}

function ReadOnlyRecurrence({
  value,
  start,
  onClose,
}: {
  value: RRule | RRuleSet
  start: EventTime
  onClose: () => void
}) {
  return (
    <Modal onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Repeat</DialogTitle>
        <DialogDescription>
          This repeat rule can&apos;t be edited in renCal. Choose another option to replace it.
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm">{describeRecurrence(value, start)}</p>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Modal>
  )
}

function CustomRecurrenceForm({
  value,
  start,
  onSave,
  onClose,
}: {
  value: RRule | RRuleSet | null
  start: EventTime
  onSave: (rule: RRule) => void
  onClose: () => void
}) {
  const { firstDayOfWeek } = useSettings()
  const startDate = dateInEventZone(start)
  const [initial] = useState(() => customRecurrenceFromRule(value, start))
  const [freq, setFreq] = useState<RecurrenceUnit>(initial.freq)
  // Number fields are kept as text so they can be cleared while typing.
  const [intervalText, setIntervalText] = useState(String(initial.interval))
  const [weekdays, setWeekdays] = useState(initial.weekdays)
  const [endKind, setEndKind] = useState<RecurrenceEnd["kind"]>(initial.end.kind)
  const [endDate, setEndDate] = useState(
    initial.end.kind === "on" ? initial.end.date : startDate.add({ months: 1 }),
  )
  const [countText, setCountText] = useState(
    String(initial.end.kind === "after" ? initial.end.count : DEFAULT_COUNT),
  )

  const interval = Number(intervalText)
  const count = Number(countText)
  const isIntervalValid = isWholeNumberIn(interval, MAX_INTERVAL)
  const isCountValid = isWholeNumberIn(count, MAX_COUNT)
  const isEndDateValid = Temporal.PlainDate.compare(endDate, startDate) >= 0
  const isValid =
    isIntervalValid && (endKind !== "after" || isCountValid) && (endKind !== "on" || isEndDateValid)
  const weekdayOrder = firstDayOfWeek === "sunday" ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]

  const end: RecurrenceEnd =
    endKind === "on"
      ? { kind: "on", date: endDate }
      : endKind === "after"
        ? { kind: "after", count }
        : { kind: "never" }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    onSave(customRecurrenceToRule({ freq, interval, weekdays, end }, start, value))
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Repeat</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8 w-full">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-8">
          <span className="text-sm">Every</span>
          <div className="flex items-center gap-2">
            <Input
              variant="default"
              type="number"
              inputMode="numeric"
              aria-label="Interval"
              min={1}
              max={MAX_INTERVAL}
              className="w-16"
              value={intervalText}
              aria-invalid={!isIntervalValid || undefined}
              onChange={(e) => setIntervalText(e.target.value)}
            />
            <Select
              value={String(freq)}
              onValueChange={(v) => setFreq(Number(v) as RecurrenceUnit)}
            >
              <SelectTrigger variant="default" aria-label="Unit" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_UNITS.map((unit) => (
                  <SelectItem key={unit.freq} value={String(unit.freq)}>
                    {interval === 1 ? unit.singular : unit.plural}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {freq === RRule.WEEKLY && (
            <>
              <span className="text-sm">On</span>
              <div className="flex flex-wrap gap-1.5">
                {weekdayOrder.map((day) => {
                  const selected = weekdays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-label={WEEKDAYS[day].long}
                      aria-pressed={selected}
                      onClick={() => setWeekdays(toggleWeekday(weekdays, day))}
                      className={cn(
                        "size-8 rounded-full text-xs font-medium transition-colors",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary-hover",
                      )}
                    >
                      {WEEKDAYS[day].short}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm">Ends</span>
          <RadioGroup
            value={endKind}
            onValueChange={(kind) => setEndKind(kind as RecurrenceEnd["kind"])}
            aria-label="Ends"
            className="grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2"
          >
            <EndOption value="never" label="Never" />
            <span />

            <EndOption value="on" label="On" />
            <DatePicker
              date={endDate}
              setDate={(date) => date && setEndDate(date)}
              readOnly={endKind !== "on"}
              className={cn(
                "w-40 bg-secondary shadow-button-border px-2",
                endKind !== "on" && "opacity-50",
                endKind === "on" && !isEndDateValid && "border-destructive",
              )}
            />

            <EndOption value="after" label="After" />
            <div className={cn("flex items-center gap-2", endKind !== "after" && "opacity-50")}>
              <Input
                variant="default"
                type="number"
                inputMode="numeric"
                aria-label="Occurrences"
                min={1}
                max={MAX_COUNT}
                className="w-16"
                value={countText}
                disabled={endKind !== "after"}
                aria-invalid={(endKind === "after" && !isCountValid) || undefined}
                onChange={(e) => setCountText(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">
                {count === 1 ? "time" : "times"}
              </span>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!isValid}>
            Done
          </Button>
        </DialogFooter>
      </form>
    </Modal>
  )
}

function EndOption({ value, label }: { value: RecurrenceEnd["kind"]; label: string }) {
  const id = useId()
  return (
    <div className="flex h-control items-center gap-2">
      <RadioGroupItem value={value} id={id} />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  )
}
