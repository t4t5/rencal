import { ActionBar } from "@/components/action-bar/ActionBar"

import { useEventComposer } from "@/contexts/EventComposerContext"

export function Header() {
  const { isComposing, text } = useEventComposer()

  const showPreview = isComposing && text.length > 0

  return (
    <div className="flex flex-col gap-3">
      <ActionBar />

      {showPreview && <div>Test</div>}
    </div>
  )
}
