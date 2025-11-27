import { ActionBar } from "@/components/action-bar/ActionBar"
import { Card } from "@/components/ui/card"

import { useEventComposer } from "@/contexts/EventComposerContext"

export function Header() {
  const { isComposing, text } = useEventComposer()

  const showPreview = isComposing && text.length > 0

  return (
    <div className="flex flex-col gap-3 p-4 pb-0">
      <ActionBar />

      {showPreview && <Card>Test</Card>}
    </div>
  )
}
