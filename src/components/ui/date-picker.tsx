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
  embedded = false,
}: {
  date: Temporal.PlainDate | null
  setDate: (date: Temporal.PlainDate | null) => void
  className?: string
  readOnly?: boolean
  embedded?: boolean
}) => {
  const [open, setOpen] = useState(false)

  const formattedDate = date ? formatShortDate(date) : null

  return (
    <Popover open={readOnly ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="input"
          typography="field"
          data-control-part={embedded ? "content" : undefined}
          disabled={readOnly}
          className={cn(
            "group cursor-default transition-none focus-visible:border-transparent focus-visible:bg-secondary focus-visible:ring-0",
            embedded
              ? "h-full min-w-0 flex-1 justify-start rounded-none border-0 bg-transparent px-0 shadow-none hover:border-transparent hover:bg-transparent data-[state=open]:bg-transparent"
              : "justify-between px-2",
            readOnly && "pointer-events-none disabled:cursor-default disabled:opacity-100",
            className,
          )}
        >
          {date ? formattedDate : "Select date"}
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
