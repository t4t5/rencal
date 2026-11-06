import { Temporal } from "@js-temporal/polyfill"
import { signal, Text, View } from "nsh"
import { Button as BaseButton } from "nsh/base"
import { RRule, type RRuleSet } from "rrule"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Radio, RadioGroup } from "@/components/ui/radio"
import { Select } from "@/components/ui/select"

import {
  customRecurrenceFromRule,
  customRecurrenceToRule,
  describeRecurrence,
  isEditableRecurrence,
  RECURRENCE_UNITS,
  type RecurrenceEnd,
  type RecurrenceUnit,
  toggleWeekday,
} from "@/lib/custom-recurrence"
import { dateInEventZone, type EventTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { firstDayOfWeek } from "@/stores/settings"

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

type Props = {
  value: RRule | RRuleSet | null
  /** The event's start: its weekday seeds a new weekly rule and bounds the end date. */
  start: EventTime
  onSave: (rule: RRule) => void
  onClose: () => void
}

export function CustomRecurrenceModal(props: Props) {
  return (
    <If
      when={isEditableRecurrence(props.value)}
      else={<ReadOnlyRecurrence value={props.value!} start={props.start} onClose={props.onClose} />}
    >
      <CustomRecurrenceForm {...props} />
    </If>
  )
}

function ReadOnlyRecurrence(props: {
  value: RRule | RRuleSet
  start: EventTime
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogHeader>
        <DialogTitle>Repeat</DialogTitle>
        <DialogDescription>
          This repeat rule can't be edited in renCal. Choose another option to replace it.
        </DialogDescription>
      </DialogHeader>
      <Text class="text-sm">{describeRecurrence(props.value, props.start)}</Text>
      <DialogFooter>
        <Button variant="secondary" label="Close" onPress={props.onClose} />
      </DialogFooter>
    </Dialog>
  )
}

function CustomRecurrenceForm(props: Props) {
  // Seeded once: the form edits its own copy until Done.
  const initial = customRecurrenceFromRule(props.value, props.start)
  const startDate = () => dateInEventZone(props.start)

  const freq = signal<RecurrenceUnit>(initial.freq)
  // Number fields are kept as text so they can be cleared while typing.
  const intervalText = signal(String(initial.interval))
  const weekdays = signal(initial.weekdays)
  const endKind = signal<RecurrenceEnd["kind"]>(initial.end.kind)
  const endDate = signal(
    initial.end.kind === "on" ? initial.end.date : startDate().add({ months: 1 }),
  )
  const countText = signal(String(initial.end.kind === "after" ? initial.end.count : DEFAULT_COUNT))

  const interval = () => Number(intervalText())
  const count = () => Number(countText())
  const isIntervalValid = () => isWholeNumberIn(interval(), MAX_INTERVAL)
  const isCountValid = () => isWholeNumberIn(count(), MAX_COUNT)
  const isEndDateValid = () => Temporal.PlainDate.compare(endDate(), startDate()) >= 0
  const isValid = () =>
    isIntervalValid() &&
    (endKind() !== "after" || isCountValid()) &&
    (endKind() !== "on" || isEndDateValid())
  const weekdayOrder = () =>
    firstDayOfWeek() === "sunday" ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]

  const end = (): RecurrenceEnd =>
    endKind() === "on"
      ? { kind: "on", date: endDate() }
      : endKind() === "after"
        ? { kind: "after", count: count() }
        : { kind: "never" }

  const submit = () => {
    if (!isValid()) return
    props.onSave(
      customRecurrenceToRule(
        { freq: freq(), interval: interval(), weekdays: weekdays(), end: end() },
        props.start,
        props.value,
      ),
    )
    props.onClose()
  }

  const units = () =>
    RECURRENCE_UNITS.map((unit) => ({
      value: String(unit.freq),
      title: interval() === 1 ? unit.singular : unit.plural,
    }))

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogHeader>
        <DialogTitle>Repeat</DialogTitle>
      </DialogHeader>

      <View class="gap-8">
        <View class="flex-row items-center gap-4">
          <Text class="w-10 text-sm">Every</Text>
          <Input
            variant="default"
            keyboardType="numeric"
            accessibilityLabel="Interval"
            class="w-16"
            value={intervalText()}
            invalid={!isIntervalValid()}
            onChange={({ value }) => intervalText.set(value)}
          />
          <Select
            variant="default"
            triggerClass="w-32"
            accessibilityLabel="Unit"
            items={units()}
            value={String(freq())}
            onChange={(value) => value && freq.set(Number(value) as RecurrenceUnit)}
          />
        </View>

        <If when={freq() === RRule.WEEKLY}>
          <View class="flex-row items-center gap-4">
            <Text class="w-10 text-sm">On</Text>
            <View class="flex-row flex-wrap gap-1.5">
              <Each of={weekdayOrder()}>
                {(day) => {
                  const selected = () => weekdays().includes(day())
                  return (
                    <BaseButton
                      accessibilityLabel={WEEKDAYS[day()]!.long}
                      onPress={() => weekdays.set(toggleWeekday(weekdays(), day()))}
                      class={cn(
                        "size-8 items-center justify-center rounded-full transition-colors",
                        selected() ? "bg-primary" : "bg-secondary hover:bg-secondary-hover",
                      )}
                    >
                      <Text
                        class={cn(
                          "text-xs font-medium",
                          selected() ? "text-primary-foreground" : "text-secondary-foreground",
                        )}
                      >
                        {WEEKDAYS[day()]!.short}
                      </Text>
                    </BaseButton>
                  )
                }}
              </Each>
            </View>
          </View>
        </If>

        <View class="gap-2">
          <Text class="text-sm">Ends</Text>
          <RadioGroup class="gap-2">
            <EndRow
              kind="never"
              label="Never"
              current={endKind()}
              onSelect={(kind) => endKind.set(kind)}
            />
            <View class="flex-row items-center gap-6">
              <EndRow
                kind="on"
                label="On"
                current={endKind()}
                onSelect={(kind) => endKind.set(kind)}
              />
              <DatePicker
                date={endDate()}
                setDate={(date) => endDate.set(date)}
                readOnly={endKind() !== "on"}
                class={cn(
                  "w-40 bg-secondary",
                  endKind() !== "on" && "opacity-50",
                  endKind() === "on" && !isEndDateValid() && "border-destructive",
                )}
              />
            </View>
            <View class="flex-row items-center gap-6">
              <EndRow
                kind="after"
                label="After"
                current={endKind()}
                onSelect={(kind) => endKind.set(kind)}
              />
              <View
                class={cn("flex-row items-center gap-2", endKind() !== "after" && "opacity-50")}
              >
                <Input
                  variant="default"
                  keyboardType="numeric"
                  accessibilityLabel="Occurrences"
                  class="w-16"
                  value={countText()}
                  readonly={endKind() !== "after"}
                  invalid={endKind() === "after" && !isCountValid()}
                  onChange={({ value }) => countText.set(value)}
                />
                <Text class="text-sm text-muted-foreground">
                  {count() === 1 ? "time" : "times"}
                </Text>
              </View>
            </View>
          </RadioGroup>
        </View>

        <DialogFooter>
          <Button variant="secondary" label="Cancel" onPress={props.onClose} />
          <Button label="Done" disabled={!isValid()} onPress={submit} />
        </DialogFooter>
      </View>
    </Dialog>
  )
}

function EndRow(props: {
  kind: RecurrenceEnd["kind"]
  label: string
  current: RecurrenceEnd["kind"]
  onSelect: (kind: RecurrenceEnd["kind"]) => void
}) {
  return (
    <Radio
      class="h-(--control-height) w-16"
      checked={props.current === props.kind}
      onSelect={() => props.onSelect(props.kind)}
    >
      <Text class="text-sm">{props.label}</Text>
    </Radio>
  )
}
