import { ComponentProps, createContext, memo, useContext, useEffect, useRef } from "react"
import {
  Day,
  DayButton,
  DayPicker,
  getDefaultClassNames,
  Month,
  MonthCaption,
  Nav,
  useDayPicker,
  Week,
  Weekday,
} from "react-day-picker"

import { Button } from "@/components/ui/button"
import { calendarSharedStyles } from "@/components/ui/calendar-styles"

import { useSettings } from "@/contexts/SettingsContext"

import { useViewerTzid } from "@/hooks/useViewerTzid"
import { formatDateKey, isoWeekNumber, today } from "@/lib/event-time"
import { jsDateToPlainDate, plainDateToJsDate } from "@/lib/event-time/js-date"
import { cn } from "@/lib/utils"

import { ChevronDownIcon } from "@/icons/chevron-down"
import { ChevronLeftIcon } from "@/icons/chevron-left"
import { ChevronRightIcon } from "@/icons/chevron-right"

/** Maps date strings ("yyyy-MM-dd") to arrays of calendar CSS colors for that date. */
const EventDotsContext = createContext<Map<string, string[]>>(new Map())
export const EventDotsProvider = EventDotsContext.Provider

// Map weekday abbreviations to day numbers (0=Sunday, 1=Monday, etc.)
// Adjust based on your formatWeekdayName formatter
// Weekday short names indexed by day number (0=Sun … 6=Sat)
const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const

