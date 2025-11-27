import { AllDaySection } from "@/components/event-card/AllDaySection"
import { LocationSection } from "@/components/event-card/LocationSection"
import { TimeSection } from "@/components/event-card/TimeSection"
import { Card } from "@/components/ui/card"

export function EventCard({
  summary,
  start,
  end,
  allDay,
  onAllDayChange,
  onChangeStartTime,
  onChangeEndTime,
}: {
  summary?: string | null
  start: Date
  end: Date
  allDay: boolean
  onAllDayChange: (checked: boolean) => void
  onChangeStartTime: (time: string) => void
  onChangeEndTime: (time: string) => void
}) {
  return (
    <Card className="gap-4">
      <input readOnly value={summary ?? ""} className="text-base" />

      <div className="flex flex-col gap-3">
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
    </Card>
  )
}
