import type { PopoverAnchor } from "@/lib/event-anchor"

export type DraftAnchor = PopoverAnchor

let _anchor: DraftAnchor | null = null

export const setDraftAnchor = (anchor: DraftAnchor | null) => {
  _anchor = anchor
}

export const getDraftAnchor = () => _anchor
