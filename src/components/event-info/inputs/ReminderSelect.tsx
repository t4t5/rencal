import { formatDuration } from "date-fns"
import { useState } from "react"
import { GoBell as BellIcon } from "react-icons/go"
import { IoCloseOutline as CloseIcon } from "react-icons/io5"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { InputGroupAddon } from "@/components/ui/input-group"

const DEFAULT_REMINDER_VALUES = [
  { value: 0, label: "At time of event" },
  { value: 10, label: "10 mins" },
  { value: 30, label: "30 mins" },
  { value: 60, label: "1 hour" },
]

function humanDuration(mins: number): string {
  if (mins === 0) return "At time of event"

  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60

  return formatDuration({ days, hours, minutes }, { format: ["days", "hours", "minutes"] })
}

export function ReminderSelect({
  reminders,
  onSelect,
  onRemove,
}: {
  reminders: number[]
  onSelect: (mins: number) => void
  onRemove: (mins: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  return (
    <div className="flex flex-col gap-1">
      <Combobox
        placeholder="Reminders"
        query={query}
        setQuery={setQuery}
        open={open}
        setOpen={setOpen}
        addon={
          <InputGroupAddon>
            <BellIcon />
          </InputGroupAddon>
        }
      >
        {DEFAULT_REMINDER_VALUES.length > 0 ? (
          <CommandGroup>
            {DEFAULT_REMINDER_VALUES.map((opt) => (
              <CommandItem
                key={opt.value}
                onSelect={() => {
                  onSelect(opt.value)
                  setOpen(false)
                }}
              >
                <HumanDuration mins={opt.value} />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
      </Combobox>

      {reminders
        .sort((a, b) => a - b)
        .map((mins) => (
          <ReminderRow key={mins} mins={mins} onRemove={() => onRemove(mins)} />
        ))}
    </div>
  )
}

const ReminderRow = ({ mins, onRemove }: { mins: number; onRemove: () => void }) => {
  return (
    <div
      key={mins}
      className="flex items-center justify-between text-sm hover:bg-secondary rounded-md p-2 pl-9 pr-3 group"
    >
      <span>
        <HumanDuration mins={mins} />
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  )
}

const HumanDuration = ({ mins }: { mins: number }) => {
  return (
    <div className="flex gap-1.5 items-baseline">
      <span>{humanDuration(mins)}</span>
      {!!mins && <span className="text-muted-foreground">before</span>}
    </div>
  )
}
