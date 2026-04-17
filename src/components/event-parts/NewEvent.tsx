import { Card } from "@/components/ui/card"

import { useEventDraft } from "@/contexts/EventDraftContext"

import { NewEventContent } from "./NewEventContent"

export const NewEvent = () => {
  const { setIsDrafting } = useEventDraft()

  return (
    <Card className="p-0 flex flex-col gap-0">
      <NewEventContent onCreated={() => setIsDrafting(false)} />
    </Card>
  )
}
