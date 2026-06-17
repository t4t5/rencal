// Lets the active day cell/column expose its "create event on this day" action
// so the global "add event on active day" shortcut can trigger it without
// reaching into the DOM. Mirrors the singleton pattern in `draft-anchor.ts`.

let _open: (() => void) | null = null

export const registerActiveDayDraft = (open: (() => void) | null) => {
  _open = open
}

export const openActiveDayDraft = () => {
  _open?.()
}
