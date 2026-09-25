import * as React from "react"
import {
  DayButton,
  DayPicker,
  type DropdownProps,
  getDefaultClassNames,
  MonthCaption,
  type MonthCaptionProps,
  useDayPicker,
} from "react-day-picker"

import { Button } from "@/components/ui/button"
import { calendarSharedStyles, WEEKDAY_SHORT } from "@/components/ui/calendar-styles"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useSettings } from "@/contexts/SettingsContext"

import { isoWeekNumber } from "@/lib/event-time"
import { jsDateToPlainDate } from "@/lib/event-time/js-date"
import { cn } from "@/lib/utils"

import { ChevronLeftIcon } from "@/icons/chevron-left"
import { ChevronRightIcon } from "@/icons/chevron-right"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()
  const { firstDayOfWeek, showWeekNumbers } = useSettings()
  const showWeekNumber = props.showWeekNumber ?? showWeekNumbers

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={firstDayOfWeek === "sunday" ? 0 : 1}
      showWeekNumber={showWeekNumber}
      // CalendarHeader renders the arrows in the caption row instead.
      hideNavigation
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
        formatWeekdayName: (date) => WEEKDAY_SHORT[date.getDay()],
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(calendarSharedStyles.months, defaultClassNames.months),
        month: cn("flex flex-col w-full", defaultClassNames.month),
        month_caption: cn(calendarSharedStyles.monthCaption, defaultClassNames.month_caption),
        dropdowns: cn(calendarSharedStyles.dropdowns, defaultClassNames.dropdowns),
        caption_label: cn("select-none font-medium text-sm", defaultClassNames.caption_label),
        table: calendarSharedStyles.table,
        weekdays: cn(calendarSharedStyles.weekdays, defaultClassNames.weekdays),
        weekday: cn(calendarSharedStyles.weekday, defaultClassNames.weekday),
        week: cn("flex w-full", defaultClassNames.week),
        week_number_header: cn(
          calendarSharedStyles.weekNumberHeader,
          defaultClassNames.week_number_header,
        ),
        week_number: cn(calendarSharedStyles.weekNumber, defaultClassNames.week_number),
        day: cn(
          "relative w-full h-full p-0 text-center [&:last-child[data-selected=true]_button]:rounded-r-md group/day select-none",
          showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-md"
            : "[&:first-child[data-selected=true]_button]:rounded-l-md",
          defaultClassNames.day,
        ),
        range_start: cn("rounded-l-md bg-accent", defaultClassNames.range_start),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        today: defaultClassNames.today,
        outside: cn(calendarSharedStyles.outside, defaultClassNames.outside),
        disabled: cn(calendarSharedStyles.disabled, defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />
        },
        MonthCaption: CalendarHeader,
        Dropdown: CalendarDropdown,
        MonthGrid: (props) => <table data-slot="calendar-grid" {...props} />,
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

// One row like the minical header: arrows either side of the month and year.
function CalendarHeader({ children, ...captionProps }: MonthCaptionProps) {
  return (
    <MonthCaption data-slot="calendar-header" {...captionProps}>
      <CalendarNavButton direction="previous" />
      {children}
      <CalendarNavButton direction="next" />
    </MonthCaption>
  )
}

function CalendarNavButton({ direction }: { direction: "previous" | "next" }) {
  const defaultClassNames = getDefaultClassNames()
  const { previousMonth, nextMonth, goToMonth, labels } = useDayPicker()
  const previous = direction === "previous"
  const month = previous ? previousMonth : nextMonth
  const Icon = previous ? ChevronLeftIcon : ChevronRightIcon

  return (
    <Button
      type="button"
      data-direction={direction}
      variant="ghost"
      size="icon"
      aria-label={previous ? labels.labelPrevious(month) : labels.labelNext(month)}
      aria-disabled={month ? undefined : true}
      tabIndex={month ? undefined : -1}
      className={cn(
        calendarSharedStyles.navButton,
        previous ? defaultClassNames.button_previous : defaultClassNames.button_next,
      )}
      onClick={() => month && goToMonth(month)}
    >
      <Icon className="size-4" />
    </Button>
  )
}

// Our Select replaces RDP's native <select>, so the month and year pickers are
// themed like every other select control.
function CalendarDropdown({
  options,
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: DropdownProps) {
  // RDP only reads `target.value` from the change event.
  const handleValueChange = (nextValue: string) =>
    onChange?.({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>)

  return (
    <Select value={String(value)} onValueChange={handleValueChange} disabled={disabled}>
      <SelectTrigger variant="default" aria-label={ariaLabel}>
        {/* Stacking every label in one cell sizes the trigger to the widest,
            so paging through months doesn't resize the popover. */}
        <span className="grid">
          {options?.map((option) => (
            <span key={option.value} className="invisible col-start-1 row-start-1">
              {option.label}
            </span>
          ))}
          {/* Radix drops SelectValue's className, so a wrapper places it. */}
          <span className="col-start-1 row-start-1">
            <SelectValue />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {options?.map((option) => (
          <SelectItem key={option.value} value={String(option.value)} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      data-selected={
        (modifiers.selected &&
          !modifiers.range_start &&
          !modifiers.range_end &&
          !modifiers.range_middle) ||
        undefined
      }
      data-today={modifiers.today || undefined}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "data-selected:bg-selected data-selected:text-selected-foreground data-today:text-today data-today:data-selected:bg-today data-today:data-selected:text-today-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 flex h-(--cell-size) w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
