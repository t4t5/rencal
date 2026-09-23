import { useCallback } from "react"

import { Button } from "@/components/ui/button"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

import { formatMonth } from "@/lib/event-time"
import { jsDateToPlainDate, plainDateToJsDate } from "@/lib/event-time/js-date"

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
      navigateToDate(jsDateToPlainDate(date))
      // Remove focus from the day button so global shortcuts (arrows, etc.) work
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    },
    [navigateToDate],
  )

  return (
    <div data-slot="minical" className="pt-4 select-none">
      <div data-slot="minical-header" className="flex items-center justify-between px-4 pb-4 h-12">
        <CurrentMonth />
        <ArrowKeys />
      </div>

      <EventDotsProvider value={eventDotsByDate}>
        <Calendar
          mode="single"
          selected={plainDateToJsDate(activeDate)}
          onSelect={handleDateSelect}
          month={plainDateToJsDate(activeDate)}
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
    <h2
      data-slot="minical-title"
      data-typography="heading"
      className="text-2xl font-bold whitespace-nowrap overflow-hidden text-ellipsis"
    >
      {formatMonth(activeDate, "long")}{" "}
      <span data-slot="minical-year" className="text-highlight font-normal">
        {activeDate.year}
      </span>
    </h2>
  )
}

const ArrowKeys = () => {
  const { activeDate, navigateToDate } = useCalendarNavigation()

  return (
    <div data-slot="minical-navigation" className="flex items-center gap-1">
      <Button
        data-direction="previous"
        aria-label="Previous month"
        variant="ghost"
        size="icon-xs"
        round
        tabIndex={-1}
        onClick={() => navigateToDate(activeDate.subtract({ months: 1 }))}
      >
        <ChevronUpIcon className="size-4" />
      </Button>
      <Button
        data-direction="next"
        aria-label="Next month"
        variant="ghost"
        size="icon-xs"
        round
        tabIndex={-1}
        onClick={() => navigateToDate(activeDate.add({ months: 1 }))}
      >
        <ChevronDownIcon className="size-4" />
      </Button>
    </div>
  )
}
