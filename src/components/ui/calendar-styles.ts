// Weekday labels indexed by day number (0=Sun … 6=Sat).
export const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const

export const calendarSharedStyles = {
  root: "bg-background group/calendar p-3 [--cell-size:--spacing(8)]",
  months: "flex gap-4 flex-col md:flex-row relative",
  nav: "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
  navButton: "aria-disabled:opacity-50 select-none",
  monthCaption: "flex items-center justify-between gap-1.5 w-full pb-4",
  dropdowns: "w-full flex items-center text-sm font-medium justify-center h-control gap-1.5",
  table: "w-full border-collapse",
  weekdays: "flex",
  weekday: "text-muted-foreground rounded-md flex-1 font-normal select-none text-2xs",
  weekNumberHeader: "select-none w-(--cell-size)",
  weekNumber: "text-xs select-none text-muted-foreground",
  outside: "text-muted-foreground aria-selected:text-muted-foreground",
  disabled: "text-muted-foreground opacity-50",
} as const
