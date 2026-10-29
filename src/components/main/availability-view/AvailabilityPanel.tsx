import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { type AvailabilityMode, useAvailability } from "./AvailabilityContext"
import { SchedulesPanel } from "./SchedulesPanel"
import { SharePanel } from "./SharePanel"

const PANEL_WIDTH = 360

/** The inspector on the right: saved schedules, or times picked by hand. */
export function AvailabilityPanel() {
  const { mode, setMode } = useAvailability()

  return (
    <aside
      data-slot="availability-panel"
      className="flex flex-col shrink-0 min-h-0 border-l border-border bg-background"
      style={{ width: PANEL_WIDTH }}
    >
      <Tabs
        value={mode}
        onValueChange={(next) => setMode(next as AvailabilityMode)}
        className="p-4 pb-3"
      >
        <TabsList className="w-full">
          <TabsTrigger value="schedules" className="grow">
            Recurring
          </TabsTrigger>
          <TabsTrigger value="share" className="grow">
            One-off
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "schedules" ? <SchedulesPanel /> : <SharePanel />}
    </aside>
  )
}
