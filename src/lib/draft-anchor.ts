let _anchor: HTMLElement | null = null

export const setDraftAnchor = (el: HTMLElement | null) => {
  _anchor = el
}

export const getDraftAnchor = () => _anchor
