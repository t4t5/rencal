import { formatDuration } from "date-fns"
import { ReactNode, useState } from "react"

import { Combobox } from "@/components/ui/combo-box"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { InputGroupAddon } from "@/components/ui/input-group"

import { cn } from "@/lib/utils"

import { BellIcon } from "@/icons/bell"
import { CloseIcon } from "@/icons/close"

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

  if (mins < 0) {
    // Negative means "after event start" — used for all-day event reminders
    // e.g. -480 mins = 8 hours after midnight = 08:00 on day of event
    const afterMins = -mins
    const h = Math.floor(afterMins / 60)
      .toString()
      .padStart(2, "0")
    const m = (afterMins % 60).toString().padStart(2, "0")
    return `On day of event (${h}:${m})`
  }

  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60

  return formatDuration({ days, hours, minutes }, { format: ["days", "hours", "minutes"] })
}

export function ReminderSelect({
  reminders,
  onSelect,
  onRemove,
  placeholder = "Reminders",
  addon,
  ghost,
  withInputGroupAddon = true,
}: {
  reminders: number[]
  onSelect: (mins: number) => void
  onRemove: (mins: number) => void
  placeholder?: string
  addon?: ReactNode
  ghost?: boolean
  withInputGroupAddon?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const values = query ? getQueryValues(query) : DEFAULT_REMINDER_VALUES
  const resolvedAddon =
    addon === undefined ? (
      <InputGroupAddon>
        <BellIcon />
      </InputGroupAddon>
    ) : (
      addon
    )

  return (
    <div className="flex flex-col gap-1">
      <Combobox
        placeholder={placeholder}
        query={query}
        setQuery={setQuery}
        open={open}
        setOpen={setOpen}
        addon={resolvedAddon}
        ghost={ghost}
      >
        {values.length ? (
          <CommandGroup>
            {values.map((mins) => (
              <CommandItem
                key={mins}
                onSelect={() => {
                  if (!reminders.includes(mins)) onSelect(mins)
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
          <ReminderRow
            key={mins}
            mins={mins}
            onRemove={() => onRemove(mins)}
            withInputGroupAddon={withInputGroupAddon}
          />
        ))}
    </div>
  )
}

const ReminderRow = ({
  mins,
  className,
  onRemove,
  withInputGroupAddon,
}: {
  mins: number
  className?: string
  onRemove: () => void
  withInputGroupAddon?: boolean
}) => {
  return (
    <div
      key={mins}
      className={cn(
        "flex items-center justify-between text-sm hover:bg-secondary focus-within:bg-secondary rounded-md p-2 pr-3 group cursor-default h-control-height",
        withInputGroupAddon && "pl-0",
        className,
      )}
    >
      <div className="flex gap-2">
        {withInputGroupAddon && <InputGroupAddon />}
        <span>
          <HumanDuration mins={mins} />
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 rounded-xs outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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
      {mins > 0 && <span className="text-muted-foreground">before</span>}
    </div>
  )
}
