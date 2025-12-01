import { IoSync as RepeatIcon } from "react-icons/io5"

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

const INTERVALS = [
  {
    value: "daily",
    label: "Every day",
  },
  {
    value: "weekly",
    label: "Every week",
  },
  {
    value: "biweekly",
    label: "Every 2 weeks",
  },
  {
    value: "monthly",
    label: "Every month",
  },
  {
    value: "yearly",
    label: "Every year",
  },
]

export const RepeatSelect = ({
  value,
  onChange,
}: {
  value?: string | null
  onChange: (value: string) => void
}) => {
  return (
    <Select onValueChange={onChange}>
      <SelectTrigger className="w-full justify-start">
        <div>
          <RepeatIcon />
        </div>
        <div className="grow text-left">
          {value ? <HumanInterval intervalValue={value} /> : <span>Repeat</span>}
        </div>
      </SelectTrigger>
      <SelectContent>
        {INTERVALS.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            <HumanInterval intervalValue={i.value} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const HumanInterval = ({ intervalValue }: { intervalValue: string }) => {
  const interval = INTERVALS.find((i) => i.value === intervalValue)

  return <div>{interval?.label}</div>
}
