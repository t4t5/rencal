// Lets active day cell expose its "create event on this day" action
// so the global "add event on active day" shortcut can trigger it

let _open: (() => void) | null = null

export const registerActiveDayDraft = (open: (() => void) | null) => {
  _open = open
}

export const openActiveDayDraft = () => {
  _open?.()
}
