import { addMonths, format, subMonths } from "date-fns"
import { useCallback } from "react"

import { Button } from "@/components/ui/button"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import { ChevronDownIcon } from "@/icons/chevron-down"
import { ChevronUpIcon } from "@/icons/chevron-up"

import { Calendar, EventDotsProvider } from "./Calendar"
import { useEventDotsByDate } from "./useEventDotsByDate"

const HiddenComponent = () => <></>

export function Minical() {
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const eventDotsByDate = useEventDotsByDate()

  const handleDateSelect = useCallback(
    (date: Date) => {
      navigateToDate(date)
      // Remove focus from the day button so global shortcuts (arrows, etc.) work
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    },
    [navigateToDate],
  )

  return (
    <div className="pt-4 select-none">
      <div className="flex items-center justify-between px-4 pb-4 h-12">
        <CurrentMonth />
        <ArrowKeys />
      </div>

      <EventDotsProvider value={eventDotsByDate}>
        <Calendar
          mode="single"
          selected={activeDate}
          onSelect={handleDateSelect}
          month={activeDate}
          onMonthChange={handleDateSelect}
          className="bg-transparent p-0"
          required
          components={{
            MonthCaption: HiddenComponent,
            Nav: HiddenComponent,
          }}
        />
      </EventDotsProvider>
    </div>
  )
}

const CurrentMonth = () => {
  const { activeDate } = useCalendarNavigation()

  return (
    <h2 className="text-2xl font-bold heading">
      {format(activeDate, "MMMM")}{" "}
      <span className="text-highlight font-normal">{format(activeDate, "yyyy")}</span>
    </h2>
  )
}

const ArrowKeys = () => {
  const { activeDate, navigateToDate } = useCalendarNavigation()

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        round
        onClick={() => navigateToDate(subMonths(activeDate, 1))}
      >
        <ChevronUpIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        round
        onClick={() => navigateToDate(addMonths(activeDate, 1))}
      >
        <ChevronDownIcon className="size-4" />
      </Button>
    </div>
  )
}
