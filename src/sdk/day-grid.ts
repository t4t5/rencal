import { Temporal } from "@js-temporal/polyfill"

import { useCreateSelection } from "@/contexts/DayGridContext"
import { useEventDrag } from "@/contexts/EventDragContext"

import { createSelectionAttributes } from "@/hooks/useCreateDrag"
import { dayAttributes, type DayZone } from "@/lib/day-grid"
import type { CreateSelection } from "@/lib/drag-to-create"

export type { DayZone } from "@/lib/day-grid"
export type { CreateSelection } from "@/lib/drag-to-create"

/**
 * Props that make an element `date` in the view. renCal then handles, per `zone`:
 * - dropping dragged events there (`"day"`: any event, keeping its time;
 *   `"all-day"`: all-day and multi-day events; `"timed"`: single-day timed
 *   events, at the time under the pointer);
 * - drawing a new event by dragging from it (`"timed"` within the column,
 *   `"day"` across days), shown through `useDayGrid`;
 * - double-click and a "Create event" context menu, for a timed event at the
 *   hour under the pointer, an all-day event, or one after the day's last event;
 * - anchoring the new-event popover the "add event" shortcut opens.
 *
 * A `"timed"` element must span the whole day, 00:00 at its top to 24:00 at its
 * bottom. Presses on what's drawn over the day, like events, keep their own.
 */
export function dayProps(date: Temporal.PlainDate, zone: DayZone) {
  return dayAttributes(date, zone)
}

/**
 * Props for an element that draws part of the `useDayGrid` selection: the
 * new-event popover opens beside the part nearest the pointer.
 */
export function selectionProps() {
  return createSelectionAttributes()
}

/**
 * The day grid's drag state. `selection` is the range being drawn to create an
 * event, for the view to render with `selectionProps()` on what draws it.
 * `isDragging` is true while an event is moved or drawn, for holding off what
 * would fight the drag's autoscroll, like scroll snapping.
 */
export function useDayGrid(): {
  selection: CreateSelection | null
  isDragging: boolean
} {
  const selection = useCreateSelection()
  const draggingEvent = useEventDrag().drag !== null

  return { selection, isDragging: draggingEvent || selection !== null }
}
