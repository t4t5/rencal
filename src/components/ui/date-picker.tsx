import { format } from "date-fns"
import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { cn } from "@/lib/utils"

export const DatePicker = ({
  date,
  setDate,
  className,
}: {
  date: Date | null
  setDate: (date: Date | null) => void
  className?: string
}) => {
  const [open, setOpen] = useState(false)

  const formattedDate = date ? format(date, "EEE d MMM") : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-48 justify-between group cursor-default!", className)}
        >
          {date ? formattedDate : "Select date"}
          <ChevronDownIcon className="opacity-0 group-hover:opacity-100 transition text-muted-foreground" />
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
