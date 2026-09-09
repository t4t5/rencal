# Drag to create

Empty calendar space can be dragged to draw a new event: a timed range in the
week time grid, or an inclusive whole-day range across the month grid.

## Shared pointer session

`src/hooks/useDragToCreateSession.ts` owns the interaction lifecycle shared by
both views: the four-pixel activation threshold, edge auto-scroll, Escape and
`pointercancel` handling, click suppression after an activated drag, and window
listener cleanup. Each view supplies its own anchor, pointer-to-selection math,
selection equality, and commit behavior.

Only a left-button press directly on a participating background can start a
create drag (`event.target === event.currentTarget`). Event blocks therefore
keep drag-to-reschedule, ordinary clicks still navigate, and right-click keeps
opening the context menu.

Pure selection math lives in `src/lib/drag-to-create.ts`. Temporary selections
use the default writable calendar's flat tint. Release opens the normal event
popover through `useOpenDayDraft`; the standard create gate prompts to connect
an account when no writable calendar exists. The committed draft enters the
normal event layout in the same update and replaces the flat selection with its
dashed draft block.

## Week time grid

`src/components/main/week-view/useDragToCreate.ts` anchors the press to one day
and one wallclock minute. The selection remains in that day, snaps to 15-minute
slots, includes the pressed slot, grows up or down, and clamps to
00:00–24:00. Its flat block is rendered by `DragToCreateSelection.tsx`.

The anchor minute is captured at press time because auto-scroll moves the
column's viewport rectangle. On release, the selected minutes become exact
timed `EventTime` start/end values and the popover anchors beside the vertical
midpoint of the selection.

## Month grid

`src/components/main/month-view/useDragToCreateDays.ts` anchors the press to a
`Temporal.PlainDate`. It clamps pointer coordinates into the scroll container
and finds the current cell through its `data-drop-day` attribute, so the
inclusive range can grow in either direction across rows and month boundaries.
Passing over a border or other gap keeps the last valid selection. Storing dates
rather than virtual row indices keeps the selection stable when infinite scroll
prepends weeks.

Each visible week clips the range with `clipSpanToRange` and renders a flat bar
segment in the first lane that is free across its selected columns. Existing
events are not reflowed. Only the true range ends are rounded. On release, the
popover receives an all-day `[start, end)` range whose end is the day after the
last selected date, and anchors to a snapshot of the segment nearest the
pointer.

The week all-day lane could reuse this date-range controller in the future; its
cells and headers already expose `data-drop-day`. It would need to opt its
backgrounds and headers into `startCreateDrag` and render the clipped selection
in its own lane geometry.
