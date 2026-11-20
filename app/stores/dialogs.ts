// How many of the main window's dialogs are open: while any is, the calendar's keys stand down.
import { signal, untracked } from "nsh"

const open = signal(0)

export const mainDialogOpen = () => open() > 0

/** Counts a dialog as open until the returned function is called. */
export function noteMainDialogOpen() {
  untracked(() => open.update((n) => n + 1))
  return () => untracked(() => open.update((n) => n - 1))
}
