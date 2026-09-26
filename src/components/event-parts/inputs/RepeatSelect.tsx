import { RRule, RRuleSet } from "rrule"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ItemContent, ItemMedia } from "@/components/ui/item"
import { SelectMenuTrigger } from "@/components/ui/select"

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

export const RepeatSelect = ({
  value,
  onChange,
  readOnly,
}: {
  value: RRule | RRuleSet | null
  onChange: (value: RRule | RRuleSet | null) => void
  readOnly?: boolean
}) => {
  const selectedValue = value?.toString() ?? "none"

  const handleChange = (next: string) => {
    if (next === "none") {
      onChange(null)
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
  ]

  return (
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
  )
}

function getHumanInterval(recurrence: RRule | RRuleSet): string {
  const interval = INTERVALS.find((i) => i.rrule.toString() === recurrence.toString())
  if (interval) return interval.label

  if (recurrence instanceof RRuleSet) {
    const rrules = recurrence.rrules()
    if (rrules.length > 0) return rrules[0].toText()
    return "Custom recurrence"
  }

  return recurrence.toText()
}
