export const calendarSharedStyles = {
  root: "bg-background group/calendar p-3 [--cell-size:--spacing(8)]",
  months: "flex gap-4 flex-col md:flex-row relative",
  nav: "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
  navButton: "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
  monthCaption: "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
  dropdowns: "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
  dropdownRoot:
    "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
  dropdown: "absolute bg-popover inset-0 opacity-0",
  table: "w-full border-collapse",
  weekdays: "flex",
  weekNumberHeader: "select-none w-(--cell-size)",
  weekNumber: "text-xs select-none text-muted-foreground",
  outside: "text-muted-foreground aria-selected:text-muted-foreground",
  disabled: "text-muted-foreground opacity-50",
} as const
