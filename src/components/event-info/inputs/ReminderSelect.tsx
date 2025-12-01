import { useState } from "react"
import { GoBell as BellIcon } from "react-icons/go"
import { IoCloseOutline as CloseIcon } from "react-icons/io5"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { InputGroupAddon } from "@/components/ui/input-group"

const options = [
  { value: 0, label: "At time of event" },
  { value: 5, label: "5 mins" },
  { value: 10, label: "10 mins" },
  { value: 30, label: "30 mins" },
]

function getLabelForMinutes(mins: number): string {
  const option = options.find((opt) => opt.value === mins)
  return option?.label ?? `${mins} mins`
}

interface ReminderSelectProps {
  reminders: number[]
  onSelect: (mins: number) => void
  onRemove: (mins: number) => void
}

export function ReminderSelect({ reminders, onSelect, onRemove }: ReminderSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filtered = options.filter((opt) => opt.label.toLowerCase().includes(query.toLowerCase()))

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
        {filtered.length > 0 ? (
          <CommandGroup>
            {filtered.map((opt) => (
              <CommandItem
                key={opt.value}
                onSelect={() => {
                  onSelect(opt.value)
                  setOpen(false)
                }}
              >
                {opt.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
      </Combobox>

      {reminders.map((mins) => (
        <ReminderRow mins={mins} onRemove={() => onRemove(mins)} />
      ))}
    </div>
  )
}

const ReminderRow = ({ mins, onRemove }: { mins: number; onRemove: () => void }) => {
  return (
    <div
      key={mins}
      className="flex items-center justify-between text-sm pl-9 hover:bg-secondary rounded-md p-1.5 group"
    >
      <span>{getLabelForMinutes(mins)}</span>
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
