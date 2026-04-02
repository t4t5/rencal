import { SearchBar } from "@/components/search/SearchBar"
import { Button } from "@/components/ui/button"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"

export function HeaderLong() {
  const { navigateToDate } = useCalendarNavigation()

  return (
    <div className="h-18 shrink-0 items-center flex gap-2 p-4">
      <div className="flex gap-2 items-center">
        <Button variant="secondary" onClick={() => navigateToDate(new Date())}>
          Today
        </Button>
      </div>

      <div className="grow h-full" data-tauri-drag-region />

      <TabsList>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="month">Month</TabsTrigger>
      </TabsList>

      <SearchBar className="w-56 starting:w-56" eventPopoverSide="left" />
    </div>
  )
}
