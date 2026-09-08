# Drag to reschedule

Events in the month and week views can be dragged to a new day (and, in the week
time grid, a new time). Code: `src/contexts/EventDragContext.tsx` (session +
DOM hit-testing), `src/lib/event-drag.ts` (pure drop math, tested), and
`src/components/event-parts/EventDragOverlay.tsx` (the floating copy).

## Interaction

- A press on an event block only becomes a drag after the pointer travels a few
  pixels, so clicks still open the popover. The release after a drag never
  counts as a click (it would otherwise navigate to the day under the pointer).
- While dragging: the source block stays where it was, dimmed; a floating copy
  follows the pointer (a title pill in the month view and all-day lane, a
  full-size block showing the new time in the week grid); a preview block with a
  ring in the event colour sits at the snapped drop position.
- Escape cancels. Dragging near an edge of the scroll container auto-scrolls it.
- Dropping calls `requestSave` from `RecurrenceEditContext`, so the optimistic
  update, rollback toast, and the recurring-event dialog behave exactly like
  edits from the popover.

## What a drop does

Drops only ever shift an event: a whole-day delta, plus a wallclock-minute delta
in the week time grid, applied to both start and end. Duration, kind (all-day vs
timed), and the event's own timezone are all preserved.

- Month cells (`data-drop-zone="day"`): any event, time of day unchanged.
- Week all-day lane and day headers (`"all-day"`): all-day and multi-day events
  only.
- Week day columns (`"timed"`): single-day timed events only, snapped to
  15 minutes and clamped inside the day.

Dropping where the event can't land (or back on its own slot) shows no preview
and does nothing on release. Read-only calendars and events the user doesn't
organise can't be dragged (same rule as the edit popover).

## Extending

- A new droppable region needs `data-drop-day="YYYY-MM-DD"` and a
  `data-drop-zone`; the pointer is resolved with `elementsFromPoint`, so blocks
  layered over a cell don't hide it.
- A new scrollable view opts into edge auto-scroll with `data-drag-scroll` on
  its scroll container.
- Blocks read their role through `useEventDragRole` and attach
  `useEventDragHandle` as `onPointerDown`. The preview is a copy of the event
  with a distinct id, injected into the grid layouts by `useEventsWithDrag`.
