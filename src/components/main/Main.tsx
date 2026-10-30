import type { ComponentProps } from "react"

import { MainHeader } from "@/components/main/MainHeader"
import { Tabs, TabsContent } from "@/components/ui/tabs"

import { DayGridProvider } from "@/contexts/DayGridContext"
import { useSettings } from "@/contexts/SettingsContext"

import { useIsDimmed } from "@/hooks/useIsDimmed"
import { cn } from "@/lib/utils"

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

  return (
    <Tabs
      value={active.id}
      onValueChange={onChangeCalendarView}
      className="hidden sm:flex flex-col grow min-w-0"
    >
      <MainHeader activeView={active} onChangeCalendarView={onChangeCalendarView} />

      <DayGridProvider>
        <MainViewport>
          {views.map(({ id, component: View }) => (
            <TabsContent key={id} value={id} className="h-full">
              <View />
            </TabsContent>
          ))}
        </MainViewport>
      </DayGridProvider>
    </Tabs>
  )
}

/**
 * Mounts the views once settings are read, so they lay out with the user's
 * week start from the first frame. `data-dimmed` fades them while the user
 * types a new event in the header.
 */
function MainViewport({ className, children, ...props }: ComponentProps<"div">) {
  const { settingsLoaded } = useSettings()
  const dimmed = useIsDimmed()

  return (
    <div
      {...props}
      data-slot="main-viewport"
      data-dimmed={dimmed || undefined}
      className={cn("flex-1 min-h-0 select-none", className)}
    >
      {settingsLoaded && children}
    </div>
  )
}
