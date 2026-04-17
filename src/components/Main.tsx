import { HeaderLong } from "@/components/header/HeaderLong"
import { MonthView } from "@/components/main/month-view/MonthView"
import { WeekView } from "@/components/main/week-view/WeekView"
import { Tabs, TabsContent } from "@/components/ui/tabs"

import { CalendarView, calendarViewSchema } from "@/lib/calendar-view"

export function Main({
  calendarView,
  onChangeCalendarView,
}: {
  calendarView: CalendarView
  onChangeCalendarView: (view: CalendarView) => void
}) {
  return (
    <Tabs
      value={calendarView}
      onValueChange={(v) => onChangeCalendarView(calendarViewSchema.parse(v))}
      className="hidden sm:flex flex-col grow"
    >
      <HeaderLong />
      <div className="h-[calc(100vh-76px)] select-none">
        <TabsContent value="week" className="h-full">
          <WeekView />
        </TabsContent>
        <TabsContent value="month" className="h-full">
          <MonthView />
        </TabsContent>
      </div>
    </Tabs>
  )
}
