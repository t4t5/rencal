# Plan: drag to create multi-day all-day events in the month view

Follow-up to 759d065 (drag to create in the week time grid). Pressing on empty
space in a month cell and dragging across days should draw a flat, faded bar
over the selected days, and releasing should open the new-event popover with a
matching all-day draft.

## Behaviour

- Only a left-button press directly on a month cell's background (or the
  day-number header above it) can start a create drag. Event blocks keep
  drag-to-reschedule, right-click keeps the context menu.
- The press becomes a drag after the shared 4px threshold (`DRAG_THRESHOLD_PX`),
  so a plain click still navigates to the day.
- The selection is a whole-day range. It always includes the pressed day and
  grows toward the day under the pointer, in either direction, across week rows
  and across month boundaries. Minimum is one day.
- Moving the pointer over a gap with no cell (borders, the weekday label strip,
  outside the grid) keeps the last selection; pointer coordinates are clamped to
  the scroll container so dragging past an edge selects the edge column/row.
- Dragging near the top/bottom of the grid auto-scrolls it. Infinite months keep
  working: the selection is stored as dates, not row indices, so prepended weeks
  don't shift it.
- Escape and `pointercancel` cancel. The click after an activated drag is
  swallowed (`suppressNextClick`).
- Release opens the normal new-event popover beside the bar with an all-day
  draft: `start = allDayDate(first)`, `end = allDayDate(last + 1 day)` (exclusive
  DTEND, same shape `normalizeAllDayRange` enforces). Default writable calendar;
  the create gate prompts to connect an account when there is none.
- The draft bar (dashed, from `useEventsWithDraft`) replaces the flat selection
  in the same update, exactly like the week view.

Visuals: one bar per intersecting week row, positioned like `MonthAllDayEvent`
(lane geometry, 3/4px insets, rounded start/end only on the real ends), filled
with `getCreateSelectionStyle(defaultCalendarColor)` (the same flat 20% tint as
the week selection), no text, `pointer-events-none`. Not the solid Google pill.

## Design decisions

1. **Selection type is dates, not columns.** `DaySelection = { start, end }`
   (`Temporal.PlainDate`, inclusive) lives in the hook; each row derives its
   clipped `{ startCol, endCol, isStart, isEnd }` from it. Follows the
   event-time rule that calendar days in state are `PlainDate`.
2. **Extract the pointer-session plumbing into a shared hook.**
   `useDragToCreate` (week) is ~200 lines, of which ~150 are threshold /
   activation / auto-scroll / cancel / cleanup that the month needs verbatim.
   Introduce a generic `useDragToCreateSession` and make both views thin
   wrappers, rather than adding a third copy (`EventDragContext` is the second).
   Alternative: a standalone month hook that duplicates the plumbing. Simpler
   diff, worse long-term; only pick it if touching the week hook is off the
   table.
3. **Find the day under the pointer via the DOM**, not geometry. Cells and
   headers already carry `data-drop-day`; reuse the `elementsFromPoint` lookup
   from `EventDragContext`. Robust to virtualization, prepends, and bars layered
   over cells.
