import { formatDuration } from "date-fns"
import { useState } from "react"
import { GoBell as BellIcon } from "react-icons/go"
import { IoCloseOutline as CloseIcon } from "react-icons/io5"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { InputGroupAddon } from "@/components/ui/input-group"

const DEFAULT_REMINDER_VALUES = [
  0, // At time of event
  10, // 10 mins before
  30, // 30 mins before
  60, // 1 hour before
]

function getQueryValues(query: string): number[] {
  const match = query.match(/^(\d+)/)
  if (!match) return []

  const num = parseInt(match[1], 10)
  if (num <= 0) return []

  return [
    num, // minutes
    num * 60, // hours
    num * 60 * 24, // days
  ]
}

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

  const values = query ? getQueryValues(query) : DEFAULT_REMINDER_VALUES

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
        {values.length ? (
          <CommandGroup>
            {values.map((mins) => (
              <CommandItem
                key={mins}
                onSelect={() => {
                  onSelect(mins)
                  setOpen(false)
                  setQuery("")
                }}
              >
                <HumanDuration mins={mins} />
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
