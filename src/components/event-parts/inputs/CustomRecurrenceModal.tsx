import { FormEvent, useState } from "react"
import { RRule, RRuleSet } from "rrule"

import { Button } from "@/components/ui/button"
import { DialogFooter, DialogHeader, DialogTitle, Modal } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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
  toggleWeekday,
  type RecurrenceUnit,
} from "@/lib/custom-recurrence"
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

export function CustomRecurrenceModal({
  value,
  startWeekday,
  onSave,
  onClose,
}: {
  value: RRule | RRuleSet | null
  /** The event's own weekday (Monday = 0), preselected for a new weekly rule. */
  startWeekday: number
  onSave: (rule: RRule) => void
  onClose: () => void
}) {
  const { firstDayOfWeek } = useSettings()
  const [initial] = useState(() => customRecurrenceFromRule(value, startWeekday))
  const [freq, setFreq] = useState<RecurrenceUnit>(initial.freq)
  // Kept as text so the field can be cleared while typing.
  const [intervalText, setIntervalText] = useState(String(initial.interval))
  const [weekdays, setWeekdays] = useState(initial.weekdays)

  const interval = Number(intervalText)
  const isValid = Number.isInteger(interval) && interval >= 1 && interval <= MAX_INTERVAL
  const weekdayOrder = firstDayOfWeek === "sunday" ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    onSave(customRecurrenceToRule({ freq, interval, weekdays }, value))
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Custom recurrence</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 w-full">
        <div className="flex items-center gap-2">
          <span className="text-sm">Every</span>
          <Input
            variant="default"
            type="number"
            inputMode="numeric"
            aria-label="Interval"
            min={1}
            max={MAX_INTERVAL}
            className="w-16"
            value={intervalText}
            aria-invalid={!isValid || undefined}
            onChange={(e) => setIntervalText(e.target.value)}
          />
          <Select value={String(freq)} onValueChange={(v) => setFreq(Number(v) as RecurrenceUnit)}>
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
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Repeat on</span>
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
          </div>
        )}

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
