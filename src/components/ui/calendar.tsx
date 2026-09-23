import * as React from "react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { calendarSharedStyles } from "@/components/ui/calendar-styles"

import { useSettings } from "@/contexts/SettingsContext"

import { isoWeekNumber } from "@/lib/event-time"
import { jsDateToPlainDate } from "@/lib/event-time/js-date"
import { cn } from "@/lib/utils"

import { ChevronDownIcon } from "@/icons/chevron-down"
import { ChevronLeftIcon } from "@/icons/chevron-left"
import { ChevronRightIcon } from "@/icons/chevron-right"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()
  const { firstDayOfWeek, showWeekNumbers } = useSettings()
  const showWeekNumber = props.showWeekNumber ?? showWeekNumbers

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={firstDayOfWeek === "sunday" ? 0 : 1}
      showWeekNumber={showWeekNumber}
      className={cn(
        calendarSharedStyles.root,
        "[[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(calendarSharedStyles.months, defaultClassNames.months),
        month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
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
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label,
        ),
        table: calendarSharedStyles.table,
        weekdays: cn(calendarSharedStyles.weekdays, defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground rounded-md flex-1 font-normal text-xs select-none",
          defaultClassNames.weekday,
        ),
        week: cn("flex w-full mt-2", defaultClassNames.week),
        week_number_header: cn(
          calendarSharedStyles.weekNumberHeader,
          defaultClassNames.week_number_header,
        ),
        week_number: cn(calendarSharedStyles.weekNumber, defaultClassNames.week_number),
        day: cn(
          "relative w-full h-full p-0 text-center [&:last-child[data-selected=true]_button]:rounded-r-md group/day aspect-square select-none",
          showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-md"
            : "[&:first-child[data-selected=true]_button]:rounded-l-md",
          defaultClassNames.day,
        ),
        range_start: cn("rounded-l-md bg-accent", defaultClassNames.range_start),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        today: cn(
          "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
          defaultClassNames.today,
        ),
        outside: cn(calendarSharedStyles.outside, defaultClassNames.outside),
        disabled: cn(calendarSharedStyles.disabled, defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
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
        PreviousMonthButton: ({ className, ...buttonProps }) => {
          return <Button variant={buttonVariant} className={className} {...buttonProps} />
        },
        NextMonthButton: ({ className, ...buttonProps }) => {
          return <Button variant={buttonVariant} className={className} {...buttonProps} />
        },
        Weekday: (props) => <th data-slot="calendar-weekday" {...props} />,
        DayButton: CalendarDayButton,
        // RDP's own numbering follows US week-counting rules; render ISO week
        // numbers computed from the row's days instead (`children` is unused).
        WeekNumber: ({ children, week, ...props }) => {
          const firstRowDay = week.days[0]
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center text-2xs text-muted-foreground">
                {firstRowDay
                  ? isoWeekNumber(jsDateToPlainDate(firstRowDay.date), firstDayOfWeek)
                  : null}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-slot="calendar-day"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
