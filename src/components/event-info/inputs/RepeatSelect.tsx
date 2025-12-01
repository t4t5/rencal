import { IoSync as RepeatIcon } from "react-icons/io5"
import { RRule } from "rrule"

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

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
  value: RRule | null
  onChange: (value: RRule | null) => void
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
          {value ? <HumanInterval rrule={value} /> : <span>Repeat</span>}
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

const HumanInterval = ({ rrule }: { rrule: RRule }) => {
  const interval = INTERVALS.find((i) => i.rrule.toString() === rrule.toString())

  return <div>{interval?.label ?? rrule.toText()}</div>
}
