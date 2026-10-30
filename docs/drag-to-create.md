# Drag to create

Empty calendar space can be dragged to draw a new event: a timed range in a "timed" day column, like the week time grid's, or an inclusive whole-day range across "day" elements, like the month grid's cells.

## Who owns what

Views only mark their days with `dayProps(date, zone)` (`src/sdk/day-grid.ts`) and render the selection `useDayGrid()` returns. Everything else belongs to `DayGridProvider` (`src/contexts/DayGridContext.tsx`), which wraps the main viewport around every view and handles, by delegation:

- a press on a day element itself, which starts drag-to-create (`src/hooks/useCreateDrag.ts`);
- a double-click on a day, outside its events, which opens the new-event popover;
- the context menu: "Create event" on a day, renCal's event menu on an event (found by its `data-event-key`).

What a new event starts as depends on the zone: a timed event at the hour under the pointer in a "timed" column, an all-day event in an "all-day" lane, and in a "day" cell one that starts after the day's last event (`getLastEventEndTime`, shared with the "add event on active day" shortcut). "all-day" zones take double-click and the menu but not drag-to-create.

## Shared pointer session

`src/hooks/useDragToCreateSession.ts` owns the interaction lifecycle: the four-pixel activation threshold, edge auto-scroll of the day's nearest scrolling ancestor, Escape and `pointercancel` handling, click suppression after an activated drag, and window listener cleanup. `useCreateDrag` supplies the anchor, pointer-to-selection math, selection equality and commit for both kinds.

Only a left-button press directly on a day element can start a create drag. Event blocks therefore keep drag-to-reschedule, ordinary clicks still navigate, and right-click keeps opening the context menu.

Pure selection math lives in `src/lib/drag-to-create.ts`. Temporary selections use the default writable calendar's flat tint: the provider sets `--create-selection-color` on the viewport, and `global.css` paints every `[data-create-selection]` with it. Release opens the normal event popover through `useOpenDayDraft`; the standard create gate prompts to connect an account when no writable calendar exists. The committed draft enters the normal event layout in the same update and replaces the flat selection with its dashed draft block.

## Timed selections

The press anchors to one day and one wallclock minute. The selection remains in that day, snaps to 15-minute slots, includes the pressed slot, grows up or down, and clamps to 00:00–24:00. The week plugin draws its flat block (`src/views/builtin/week/DragToCreateSelection.tsx`).

The anchor minute is captured at press time because auto-scroll moves the column's viewport rectangle. On release, the selected minutes become exact timed `EventTime` start/end values and the popover anchors beside the vertical midpoint of the selection.

## Day selections

The press anchors to a `Temporal.PlainDate`. The session clamps pointer coordinates into the scroll container and finds the day element under them with the same zone, so the inclusive range can grow in either direction across rows and month boundaries. Passing over a border or other gap keeps the last valid selection. Storing dates rather than virtual row indices keeps the selection stable when infinite scroll prepends weeks.

In the month view, each visible week lays the range out with its spanning events through `layoutAllDay`, as though it were the appended draft event. Overlapping bars therefore move to their eventual positions during the drag and stay there after release. Only the true range ends are rounded. On release, the popover receives an all-day `[start, end)` range whose end is the day after the last selected date, and anchors to a snapshot of the segment nearest the pointer. Views mark their segments with `useDayGrid().selectionProps()` (`src/views/builtin/month/DragToCreateSelection.tsx`). Like every popover anchor, a segment wider than the popover collapses to the release point (`fitPopoverAnchor`).

The week all-day lane could take day selections too: `useCreateDrag` would need to accept "all-day" zones, and the week plugin would render the clipped selection in its own lane geometry.
