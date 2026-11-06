import { batch, computed, signal } from "nsh"

/**
 * The views of a long track of equal items in a `Scroll`: a few slots, placed by
 * the view at `indexOf(slot) * itemSize`. As the track scrolls, a slot leaving one
 * end takes the item entering the other, so only that slot changes.
 *
 * Not a `List`: a list keeps the size it measured of every item it has passed, so
 * after a resize offsets stop being multiples of the item size, and snapping,
 * hit testing and the week's header all count on that.
 */
export function trackWindow(count: () => number, overscan: number) {
  const first = signal(0)
  const length = signal(1)
  const slots = computed(() => Array.from({ length: length() }, (_, slot) => slot))

  return {
    slots,
    first: () => first(),
    length: () => length(),
    indexOf(slot: number) {
      const size = length()
      const start = first()
      return start + ((((slot - start) % size) + size) % size)
    },
    /** Call with where the track is, as it scrolls or resizes. */
    show(offset: number, viewport: number, itemSize: number) {
      const next = Math.ceil(viewport / itemSize) + 1 + overscan * 2
      const start = Math.floor(offset / itemSize) - overscan
      batch(() => {
        length.set(next)
        first.set(Math.max(0, Math.min(count() - next, start)))
      })
    },
  }
}
