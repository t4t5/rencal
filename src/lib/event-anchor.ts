let _anchor: HTMLElement | null = null

export const setEventAnchor = (el: HTMLElement | null) => {
  _anchor = el
}

export const getEventAnchor = () => _anchor
