import { ActionBar } from "@/components/action-bar/ActionBar"
import { LocationSection } from "@/components/event-card/LocationSection"
import { TimeSection } from "@/components/event-card/TimeSection"
import { Card } from "@/components/ui/card"

import { useEventComposer } from "@/contexts/EventComposerContext"

import { AllDaySection } from "./event-card/AllDaySection"

export function Header() {
  const { isComposing, text } = useEventComposer()

  const showPreview = isComposing && text.length > 0

  return (
    <div className="flex flex-col gap-3 p-4 pb-0">
      <ActionBar />

      {showPreview && (
        <Card className="gap-4">
          <input readOnly value={text} className="text-base" />

          <div className="flex flex-col gap-3">
            <TimeSection />
            <AllDaySection />
            <LocationSection />
          </div>
        </Card>
      )}
    </div>
  )
}
