import { useMemo } from "react"

import { MainHeader } from "@/components/main/MainHeader"
import { Tabs, TabsContent } from "@/components/ui/tabs"

import { ViewHostProvider } from "@/views/ViewHostContext"
import { resolveView } from "@/views/manifest"
import { useViews } from "@/views/useViews"

export function Main({
  calendarView,
  onChangeCalendarView,
}: {
  calendarView: string
  onChangeCalendarView: (view: string) => void
}) {
  const views = useViews()
  const active = resolveView(calendarView, views)
  const viewHost = useMemo(() => ({ showView: onChangeCalendarView }), [onChangeCalendarView])

  return (
    <Tabs
      value={active.id}
      onValueChange={onChangeCalendarView}
      className="hidden sm:flex flex-col grow min-w-0"
    >
      <MainHeader activeView={active} onChangeCalendarView={onChangeCalendarView} />

      <div data-slot="main-viewport" className="flex-1 min-h-0 select-none">
        <ViewHostProvider value={viewHost}>
          {views.map(({ id, component: View }) => (
            <TabsContent key={id} value={id} className="h-full">
              <View />
            </TabsContent>
          ))}
        </ViewHostProvider>
      </div>
    </Tabs>
  )
}
