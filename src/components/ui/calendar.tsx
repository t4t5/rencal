import { format, getWeek } from "date-fns"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { ComponentProps, useEffect, useRef } from "react"
import { Day, DayButton, DayPicker, getDefaultClassNames, Month, MonthCaption, Nav, Week, Weekday } from "react-day-picker"

import { Button, buttonVariants } from "@/components/ui/button"

import { cn } from "@/lib/utils"

// Map weekday abbreviations to day numbers (0=Sunday, 1=Monday, etc.)
// Adjust based on your formatWeekdayName formatter
const WEEKDAY_MAP: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}

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

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      fixedWeeks
      className={cn(
        "bg-background group/calendar p-3 [--cell-size:--spacing(8)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      weekStartsOn={1}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
        formatWeekdayName: (date) => date.toLocaleString("default", { weekday: "short" }).toUpperCase(),
        ...formatters,
      }}
      classNames={{
        root: cn("w-full"),
        months: cn("flex gap-4 flex-col md:flex-row relative", defaultClassNames.months),
        month: cn("flex flex-col w-full gap-4 h-auto overflow-hidden!"),
        nav: cn("flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between", defaultClassNames.nav),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_next,
        ),
        month_caption: cn("flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)", defaultClassNames.month_caption),
        dropdowns: cn("w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5", defaultClassNames.dropdowns),
        dropdown_root: cn(
          "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn("absolute bg-popover inset-0 opacity-0", defaultClassNames.dropdown),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label,
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn("text-muted-foreground rounded-md flex-1 font-normal select-none text-[11px]", defaultClassNames.weekday),
        week: cn("flex w-full", defaultClassNames.week),
        week_number_header: cn("select-none w-(--cell-size)", defaultClassNames.week_number_header),
        week_number: cn("text-[0.8rem] select-none text-muted-foreground", defaultClassNames.week_number),
        day: cn(
          "relative w-full h-full p-0 text-center [&:last-child[data-selected=true]_button]:rounded-r-md group/day select-none",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-md"
            : "[&:first-child[data-selected=true]_button]:rounded-l-md",
          defaultClassNames.day,
        ),
        range_start: cn("rounded-l-md bg-accent", defaultClassNames.range_start),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        // today: cn("text-active", defaultClassNames.today),
        outside: cn("text-muted-foreground aria-selected:text-muted-foreground", defaultClassNames.outside),
        disabled: cn("text-muted-foreground opacity-50", defaultClassNames.disabled),
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
              {format(captionProps.calendarMonth.date, "MMMM yyyy")}
            </MonthCaption>
          )
        },
        Nav: ({ className, ...props }) => {
          return <Nav className={cn(className, "w-auto left-auto right-0 pr-4")} {...props} />
        },
        PreviousMonthButton: ({ className, ...props }) => {
          return <Button variant="secondary" className={cn(className)} {...props} />
        },
        NextMonthButton: ({ className, ...props }) => {
          return <Button variant="secondary" className={cn(className)} {...props} />
        },
        Week: ({ className, ...weekProps }) => {
          const { week } = weekProps

          const currentWeekNumber = getWeek(new Date())
          const isCurrentWeek = week.weekNumber === currentWeekNumber

          return (
            <Week
              className={cn(className, {
                "bg-white/8": isCurrentWeek,
              })}
              {...weekProps}
            />
          )
        },
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">{children}</div>
            </td>
          )
        },
        Weekday: ({ className, children, ...weekdayProps }) => {
          const weekdayName = typeof children === "string" ? children : ""
          const weekdayNumber = WEEKDAY_MAP[weekdayName]
          const isCurrentWeekday = weekdayNumber === new Date().getDay()
          const isWeekend = weekdayNumber === 0 || weekdayNumber === 6

          return (
            <Weekday
              {...weekdayProps}
              className={cn(className, "rounded-none", { "text-active": isCurrentWeekday, "bg-weekendBg": isWeekend })}
            >
              {children}
            </Weekday>
          )
        },
        DayButton: CalendarDayButton,
        Day: ({ className, ...dayProps }) => {
          const weekdayNumber = dayProps.day.date.getDay()
          const isWeekend = weekdayNumber === 0 || weekdayNumber === 6

          return (
            <Day
              {...dayProps}
              className={cn(className, "flex justify-center bg-transparent!", {
                "bg-weekendBg!": isWeekend,
              })}
            />
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({ className, day, modifiers, ...props }: ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-today={modifiers.today}
      className={cn(
        "data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground flex w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70 p-2 size-[38px] rounded-full! text-sm",
        defaultClassNames.day,
        "data-[selected-single=true]:bg-activeBg! data-[selected-single=true]:font-bold! data-[selected-single=true]:text-lg!", // selected day
        "data-[today=true]:text-active data-[today=true]:data-[selected-single=true]:bg-primary! data-[today=true]:data-[selected-single=true]:text-primary-foreground", // today
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
