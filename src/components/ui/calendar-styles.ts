import { weekdayNames } from "@/lib/event-time"

/** Upper-case short weekday label in the display locale for a JS day number (0 = Sunday … 6 = Saturday). */
export function weekdayShortLabel(jsDay: number): string {
  return weekdayNames("short")[(jsDay + 6) % 7].toLocaleUpperCase()
}

/** Inverse of weekdayShortLabel: the JS day number for a rendered label, or -1. */
export function jsDayOfShortLabel(label: string): number {
  return [0, 1, 2, 3, 4, 5, 6].find((jsDay) => weekdayShortLabel(jsDay) === label) ?? -1
}

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
