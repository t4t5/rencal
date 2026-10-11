import type { Temporal } from "@js-temporal/polyfill"
import { RRule, RRuleSet, rrulestr } from "rrule"

import { RemoveItemButton } from "@/components/event-parts/inputs/RemoveItemButton"
import { DatePicker } from "@/components/ui/date-picker"
import { ItemMedia } from "@/components/ui/item"

import { dateInEventZone, type EventTime } from "@/lib/event-time"
import { recurrenceCount, recurrenceEndDate, withRecurrenceEnd } from "@/lib/recurrence-end"
import { rruleToRecurrence } from "@/lib/rrule-utils"

/** "Ends on" date of a repeating event; no date means it repeats forever. */
export function RecurrenceEndSelect({
  value,
  start,
  onChange,
  readOnly,
}: {
  value: RRule | RRuleSet
  start: EventTime
  onChange: (value: RRule | RRuleSet) => void
  readOnly?: boolean
}) {
  const rrule = rruleToRecurrence(value)?.rrule ?? ""
  const endDate = recurrenceEndDate(rrule, start)
  const count = recurrenceCount(rrule)

  const setEndDate = (date: Temporal.PlainDate | null) => {
    const rule = rrulestr(withRecurrenceEnd(rrule, start, date)) as RRule
    onChange(withRule(value, rule))
  }

  return (
    <div className="group flex items-center gap-(--control-content-gap) pr-(--control-padding-inline)">
      <DatePicker
        date={endDate}
        setDate={setEndDate}
        // The empty icon slot lines the text up with the Repeat field above.
        addon={
          <>
            <ItemMedia />
            {endDate && <span className="text-muted-foreground">Ends</span>}
          </>
        }
        placeholder={
          <span className="text-placeholder-foreground">
            {count ? `Ends after ${count} ${count === 1 ? "time" : "times"}` : "Never ends"}
          </span>
        }
        minDate={dateInEventZone(start)}
        className="grow"
        readOnly={readOnly}
      />
      {(endDate || count) && !readOnly && <RemoveItemButton onClick={() => setEndDate(null)} />}
    </div>
  )
}

/** Swap the rule of `value`, keeping a set's exception and extra dates. */
function withRule(value: RRule | RRuleSet, rule: RRule): RRule | RRuleSet {
  if (!(value instanceof RRuleSet)) return rule

  const set = new RRuleSet()
  set.rrule(rule)
  for (const date of value.exdates()) set.exdate(date)
  for (const date of value.rdates()) set.rdate(date)
  return set
}
