import { useState } from "react"
import { GoClock as ClockIcon } from "react-icons/go"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { InputGroupAddon } from "@/components/ui/input-group"

const options = [
  { value: "5", label: "5 mins" },
  { value: "10", label: "10 mins" },
  { value: "30", label: "30 mins" },
]

export function ReminderSelect() {
  const [value, setValue] = useState("")
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filtered = options.filter((opt) => opt.label.toLowerCase().includes(query.toLowerCase()))

  return (
    <Combobox
      placeholder="Reminders"
      query={query}
      setQuery={setQuery}
      open={open}
      setOpen={setOpen}
      addon={
        <InputGroupAddon>
          <ClockIcon />
        </InputGroupAddon>
      }
    >
      {filtered.length > 0 ? (
        <CommandGroup>
          {filtered.map((opt) => (
            <CommandItem
              key={opt.value}
              onSelect={() => {
                setValue(opt.value)
                setQuery(opt.label) // set selected label into input
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
  )
}