// Selected-week highlight as a background-image so it layers over the weekend color
const SELECTED_WEEK_OVERLAY =
  "in-data-selected-week:bg-[linear-gradient(var(--color-hover),var(--color-hover))]"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: ComponentProps<typeof DayPicker> & {
  buttonVariant?: ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()
  const { firstDayOfWeek, showWeekNumbers } = useSettings()
  const showWeekNumber = props.showWeekNumber ?? showWeekNumbers

  // Subscribe to timezone changes: the current-weekday highlight and the
  // `today` prop below all derive from the viewer's zone.
  useViewerTzid()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      fixedWeeks
      today={plainDateToJsDate(today())}
      className={cn(
        calendarSharedStyles.root,
        "in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      weekStartsOn={firstDayOfWeek === "sunday" ? 0 : 1}
      showWeekNumber={showWeekNumber}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
        formatWeekdayName: (date) => WEEKDAY_SHORT[date.getDay()],
        ...formatters,
      }}
      classNames={{
        root: cn("w-full"),
        months: cn(calendarSharedStyles.months, defaultClassNames.months),
        month: cn("flex flex-col w-full gap-4 h-auto overflow-hidden"),
        nav: cn(calendarSharedStyles.nav, defaultClassNames.nav),
        button_previous: cn(calendarSharedStyles.navButton, defaultClassNames.button_previous),
        button_next: cn(calendarSharedStyles.navButton, defaultClassNames.button_next),
        month_caption: cn(calendarSharedStyles.monthCaption, defaultClassNames.month_caption),
        dropdowns: cn(calendarSharedStyles.dropdowns, defaultClassNames.dropdowns),
        dropdown_root: cn(calendarSharedStyles.dropdownRoot, defaultClassNames.dropdown_root),
        dropdown: cn(calendarSharedStyles.dropdown, defaultClassNames.dropdown),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label,
        ),
        table: calendarSharedStyles.table,
        weekdays: cn(calendarSharedStyles.weekdays, defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground rounded-md flex-1 font-normal select-none text-2xs",
          defaultClassNames.weekday,
        ),
        week: cn("flex w-full", defaultClassNames.week),
        week_number_header: cn(
          calendarSharedStyles.weekNumberHeader,
          defaultClassNames.week_number_header,
        ),
        week_number: cn(calendarSharedStyles.weekNumber, defaultClassNames.week_number),
        day: cn(
          "relative w-full h-full p-0 text-center group/day select-none",
          defaultClassNames.day,
        ),
        range_start: cn("rounded-l-md bg-accent", defaultClassNames.range_start),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        // today: cn("text-active", defaultClassNames.today),
        outside: cn(calendarSharedStyles.outside, defaultClassNames.outside),
        disabled: cn(calendarSharedStyles.disabled, defaultClassNames.disabled),
        hidden: cn("invisible"),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon className={cn("size-4", className)} {...props} />
          }

          if (orientation === "right") {
            return <ChevronRightIcon className={cn("size-4", className)} {...props} />
          }

          return <ChevronDownIcon className={cn("size-4", className)} {...props} />
        },
        Month: ({ className, ...monthProps }) => {
          return <Month className={cn(className, "w-full")} {...monthProps} />
        },
        MonthCaption: ({ className, ...captionProps }) => {
          return (
            <MonthCaption {...captionProps} className="text-2xl font-bold pl-4">
              {captionProps.calendarMonth.date.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </MonthCaption>
          )
        },
        Nav: ({ className, ...props }) => {
          return <Nav className={cn(className, "w-auto left-auto right-0 pr-4")} {...props} />
        },
        PreviousMonthButton: ({ className, ...props }) => {
          return <Button variant={buttonVariant} className={className} {...props} />
        },
        NextMonthButton: ({ className, ...props }) => {
          return <Button variant={buttonVariant} className={className} {...props} />
        },
        Week: ({ className, ...weekProps }) => {
          const { week } = weekProps
          const { isSelected } = useDayPicker()

          const isSelectedWeek = isSelected ? week.days.some((d) => isSelected(d.date)) : false

          return (
            <Week
              {...weekProps}
              data-selected-week={isSelectedWeek || undefined}
              className={className}
            />
          )
        },
        // RDP's own numbering follows US week-counting rules; render ISO week
        // numbers computed from the row's days instead (`children` is unused).
        WeekNumber: ({ children, week, ...props }) => {
          const firstRowDay = week.days[0]
          return (
            <td {...props} className={cn(props.className, SELECTED_WEEK_OVERLAY)}>
              <div className="flex size-(--cell-size) translate-y-[2px] items-center justify-center text-center text-2xs text-muted-foreground">
                {firstRowDay
                  ? isoWeekNumber(jsDateToPlainDate(firstRowDay.date), firstDayOfWeek)
                  : null}
              </div>
            </td>
          )
        },
        Weekday: ({ className, children, ...weekdayProps }) => {
          const weekdayName = typeof children === "string" ? children : ""
          const weekdayNumber = WEEKDAY_SHORT.indexOf(weekdayName as (typeof WEEKDAY_SHORT)[number])
          const isCurrentWeekday = weekdayNumber === today().dayOfWeek % 7
          const isWeekend = weekdayNumber === 0 || weekdayNumber === 6

          return (
            <Weekday
              {...weekdayProps}
              data-slot="calendar-weekday"
              data-weekend={isWeekend || undefined}
              className={cn(className, "rounded-none", {
                "text-today": isCurrentWeekday,
                "bg-weekend": isWeekend,
              })}
            >
              {children}
            </Weekday>
          )
        },
        DayButton: CalendarDayButton as typeof DayButton,
        Day: ({ className, ...dayProps }) => {
          const weekdayNumber = dayProps.day.date.getDay()
          const isWeekend = weekdayNumber === 0 || weekdayNumber === 6

          return (
            <Day
              {...dayProps}
              data-weekend={isWeekend || undefined}
              className={cn(
                className,
                "flex justify-center bg-transparent",
                SELECTED_WEEK_OVERLAY,
                { "bg-weekend": isWeekend },
              )}
            />
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

const CalendarDayButton = memo(function CalendarDayButton({
  className,
  day,
  modifiers,
  children,
  ...props
}: ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()
  const eventDotsByDate = useContext(EventDotsContext)

  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const dateKey = formatDateKey(jsDateToPlainDate(day.date))
  const dotColors = eventDotsByDate.get(dateKey)

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon-lg"
      data-slot="calendar-day"
      data-date-key={dateKey}
      data-selected={modifiers.selected || undefined}
      data-today={modifiers.today || undefined}
      className={cn(
        "flex w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 [&>span]:text-xs [&>span]:opacity-70 p-2 size-[38px] rounded-circle text-sm",
        defaultClassNames.day,
        "data-selected:bg-selected data-selected:text-selected-foreground data-selected:font-bold data-selected:text-lg", // selected day
        "data-today:text-today data-today:data-selected:bg-today data-today:data-selected:text-today-foreground", // today
        className,
      )}
      {...props}
      tabIndex={-1}
    >
      {children}
      {dotColors && dotColors.length > 0 && (
        <div
          data-slot="minical-event-dots"
          className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-[3px]"
        >
          {dotColors.map((color, i) => (
            <div key={i} className="size-1 rounded-circle" style={{ backgroundColor: color }} />
          ))}
        </div>
      )}
    </Button>
  )
})

export { Calendar, CalendarDayButton }
