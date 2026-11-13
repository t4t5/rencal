import type { Temporal } from "@js-temporal/polyfill"

import { type CreateSelection, epochDay, selectionProps } from "@/sdk"

import { DAY_MINUTES, weekEventBox } from "./grid"

/** The part of a timed selection on `date`, which may run across days. */
export function DragToCreateSelection({
  selection,
  date,
}: {
  selection: Extract<CreateSelection, { kind: "timed" }>
  date: Temporal.PlainDate
}) {
  const offset = (epochDay(date) - epochDay(selection.day)) * DAY_MINUTES
  const start = Math.max(0, selection.startMinutes - offset)
  const end = Math.min(DAY_MINUTES, selection.endMinutes - offset)
  if (end <= start) return null

  return (
    <div
      data-slot="week-create-selection"
      {...selectionProps()}
      className="absolute left-0 z-10 rounded-sm pointer-events-none"
      style={weekEventBox((start / DAY_MINUTES) * 100, ((end - start) / DAY_MINUTES) * 100)}
    />
  )
}
