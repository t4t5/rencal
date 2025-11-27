import { ReactNode } from "react"

import { AllDaySection } from "@/components/event-card/AllDaySection"
import { LocationSection } from "@/components/event-card/LocationSection"
import { TimeSection } from "@/components/event-card/TimeSection"
import { Card } from "@/components/ui/card"

export function EventCard({
  summary,
  onChangeSummary,
  start,
  onChangeStartTime,
  end,
  onChangeEndTime,
  allDay,
  onAllDayChange,
  children,
}: {
  summary?: string | null
  onChangeSummary: (summary: string) => void
  start: Date
  onChangeStartTime: (time: string) => void
  end: Date
  onChangeEndTime: (time: string) => void
  allDay: boolean
  onAllDayChange: (checked: boolean) => void
  children?: ReactNode
}) {
  return (
    <Card className="gap-4">
      <input
        value={summary ?? ""}
        className="text-base outline-none!"
        onChange={(e) => onChangeSummary(e.target.value)}
      />

      <div className="flex flex-col gap-4">
        <TimeSection
          start={start}
          end={end}
          allDay={allDay}
          onChangeStartTime={onChangeStartTime}
          onChangeEndTime={onChangeEndTime}
        />
        <AllDaySection checked={allDay} onCheckedChange={onAllDayChange} />
        <LocationSection />
      </div>

      {children}
    </Card>
  )
}
