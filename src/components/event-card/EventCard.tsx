import { AllDaySection } from "@/components/event-card/AllDaySection"
import { LocationSection } from "@/components/event-card/LocationSection"
import { TimeSection } from "@/components/event-card/TimeSection"
import { Card } from "@/components/ui/card"

export function EventCard({ title }: { title: string }) {
  return (
    <Card className="gap-4">
      <input readOnly value={title} className="text-base" />

      <div className="flex flex-col gap-3">
        <TimeSection />
        <AllDaySection />
        <LocationSection />
      </div>
    </Card>
  )
}
