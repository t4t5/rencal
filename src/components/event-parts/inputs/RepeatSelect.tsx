import { RRule, RRuleSet } from "rrule"

import { InputGroupAddon } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

import { cn } from "@/lib/utils"

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
  const handleChange = (selectedValue: string) => {
    if (selectedValue === "none") {
      onChange(null)
      return
    }
    const interval = INTERVALS.find((i) => i.rrule.toString() === selectedValue)
    if (interval) {
      onChange(interval.rrule)
    }
  }

  return (
    <Select value={value?.toString() ?? "none"} onValueChange={handleChange}>
      <SelectTrigger className={cn("w-full justify-start pl-0", readOnly && "pointer-events-none")}>
        <InputGroupAddon>
          <RepeatIcon />
        </InputGroupAddon>
        <div className="grow text-left overflow-hidden">
          {value ? (
            <div className="overflow-hidden text-ellipsis">{getHumanInterval(value)}</div>
          ) : (
            <span className="text-muted-foreground">Repeat</span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No repeat</SelectItem>
        {INTERVALS.map((i) => (
          <SelectItem key={i.rrule.toString()} value={i.rrule.toString()}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