4. **Lane for the bar: first lane free across the selected columns** among the
   row's visible all-day items. No reflow of existing bars during the drag; the
   committed draft is then laid out by `assignAllDayLanes` as usual (it may land
   in a different lane, that's fine).
5. **Popover anchor is a snapshot rect of the bar segment nearest the pointer**
   at release. It must be a snapshot: `PopoverNewEvent` reads the anchor in a
   layout effect after the selection has already unmounted. A segment that fills
   the row anchors at the pointer's X instead (mirrors `pointAnchorFromClick`).

## Implementation steps

### 1. Pure math (`src/lib/drag-to-create.ts`) + tests

Add, alongside the existing minute helpers:

```ts
export type DaySelection = { start: Temporal.PlainDate; end: Temporal.PlainDate }

/** Inclusive day range that always contains the anchor and grows toward the pointer. */
export function daySelectionForPointer(anchor: PlainDate, pointer: PlainDate): DaySelection

/** All-day [start, end) range for a selection; end is the day after `end`. */
export function daySelectionRange(selection: DaySelection): EventTimeRange

/** Clamp a viewport point inside a rect (inset 1px) so edge/outside drags hit the edge cell. */
export function clampPointToRect(
  rect: DOMRectReadOnly,
  x: number,
  y: number,
): { x: number; y: number }
```

Tests in `src/lib/drag-to-create.test.ts`: pointer after/before/equal to anchor;
range has `kind: "date"` ends and an exclusive end one day past `end`; clamp on
each edge.

### 2. Lane helpers (`src/hooks/cal-events/all-day-lanes.ts`) + tests

- Extract the clamping in `buildAllDaySpan` into an exported
  `clipSpanToRange(firstDay, lastDay, rangeFirstDay, rangeLastDay)` returning
  `{ startCol, endCol, isStart, isEnd } | null`; `buildAllDaySpan` calls it.
  Export the span type (`AllDaySpan`) and derive `AllDayLaneItem` from it.
- Add `firstFreeLane(items: { startCol; endCol; lane }[], startCol, endCol): number`.

Tests in `all-day-lanes.test.ts`: `clipSpanToRange` (inside, clipped both ends,
outside → null) and `firstFreeLane` (empty → 0; overlap in lane 0 → 1; occupied
only on non-overlapping columns → 0; lanes 0 and 2 taken → 1).

### 3. Shared session hook (`src/hooks/useDragToCreateSession.ts`)

Move the session skeleton out of `src/components/main/week-view/useDragToCreate.ts`:

```ts
export function useDragToCreateSession<TAnchor, TSelection>(config: {
  scrollContainerRef: RefObject<HTMLElement | null>
  /** Selection for the pointer, or null to keep the previous one. */
  selectionAt: (anchor: TAnchor, originEl: HTMLElement, pointer: { x; y }) => TSelection | null
  isSameSelection: (a: TSelection, b: TSelection) => boolean
  onCommit: (
    selection: TSelection,
    anchor: TAnchor,
    originEl: HTMLElement,
    pointer: { x; y },
  ) => void
}): {
  selection: TSelection | null
  startCreateDrag: (anchor: TAnchor, e: ReactPointerEvent<HTMLElement>) => void
}
```

Keeps, unchanged: the eligibility rule (`button === 0`,
`target === currentTarget`, no live session), threshold activation, stable
handlers via `useMemo` + window listeners, `edgeScrollDelta` auto-scroll on a
`requestAnimationFrame` loop, Escape / `pointercancel`, `suppressNextClick`,
cleanup on unmount, `createDebugLogger("drag-to-create")` logs. Auto-scroll
axes come from the scroll element like `EventDragContext` does
(`scrollWidth > clientWidth`, `scrollHeight > clientHeight`), so the month grid
(vertical only) and the week grid (both) need no config.

Rewrite the week hook as a wrapper that keeps its public shape
(`useDragToCreate(scrollContainerRef)` → `{ selection, startCreateDrag(day, e) }`):
anchor `= { day, anchorMinutes: minutesAtY(columnRect, e.clientY) }` computed
at press (it must not be recomputed later: auto-scroll moves the column);
`selectionAt` → `selectionForPointer`; `onCommit` → the existing
`selectionRange` + `anchorY` + `openDayDraft` call. Behaviour must be identical;
re-run the manual week checks from `docs/drag-to-create.md`.

Also add `src/hooks/useCreateSelectionColor.ts` (default calendar colour via
`useCalendars` + `useEventDraft` + `getCalendarColor`) and use it in
`WeekTimeGrid` instead of the inline lookup, so the month bar gets the same
colour.

### 4. DOM day lookup (`src/contexts/EventDragContext.tsx`)

Split `findDropHit` so the element lookup is exported next to
`suppressNextClick`:

```ts
export function findDropDayElement(
  x: number,
  y: number,
): { el: HTMLElement; day: Temporal.PlainDate } | null
```

`findDropHit` uses it. The month hook calls it with clamped coordinates.

### 5. Month hook (`src/components/main/month-view/useDragToCreateDays.ts`)

```ts
export function useDragToCreateDays(scrollContainerRef): {
  selection: DaySelection | null
  startCreateDrag: (day: Temporal.PlainDate, e: ReactPointerEvent<HTMLElement>) => void
}
```

- `selectionAt(anchorDay, _, { x, y })`: clamp to the scroll container's rect,
  `findDropDayElement`, then `daySelectionForPointer(anchorDay, hit.day)`; null
  when nothing is hit (keeps previous).
- `isSameSelection`: both ends `.equals`.
- `onCommit`: `daySelectionRange(selection)`; pick the `[data-create-selection]`
  element whose rect is vertically nearest `pointer.y`; snapshot its rect (or a
  zero-width rect at `pointer.x` if it spans all 7 columns); call
  `openDayDraft(selection.start, snapshotAnchor, { allDay: true, start, end })`.

### 6. Rendering

- `src/components/main/month-view/lane-geometry.ts`: move `LANE_HEIGHT` /
  `LANE_GAP` here from `Row.tsx` and add
  `allDayBarStyle(span: AllDaySpan, lane: number): CSSProperties` (the
  `top/height/left/right` block currently inlined in `MonthAllDayEvent`).
  `Row.tsx` and `AllDayEventBlock.tsx` import from it (also removes the
  Row ↔ AllDayEventBlock import cycle).
- `src/components/main/month-view/DragToCreateSelection.tsx` exporting
  `MonthDragToCreateSelection({ span, lane, calendarColor })`: absolute div,
  `allDayBarStyle` + `getCreateSelectionStyle`, `rounded-l`/`rounded-r` by
  `isStart`/`isEnd`, `z-10 pointer-events-none`, `data-create-selection`.
- `Grid.tsx`: call `useDragToCreateDays(scrollRef)`; add `select-none` to the
  scroll container while `selection` is set; per virtual row compute
  `createSelection = selection ? clipSpanToRange(epochDay(sel.start), epochDay(sel.end), weekFirst, weekLast) : null`
  and pass `createSelection` + `startCreateDrag` to `MonthWeekRow`. Rows that
  don't intersect keep receiving `null`, so `memo` still skips them.
- `Row.tsx`: when `createSelection` is set, `lane = firstFreeLane(allDayEvents, ...)`
  and render `MonthDragToCreateSelection` inside the second grid container
  (the one the bars live in). Pass `startCreateDrag` to `TopLeftDate` and
  `MonthDayCell`.
- `Cell.tsx` / `TopLeftDate.tsx`: `onPointerDown={(e) => startCreateDrag(day.date, e)}`
  on the root. Add `pointer-events-none` to the non-interactive children (the
  reserved-height spacer, "+N more", the header's month/day spans) so the
  direct-target rule holds when pressing on them. Timed blocks and the draft
  block keep pointer events, so a press on them is still rejected.

### 7. Commit path (`src/hooks/useOpenDayDraft.ts`)

Honour `opts.start` / `opts.end` in the all-day branch:
`start = opts.start ?? allDayDate(day)`, `end = opts.end ?? addDays(start, 1)`.
Update the option doc comments (they currently say "timed draft"). The existing
week all-day context menu passes neither, so it is unaffected.

### 8. Docs

- `docs/drag-to-create.md`: restructure into the shared session, the week time
  grid, and the month grid; move the "all-day lane needs a separate date-range
  interaction" note to say the month controller (`useDragToCreateDays`) is the
  date-range interaction and how the week all-day lane could reuse it (its
  cells already have `data-drop-day`).
- `docs/drag-to-reschedule.md`: the "presses on the column background belong to
  drag-to-create" line now also covers month cells and day-number headers.
- `AGENTS.md` (not `CLAUDE.md`, which is a symlink): "Drag to create (in Week
  view)" → "(in Month/Week views)".
- `getCreateSelectionStyle` comment: no longer week-only.

## Verification

Per step: `just typecheck` (includes knip, so no unused exports) and `pnpm test`.

Manual, with `just debug drag-to-create`:

- Click a cell / day number: still navigates, no selection. Right-click: context menu.
- Press-and-drag within one cell: one-day all-day draft on release.
- Drag right, left, into the weekend, down across two rows, up across rows, and
  across a month boundary (e.g. Sep 29 → Oct 2): bar segments per row with
  rounded ends only at the true start/end; correct dates in the popover.
- Drag past the right/left edge and over the weekday label strip: selection
  sticks to the edge column / last row.
- Hold near the bottom/top edge: auto-scroll, including into months that get
  loaded during the drag; selection unchanged after a prepend.
- Escape mid-drag cancels; no popover, no navigation on release.
- Press on an existing event block and drag: reschedule preview, no selection.
- Release: popover sits beside the bar; the dashed draft bar replaces the flat
  one in the same frame; lane may differ (expected).
- Start a new drag while the popover is open: old popover closes, new draft opens.
- No writable calendar: connect prompt, nothing else.
- Week view: repeat the checks in `docs/drag-to-create.md` (the hook was refactored).

## Risks / notes

- Refactoring the week hook is the only regression surface; keep the wrapper
  behaviour-identical and rely on the manual week checks.
- `elementsFromPoint` skips `pointer-events: none` elements, which is what we
  want for the bar, boundaries, and week numbers. If a future overlay with
  pointer events covers the grid, the lookup still finds the cell underneath.
- Bars beyond `MAX_ALL_DAY_LANES` (row full) draw over the timed area; it is a
  transient, non-interactive tint, so acceptable. Once committed, the normal
  "+N more" overflow applies.
