import { Temporal } from "@js-temporal/polyfill"
import { useState } from "react"

import { Calendar } from "@/components/ui/calendar"
import { controlSurfaceActive } from "@/components/ui/control-surface"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { formatShortDate } from "@/lib/event-time"
import { jsDateToPlainDate, plainDateToJsDate } from "@/lib/event-time/js-date"
import { cn } from "@/lib/utils"

export const DatePicker = ({
  date,
  setDate,
  className,
  readOnly,
}: {
  date: Temporal.PlainDate | null
  setDate: (date: Temporal.PlainDate | null) => void
  className?: string
  readOnly?: boolean
}) => {
  const [open, setOpen] = useState(false)

  const formattedDate = date ? formatShortDate(date) : null

  return (
    <Popover open={readOnly ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-control="select"
          disabled={readOnly}
          className={cn(
            "flex h-control shrink-0 cursor-default items-center rounded-md border border-transparent bg-transparent px-[var(--control-padding-inline)] text-sm whitespace-nowrap outline-none select-none hover:border-input",
            controlSurfaceActive.focusVisible,
            controlSurfaceActive.open,
            readOnly && "pointer-events-none",
            className,
          )}
        >
          <span>{date ? formattedDate : "Select date"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={date ? plainDateToJsDate(date) : undefined}
          defaultMonth={date ? plainDateToJsDate(date) : undefined}
          captionLayout="dropdown"
          onSelect={(date) => {
            setDate(date ? jsDateToPlainDate(date) : null)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
