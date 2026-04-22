export type DraftAnchor = { getBoundingClientRect: () => DOMRect }

let _anchor: DraftAnchor | null = null

export const setDraftAnchor = (anchor: DraftAnchor | null) => {
  _anchor = anchor
}

export const getDraftAnchor = () => _anchor
