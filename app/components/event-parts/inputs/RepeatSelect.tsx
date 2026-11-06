import { signal, Text, token } from "nsh"
import { RRule, type RRuleSet } from "rrule"

import { ItemContent, ItemMedia } from "@/components/ui/item"
import { Menu, MenuItem } from "@/components/ui/menu"
import { SelectTrigger } from "@/components/ui/select"

import { describeRecurrence, ruleString } from "@/lib/custom-recurrence"
import type { EventTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { CheckIcon, RepeatIcon } from "@/icons"

import { CustomRecurrenceModal } from "./CustomRecurrenceModal"

const INTERVALS = [
  { rrule: new RRule({ freq: RRule.DAILY }), label: "Every day" },
  { rrule: new RRule({ freq: RRule.WEEKLY }), label: "Every week" },
  { rrule: new RRule({ freq: RRule.WEEKLY, interval: 2 }), label: "Every 2 weeks" },
  { rrule: new RRule({ freq: RRule.MONTHLY }), label: "Every month" },
  { rrule: new RRule({ freq: RRule.YEARLY }), label: "Every year" },
]

const CUSTOM = "custom"
const NONE = "none"

const OPTIONS = [
  { value: NONE, label: "No repeat" },
  ...INTERVALS.map((interval) => ({ value: interval.rrule.toString(), label: interval.label })),
  { value: CUSTOM, label: "Custom…" },
]

export function RepeatSelect(props: {
  value: RRule | RRuleSet | null
  /** The event's start, which the custom recurrence editor builds its rule for. */
  start: EventTime
  onChange: (value: RRule | RRuleSet | null) => void
  readOnly?: boolean
}) {
  const showCustomModal = signal(false)
  const preset = () =>
    props.value && INTERVALS.find((i) => i.rrule.toString() === ruleString(props.value!))
  const selected = () => (!props.value ? NONE : (preset()?.rrule.toString() ?? CUSTOM))
  const label = () =>
    props.value ? (preset()?.label ?? describeRecurrence(props.value, props.start)) : "Repeat"

  const choose = (next: string) => {
    if (next === NONE) props.onChange(null)
    else if (next === CUSTOM) showCustomModal.set(true)
    else {
      const interval = INTERVALS.find((i) => i.rrule.toString() === next)
      if (interval) props.onChange(interval.rrule)
    }
  }

  return (
    <>
      <Menu
        class="w-full"
        open={props.readOnly ? false : undefined}
        popupClass="w-[316px]"
        trigger={
          <SelectTrigger class={cn("w-full", props.readOnly && "hover:border-transparent")}>
            <ItemMedia>
              <RepeatIcon color={token("muted-foreground")} />
            </ItemMedia>
            <ItemContent>
              <Text
                class={cn(
                  "truncate text-sm",
                  props.value ? "text-foreground" : "text-placeholder-foreground",
                )}
              >
                {label()}
              </Text>
            </ItemContent>
          </SelectTrigger>
        }
      >
        <Each of={OPTIONS} key={(option) => option.value}>
          {(option) => (
            <MenuItem onSelect={() => choose(option().value)}>
              <ItemContent>
                <Text class="text-sm text-foreground">{option().label}</Text>
              </ItemContent>
              <CheckIcon class={cn(selected() !== option().value && "opacity-0")} />
            </MenuItem>
          )}
        </Each>
      </Menu>

      <If when={showCustomModal()}>
        <CustomRecurrenceModal
          value={props.value}
          start={props.start}
          onSave={props.onChange}
          onClose={() => showCustomModal.set(false)}
        />
      </If>
    </>
  )
}
