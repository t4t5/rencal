import { IoSync as RepeatIcon } from "react-icons/io5"
import { RRule, RRuleSet } from "rrule"

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

type Recurrence = RRule | RRuleSet

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
}: {
  value: Recurrence | null
  onChange: (value: Recurrence | null) => void
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
      <SelectTrigger className="w-full justify-start">
        <div>
          <RepeatIcon />
        </div>
        <div className="grow text-left">
          {value ? (
            <HumanInterval recurrence={value} />
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

const HumanInterval = ({ recurrence }: { recurrence: Recurrence }) => {
  const interval = INTERVALS.find((i) => i.rrule.toString() === recurrence.toString())

  if (interval) {
    return <div>{interval.label}</div>
  }

  // For complex recurrence (RRuleSet), use toText() for human-readable output
  if (recurrence instanceof RRuleSet) {
    // RRuleSet doesn't have toText(), get the first rrule's text
    const rrules = recurrence.rrules()
    if (rrules.length > 0) {
      return <div>{rrules[0].toText()}</div>
    }
    return <div>Custom recurrence</div>
  }

  return <div>{recurrence.toText()}</div>
}
