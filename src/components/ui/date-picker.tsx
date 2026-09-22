import { Temporal } from "@js-temporal/polyfill"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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
        <Button
          variant="input"
          typography="field"
          disabled={readOnly}
          className={cn(
            "group cursor-default justify-start px-[var(--control-padding-inline)] transition-none",
            readOnly && "pointer-events-none disabled:cursor-default disabled:opacity-100",
            className,
          )}
        >
          <span>{date ? formattedDate : "Select date"}</span>
        </Button>
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
