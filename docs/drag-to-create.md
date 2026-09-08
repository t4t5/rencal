# Drag to create

An empty part of a day column in the week time grid can be dragged to draw a
new timed event. Code: `src/components/main/week-view/useDragToCreate.ts`
(pointer session and auto-scroll), `src/lib/drag-to-create.ts` (pure selection
math), and `src/components/main/week-view/DragToCreateSelection.tsx` (the flat
selection block).

## Interaction

- Only a left-button press directly on a timed column background can start a
  create drag. Event blocks keep their own drag-to-reschedule interaction, and
  right-click keeps opening the context menu.
- A press becomes a drag after the shared four-pixel drag threshold, so an
  ordinary click still navigates to the day.
- The selection stays in the day where the press began. It snaps to 15-minute
  slots, always includes the pressed slot, and grows up or down with the
  pointer. The range is clamped to 00:00–24:00.
- Dragging near the top or bottom of the scroll container scrolls the time grid.
- Escape and `pointercancel` cancel the selection. The click following any
  activated drag is swallowed so it cannot navigate to a day.

## What a release does

Release converts the selected wallclock minutes to `EventTime` values and opens
the normal new-event popover beside the selection. The draft uses the exact
drawn start and end and the default writable calendar. The standard create
gate prompts the user to connect an account when there is no writable calendar.

The draft event is injected into the usual week layout in the same update, so
its dashed event block replaces the temporary flat selection.

## Extending

- Selection snapping and minute-to-range conversion live in
  `src/lib/drag-to-create.ts`; keep this math independent of the DOM and covered
  by unit tests.
- The direct-background rule (`event.target === event.currentTarget`) prevents
  drag-to-create from competing with event blocks. Any new interactive child
  of a timed column should preserve that rule.
- The controller is intentionally local to the week time grid. It does not use
  `EventDragContext`, DOM drop-zone hit testing, or the reschedule save path.
- Supporting the all-day lane later needs a separate date-range interaction.
  The current controller accepts only timed day columns and is column-locked.
