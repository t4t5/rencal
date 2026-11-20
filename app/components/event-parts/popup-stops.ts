import { cleanup, context, effect, signal } from "nsh"

/** What Tab can put the focus on: an input's or a view's ref. */
export type Stop = { focus(): void }

/**
 * Where an event popover's Tab order starts and wraps: its stops at either end
 * say where they are in that order and when they have the focus.
 */
export type PopupStops = {
  add(place: number, stop: Stop): () => void
  setFocused(place: number, focused: boolean): void
}

export const PopupStops = context<PopupStops | null>(null)

/** Places in the popover's Tab order, top to bottom. */
export const STOP_PLACE = { menu: 0, title: 1, notes: 2 } as const

/** Makes a field a stop of the popover it's in; outside one, it does nothing. */
export function popupStop(place: number) {
  const stops = PopupStops()
  const ref = signal<Stop | null>(null)
  effect(() => {
    const stop = ref()
    if (stops && stop) cleanup(stops.add(place, stop))
  })
  return {
    ref: (stop: Stop) => ref.set(stop),
    onFocus: () => stops?.setFocused(place, true),
    onBlur: () => stops?.setFocused(place, false),
  }
}
