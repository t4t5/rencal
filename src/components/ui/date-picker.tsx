import { format } from "date-fns"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { cn } from "@/lib/utils"

import { DropdownArrow } from "./select"

export const DatePicker = ({
  date,
  setDate,
  className,
  readOnly,
}: {
  date: Date | null
  setDate: (date: Date | null) => void
  className?: string
  readOnly?: boolean
}) => {
  const [open, setOpen] = useState(false)

  const formattedDate = date ? format(date, "EEE d MMM") : null

  return (
    <Popover open={readOnly ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-48 justify-between group cursor-default! transition-none font-ui",
            readOnly && "pointer-events-none",
            className,
          )}
        >
          {date ? formattedDate : "Select date"}

          <DropdownArrow forceVisible={open} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={date ?? undefined}
          captionLayout="dropdown"
          onSelect={(date) => {
            setDate(date ?? null)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
