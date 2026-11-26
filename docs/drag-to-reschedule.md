# Drag to reschedule

Events in the month and week views can be dragged to a new day (and, in the week
time grid, a new time). Timed events in the week and day time grid can also be
resized by dragging their top or bottom edge. Code:
`src/contexts/EventDragContext.tsx` (session + DOM hit-testing),
`src/lib/event-drag.ts` (pure drop and resize math, tested), and
`src/components/event-parts/EventDragOverlay.tsx` (the floating copy).

## Interaction

- A press on an event block only becomes a drag after the pointer travels a few
  pixels, so clicks still open the popover. The release after a drag never
  counts as a click (it would otherwise navigate to the day under the pointer).
- In the week time grid, presses directly on the column background belong to
  drag-to-create. In the month grid, that applies to cell backgrounds and
  day-number headers. Event-block presses continue to belong to
  drag-to-reschedule.
- While moving: the source block stays where it was, dimmed; a floating copy
  follows the pointer (a title pill in the month view and all-day lane, a
  full-size block showing the new time in the week grid); a preview block with a
  ring in the event colour sits at the snapped drop position.
- Escape cancels. Dragging near an edge of the scroll container auto-scrolls it.
- Dropping calls `requestSave` from `RecurrenceEditContext`, so the optimistic
  update, rollback toast, and the recurring-event dialog behave exactly like
  edits from the popover.
- A dropped or resized recurring occurrence stays drawn at its new position
  while that dialog is open, and after a choice until the save has finished
  (the pending edits from `RecurrenceEditContext`, applied by
  `useEventsWithDrag`). Cancelling the dialog puts it back.

## Resizing

- A press within 6px of a timed block's top or bottom edge resizes instead of
  moving. Blocks shorter than 24px only resize from the bottom, so the rest of
  them can still be grabbed to move. Hovering an edge shows the `ns-resize`
  cursor; the cursor and the press use the same test (`resizeEdgeAt`), and only
  blocks in a `"timed"` day zone that the user can edit get it.
- Only the dragged end moves, to the time under the pointer snapped to 15
  minutes; the other end keeps its exact value. The event never gets shorter
  than 15 minutes, and the end can be dragged past midnight into the next day
  (or the start into the previous one). Math: `computeResizeRange`.
- While resizing there is no floating copy and no dimmed source: the preview
  replaces the block, so it stretches in place. Dropping saves through
  `requestSave` like a move.

## What a drop does

Moves only ever shift an event: a whole-day delta, plus a wallclock-minute delta
in the week time grid, applied to both start and end. Duration, kind (all-day vs
timed), and the event's own timezone are all preserved.

- Month cells (`"day"`, see `DayZone` in `src/lib/day-grid.ts`): any event, time of day unchanged.
- Week all-day lane and day headers (`"all-day"`): all-day events and timed
  events covering a whole day (`isSpanning`) only.
- Week day columns (`"timed"`): other timed events, including those crossing
  midnight, snapped to 15 minutes. A drop near the bottom of a column runs the
  event past midnight.

Dropping where the event can't land (or back on its own slot) shows no preview
and does nothing on release. Read-only calendars and events the user doesn't
organise can't be dragged (same rule as the edit popover).

## Extending

- A new droppable region is a day element marked with `dayAttributes(date, zone)`
  (`src/lib/day-grid.ts`); the pointer is resolved with `elementsFromPoint`, so
  blocks layered over a cell don't hide it.
- Edge auto-scroll moves the nearest scrolling ancestor of the dragged block.
- Blocks read their role through `useEventDragRole` and attach
  `useEventDragHandle` as `onPointerDown`. The preview is a copy of the event
  with a distinct id, injected into the grid layouts by `useEventsWithDrag`.
- Plugin views get the same through the SDK: `useEventProps(event, { drag })`
  attaches the handle and the role, `dayProps` marks the days, and
  `useEventsInRange` includes the preview.
