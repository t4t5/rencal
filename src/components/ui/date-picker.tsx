import { Temporal } from "@js-temporal/polyfill"
import { type ReactNode, useState } from "react"

import { Calendar } from "@/components/ui/calendar"
import { controlSurfaceActive } from "@/components/ui/control-surface"
import { ItemContent } from "@/components/ui/item"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SelectIcon } from "@/components/ui/select"

import { formatShortDate, today } from "@/lib/event-time"
import { jsDateToPlainDate, plainDateToJsDate } from "@/lib/event-time/js-date"
import { cn } from "@/lib/utils"

export const DatePicker = ({
  date,
  setDate,
  addon,
  className,
  readOnly,
}: {
  date: Temporal.PlainDate | null
  setDate: (date: Temporal.PlainDate | null) => void
  addon?: ReactNode
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
            "control-row group h-control cursor-default rounded-md border border-transparent bg-transparent text-left text-sm whitespace-nowrap outline-none select-none hover:border-input",
            controlSurfaceActive.focusVisible,
            controlSurfaceActive.open,
            readOnly && "pointer-events-none",
            className,
          )}
        >
          {addon}
          <ItemContent>{date ? formattedDate : "Select date"}</ItemContent>
          {/* Hidden by default to fit narrow forms; combo-box themes can show it. */}
          {!readOnly && <SelectIcon trailing forceVisible={open} className="hidden" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={date ? plainDateToJsDate(date) : undefined}
          defaultMonth={date ? plainDateToJsDate(date) : undefined}
          captionLayout="dropdown"
          fixedWeeks
          // With year dropdowns, RDP otherwise ends navigation at the current year.
          endMonth={plainDateToJsDate(today().add({ years: 100 }))}
          onSelect={(date) => {
            setDate(date ? jsDateToPlainDate(date) : null)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
