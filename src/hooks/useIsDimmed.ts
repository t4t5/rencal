import { useEventDraft, useEventText } from "@/contexts/EventDraftContext"

/**
 * True while the user is actively composing a new event via the header input.
 * Consumers use it to fade the main view so the draft stands out.
 */
export function useIsDimmed() {
  const { isDrafting } = useEventDraft()
  const { text } = useEventText()
  return isDrafting && text.length > 0
}
