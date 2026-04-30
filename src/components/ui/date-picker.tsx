import { format } from "date-fns"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { cn } from "@/lib/utils"

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
            "justify-between group cursor-default! transition-none font-[inherit] normal-case focus-visible:border-transparent! focus-visible:ring-0! focus-visible:bg-secondary px-2!",
            readOnly && "pointer-events-none",
            className,
          )}
        >
          {date ? formattedDate : "Select date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={date ?? undefined}
          defaultMonth={date ?? undefined}
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
