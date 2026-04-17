import { HeaderLong } from "@/components/main/HeaderLong"
import { MonthView } from "@/components/main/month-view/MonthView"
import { WeekView } from "@/components/main/week-view/WeekView"
import { Tabs, TabsContent } from "@/components/ui/tabs"

import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

import { CalendarView, calendarViewSchema } from "@/lib/calendar-view"
import { cn } from "@/lib/utils"

export function Main({
  calendarView,
  onChangeCalendarView,
}: {
  calendarView: CalendarView
  onChangeCalendarView: (view: CalendarView) => void
}) {
  const { isDrafting } = useEventDraft()
  const { text } = useEventText()
  const dimmed = isDrafting && text.length > 0

  return (
    <Tabs
      value={calendarView}
      onValueChange={(v) => onChangeCalendarView(calendarViewSchema.parse(v))}
      className={cn(
        "hidden sm:flex flex-col grow transition-opacity duration-200 ease-out",
        dimmed && "opacity-50",
      )}
    >
      <HeaderLong />

      <div className="h-[calc(100vh-64px)] select-none">
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
