import { useState } from "react"
import { RRule, RRuleSet } from "rrule"

import { CustomRecurrenceModal } from "@/components/event-parts/inputs/CustomRecurrenceModal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ItemContent, ItemMedia } from "@/components/ui/item"
import { SelectMenuTrigger } from "@/components/ui/select"

import { describeRecurrence, ruleString } from "@/lib/custom-recurrence"
import { dateInEventZone, type EventTime } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"
import { RepeatIcon } from "@/icons/repeat"

const INTERVALS = [
  {
    rrule: new RRule({ freq: RRule.DAILY }),
    label: "Every day",
  },
  {
    rrule: new RRule({ freq: RRule.WEEKLY }),
    label: "Every week",
  },
  {
    rrule: new RRule({ freq: RRule.WEEKLY, interval: 2 }),
    label: "Every 2 weeks",
  },
  {
    rrule: new RRule({ freq: RRule.MONTHLY }),
    label: "Every month",
  },
  {
    rrule: new RRule({ freq: RRule.YEARLY }),
    label: "Every year",
  },
]

const CUSTOM = "custom"

export const RepeatSelect = ({
  value,
  start,
  onChange,
  readOnly,
}: {
  value: RRule | RRuleSet | null
  /** The event's start, whose weekday a new custom weekly rule starts from. */
  start: EventTime
  onChange: (value: RRule | RRuleSet | null) => void
  readOnly?: boolean
}) => {
  const [showCustomModal, setShowCustomModal] = useState(false)
  const preset = value && INTERVALS.find((i) => i.rrule.toString() === ruleString(value))
  const selectedValue = !value ? "none" : preset ? preset.rrule.toString() : CUSTOM

  const handleChange = (next: string) => {
    if (next === "none") {
      onChange(null)
      return
    }
    if (next === CUSTOM) {
      setShowCustomModal(true)
      return
    }
    const interval = INTERVALS.find((i) => i.rrule.toString() === next)
    if (interval) {
      onChange(interval.rrule)
    }
  }

  const options = [
    { value: "none", label: "No repeat" },
    ...INTERVALS.map((i) => ({ value: i.rrule.toString(), label: i.label })),
    { value: CUSTOM, label: "Custom…" },
  ]

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild disabled={readOnly}>
          <SelectMenuTrigger
            controlLayout
            className={cn(
              "w-full justify-start",
              readOnly && "pointer-events-none disabled:cursor-default disabled:opacity-100",
            )}
          >
            <ItemMedia>
              <RepeatIcon />
            </ItemMedia>
            <ItemContent className="overflow-hidden text-left">
              {value ? (
                <span className="block truncate">{getHumanInterval(value)}</span>
              ) : (
                <span className="text-placeholder-foreground">Repeat</span>
              )}
            </ItemContent>
          </SelectMenuTrigger>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-(--radix-dropdown-menu-trigger-width)">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => handleChange(option.value)}
              className="gap-(--control-content-gap)"
            >
              <ItemContent>{option.label}</ItemContent>
              <CheckIcon className={cn(selectedValue !== option.value && "invisible")} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {showCustomModal && (
        <CustomRecurrenceModal
          value={value}
          // Temporal counts Monday = 1 … Sunday = 7; rrule.js Monday = 0.
          startWeekday={dateInEventZone(start).dayOfWeek - 1}
          onSave={onChange}
          onClose={() => setShowCustomModal(false)}
        />
      )}
    </>
  )
}

function getHumanInterval(recurrence: RRule | RRuleSet): string {
  const interval = INTERVALS.find((i) => i.rrule.toString() === ruleString(recurrence))
  return interval ? interval.label : describeRecurrence(recurrence)
}
