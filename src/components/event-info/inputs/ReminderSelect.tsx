import { useState } from "react"
import { GoBell as BellIcon } from "react-icons/go"
import { GoX as XIcon } from "react-icons/go"

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
    <div className="flex flex-col gap-2">
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

      {reminders.length > 0 && (
        <div className="flex flex-col gap-1 px-3">
          {reminders.map((mins) => (
            <div
              key={mins}
              className="flex items-center justify-between text-sm text-muted-foreground"
            >
              <span>{getLabelForMinutes(mins)}</span>
              <button
                type="button"
                onClick={() => onRemove(mins)}
                className="p-1 hover:text-foreground"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
