import { i18n } from "@lingui/core"
import { msg, t } from "@lingui/core/macro"
import { RRule, RRuleSet } from "rrule"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ItemContent, ItemMedia } from "@/components/ui/item"
import { SelectMenuTrigger } from "@/components/ui/select"

import { describeRecurrence } from "@/lib/recurrence-text"
import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"
import { RepeatIcon } from "@/icons/repeat"

const INTERVALS = [
  {
    rrule: new RRule({ freq: RRule.DAILY }),
    label: msg`Every day`,
  },
  {
    rrule: new RRule({ freq: RRule.WEEKLY }),
    label: msg`Every week`,
  },
  {
    rrule: new RRule({ freq: RRule.WEEKLY, interval: 2 }),
    label: msg`Every 2 weeks`,
  },
  {
    rrule: new RRule({ freq: RRule.MONTHLY }),
    label: msg`Every month`,
  },
  {
    rrule: new RRule({ freq: RRule.YEARLY }),
    label: msg`Every year`,
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
    { value: "none", label: t`No repeat` },
    ...INTERVALS.map((i) => ({ value: i.rrule.toString(), label: i18n._(i.label) })),
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
              <span className="text-placeholder-foreground">
                {t({ message: "Repeat", context: "recurrence placeholder" })}
              </span>
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
  if (interval) return i18n._(interval.label)

  const rule = recurrence instanceof RRuleSet ? recurrence.rrules()[0] : recurrence
  if (!rule) return t`Custom recurrence`

  // rrule's own describer only speaks English: use it as the last resort there.
  return describeRecurrence(rule) ?? (i18n.locale === "en" ? rule.toText() : t`Custom recurrence`)
}
