import type { Ref } from "react"

import type { MonthDay } from "@/hooks/cal-events/useMonthGrid"
import { cn, isMacOS } from "@/lib/utils"

/**
 * WebKit's Mac port folds CSS scroll snapping into trackpad momentum itself, so on macOS
 * the native snap is the whole implementation. WebKitGTK instead disables kinetic
 * scrolling as soon as snap points exist (https://bugs.webkit.org/show_bug.cgi?id=229037),
 * which is why Linux runs the JS fling in `weekSnapSession.ts`.
 */
export const nativeWeekSnap = isMacOS

/** Weeks containing the 1st are hard stops, so a fling never skips past a month. */
export const isMonthStartWeek = (week: MonthDay[]) => week.some((day) => day.date.day === 1)

/**
 * Hide the snap areas while the sentinels move, and bring them back next frame. Without
 * this, WebKit re-snaps to whichever sentinel lands nearest after the layout change.
 */
export function suppressSnapPointsForFrame(
  layer: Pick<HTMLElement, "dataset" | "clientWidth"> | null,
) {
  if (!layer) return
  layer.dataset.snapDisabled = "true"
  // Force the reflow now, so the geometry change is laid out with no snap areas.
  void layer.clientWidth
  requestAnimationFrame(() => {
    delete layer.dataset.snapDisabled
  })
}

/**
 * Invisible 1px snap targets, one per loaded week. The week rows themselves are
 * virtualized, so they cannot be the snap areas: a fling needs targets ahead of the
 * rendered window to land on.
 */
export function WeekSnapPoints({
  weeks,
  rowHeight,
  ref,
}: {
  weeks: MonthDay[][]
  rowHeight: number
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none invisible absolute inset-x-0 top-0 [&[data-snap-disabled]>*]:snap-align-none"
    >
      {weeks.map((week, index) => (
        <div
          key={week[0].dateKey}
          className={cn(
            "absolute inset-x-0 h-px snap-start",
            isMonthStartWeek(week) && "snap-always",
          )}
          style={{ top: `${index * rowHeight}px` }}
        />
      ))}
    </div>
  )
}
