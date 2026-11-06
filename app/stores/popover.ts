/*
 * Where the event popovers open from. NSH has no `getBoundingClientRect`: a view
 * hands over its `ViewRef` when pressed, and `measure()` says where it is in the
 * window. In a view or row:
 *
 *   let block: ViewRef | undefined
 *   <View ref={block} onPress={(press) => pressEvent(event(), block, press)} />
 *
 * `pressEvent` toggles the event's popover, as the old click handler did. For a
 * new-event popover (a double click, drag to create), anchor it first:
 *
 *   await anchorPopover(cellRef, press)
 *   openDraftPopover(draft)              // stores/draft.ts
 *
 * Opened with no anchor (a key, a command), a popover shows in the window's upper
 * middle, as `resolveDuplicateAnchor` did.
 */
import { type Bounds, type PressEvent, signal, untracked, type ViewRef, windowSize } from "nsh"

import { eventKey, type CalendarEvent } from "@/lib/cal-events"
import { EVENT_POPOVER_WIDTH, fitPopoverAnchor } from "@/lib/event-anchor"

import { activeEvent, setActiveEventKey } from "@/stores/events"

// A press outside closes the popover on the way down, before the press reaches
// the block it landed on: on the same event that press must not open it again.
const DISMISS_WINDOW_MS = 500

const anchor = signal<Bounds | null>(null)
let dismissed: { key: string; at: number } | null = null

function fallbackAnchor(): Bounds {
  const { width, height } = untracked(windowSize)
  return {
    origin: { x: width / 2 - EVENT_POPOVER_WIDTH / 2, y: height / 3 },
    size: { width: 0, height: 0 },
  }
}

/** What the open popover is placed against, in the window's coordinates. */
export const popoverAnchor = () => anchor() ?? fallbackAnchor()

/** Places the next popover against `ref`, near the press on anchors wider than it. */
export async function anchorPopover(ref: ViewRef | undefined, press?: PressEvent) {
  const measured = await ref?.measure()
  if (!measured) {
    anchor.set(press ? pointAnchor(press) : null)
    return
  }
  anchor.set(
    fitPopoverAnchor(
      { origin: measured.pagePosition, size: measured.bounds.size },
      { pointerX: press?.pagePosition.x, viewportWidth: untracked(windowSize).width },
    ),
  )
}

/** Places the next popover against a window rect, where no view stands for it (a drag's end). */
export function anchorPopoverAt(bounds: Bounds) {
  anchor.set(fitPopoverAnchor(bounds, { viewportWidth: untracked(windowSize).width }))
}

const pointAnchor = (press: PressEvent): Bounds => ({
  origin: press.pagePosition,
  size: { width: 0, height: 0 },
})

/** Forget the anchor, so the next popover opens in the window's middle. */
export const clearPopoverAnchor = () => anchor.set(null)

/** Called when a press outside closed the popover of `key`. */
export function noteDismissed(key: string) {
  dismissed = { key, at: Date.now() }
}

/** Opens the event's popover at `ref`, or closes it if it's the one open. */
export async function pressEvent(
  event: CalendarEvent,
  ref: ViewRef | undefined,
  press?: PressEvent,
) {
  const key = eventKey(event)
  if (dismissed?.key === key && Date.now() - dismissed.at < DISMISS_WINDOW_MS) return
  const current = untracked(activeEvent)
  if (current && eventKey(current) === key) {
    setActiveEventKey(null)
    return
  }
  await anchorPopover(ref, press)
  setActiveEventKey(key)
}
