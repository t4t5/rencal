# Plan: drag to create events (week view)

Issue: [#105](https://github.com/t4t5/rencal/issues/105). Press on an empty slot in a
week-view day column and drag to draw a new event, Google Calendar style. Releasing
opens the normal new-event popover with the drawn time range.

## Decisions

- **Left button + drag threshold**, not right-drag or double-click. The issue suggests
  those so left-click keeps selecting a day. The reschedule drag already solves the same
  conflict: a press only becomes a drag after `DRAG_THRESHOLD_PX` (4px), so a plain
  left-click still navigates and a left-drag creates. Right button stays with the
  context menu. Double-click can be a follow-up.
- **Week view time grid only.** Not the month view and not the all-day lane.
- **Column-locked.** The selection stays in the column where the press started; only
  pointer Y matters, even when the pointer leaves the column sideways. The time grid
  only lays out single-day timed events, so a cross-column drag has no representation
  there anyway.
- **15-minute slots**, reusing `DRAG_SNAP_MINUTES`. The slot under the press is always
  part of the selection: drag down to extend the end, drag up to extend the start.
  Minimum 15 minutes, clamped to the day (00:00–24:00).
- **Flat selection block** (see the reference screenshot): full column width, a
  translucent tint of the default calendar's colour so hour lines show through, no
  border, stripe or text, drawn above event blocks with no pointer events. It is
  rendered directly in the column, not through the overlap layout, so it never cascades
  behind existing events.
- **Release opens the existing new-event popover** through `useOpenDayDraft` with the
  drawn start/end. `useEventsWithDraft` already injects the draft into the grid, so the
  flat selection is replaced by the dashed draft block in the same React batch (no
  flash). Release does not navigate to the day, matching the context-menu path.
- **Own small controller, not a second mode inside `EventDragContext`.** Only the week
  grid renders the selection; there is no floating copy, no `elementsFromPoint`
  hit-testing, no save path. A hook local to the week view is enough. Reuse the shared
  pieces from `@/lib/event-drag` (`DRAG_THRESHOLD_PX`, `DRAG_SNAP_MINUTES`,
  `edgeScrollDelta`) and `suppressNextClick`.
- **Two drags never fight over a press**: drag-to-create only starts when the press lands
  on the column background itself (`e.target === e.currentTarget`). Event blocks handle
  their own `onPointerDown` (reschedule); the draft block, drag preview and
  `CurrentTimeIndicator` are static or `pointer-events-none`.

## Interaction spec

1. Pointer down (button 0) on the empty background of a timed day column
   (`data-drop-zone="timed"`).
2. Nothing is visible until the pointer travels `DRAG_THRESHOLD_PX`. Release before that
   is a normal click and navigates to the day as today.
3. On activation the selection is the 15-minute slot containing the press. Every move
   re-reads the anchor column's rect (so scrolling is accounted for), snaps, and only
   updates React state when the snapped range changes.
4. Near the top/bottom edge of the scroll container (`[data-drag-scroll]`) the grid
   auto-scrolls vertically in a rAF loop using `edgeScrollDelta(rect, x, y, { x: false, y: true })`.
5. Escape cancels: the selection disappears and the release click is still swallowed.
   `pointercancel` cancels too.
6. Pointer up: swallow the trailing click, clear the selection, and open the draft:
   `openDayDraft(day, columnEl, { allDay: false, start, end, anchorY })` where `anchorY`
   is the viewport Y of the selection's vertical centre, so the popover sits beside the
   new block instead of at the release point.
7. With no writable calendar, `openDayDraft` already prompts to connect an account
   (same as "Create event" in the context menu), so the gate is handled on release.

## Implementation steps

### 1. Pure math: `src/lib/drag-to-create.ts` + `src/lib/drag-to-create.test.ts`

```ts
export type CreateSelection = { startMinutes: number; endMinutes: number }

/** Unclamped wallclock minutes-of-day for a viewport Y inside a day column. */
export function minutesAtY(rect: { top: number; height: number }, y: number): number

/** Snapped selection that always contains the anchor's slot and grows toward the pointer. */
export function selectionForPointer(anchorMinutes: number, pointerMinutes: number): CreateSelection

/** The range for a selection on `day`, built with `atTime`; 24:00 becomes 00:00 the next day. */
export function selectionRange(day: Temporal.PlainDate, sel: CreateSelection): EventTimeRange
```

`selectionForPointer` sketch:

```ts
const slotStart = Math.floor(anchorMinutes / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES
const slotEnd = slotStart + DRAG_SNAP_MINUTES
const p = Math.max(0, Math.min(DAY_MINUTES, pointerMinutes))
if (p >= slotEnd) return { startMinutes: slotStart, endMinutes: Math.ceil(p / SNAP) * SNAP }
if (p < slotStart) return { startMinutes: Math.floor(p / SNAP) * SNAP, endMinutes: slotEnd }
return { startMinutes: slotStart, endMinutes: slotEnd }
```

`selectionRange` uses `atTime(day, h, m)` for wallclock positions (matches how the grid
places events via `startLocalMinutes`, and keeps DST days right). End at 1440 →
`atTime(day.add({ days: 1 }), 0)`.

Tests (vitest, same style as `event-drag.test.ts`, viewer zone pinned with
`setViewerTzid`): anchor-only selection is one slot; dragging down rounds the end up;
dragging up rounds the start down; pointer above 0 / below 1440 clamps; end at 1440 is
00:00 next day; `minutesAtY` maps top/bottom/midpoint of a rect.

### 2. Share `suppressNextClick`

Export it from `src/contexts/EventDragContext.tsx` (module-private today). Its comment
already explains the swallowed click; no behaviour change.

### 3. Controller: `src/components/main/week-view/useDragToCreate.ts`

```ts
export function useDragToCreate(scrollContainerRef): {
  selection: (CreateSelection & { dayKey: string }) | null
  startCreateDrag: (day: Temporal.PlainDate, e: ReactPointerEvent<HTMLElement>) => void
}
```

- Session in a ref, same shape of lifecycle as `EventDragContext`: handlers built once in
  `useMemo`, window `pointermove` / `pointerup` / `pointercancel` / `keydown` listeners
  added on press and removed in `cleanup`, `openDayDraft` read through a ref.
- Session fields: `day`, `dayKey`, `columnEl` (`e.currentTarget`), `scrollEl`
  (`closest("[data-drag-scroll]")`), `startX/startY`, `lastX/lastY`, `anchorMinutes`
  (from `minutesAtY(columnRect, startY)` at press), `activated`, `cancelled`,
  `selection`, `raf`.
- `start`: bail unless `e.button === 0`, `e.target === e.currentTarget`, and no session.
- `update`: `selectionForPointer(anchorMinutes, minutesAtY(columnEl.getBoundingClientRect(), lastY))`;
  `setSelection` only when it changed.
- `activate`: mark activated, run `update`, start the autoscroll rAF.
- `commit`: `selectionRange` → `openDayDraft(...)` with `anchorY` computed from the
  column rect and the selection's midpoint.
- `onPointerUp`: if activated → `suppressNextClick()`, then `commit` unless cancelled;
  always `cleanup` (which also clears the selection, batched with the popover opening).
- Debug logs via `createDebugLogger("drag-to-create")` at activate / target change /
  commit / cancel, gated by `isDebugMode`.

### 4. Selection block: `src/components/main/week-view/DragToCreateSelection.tsx`

Absolutely positioned inside the column: `top: ${start / DAY_MINUTES * 100}%`,
`height: ${(end - start) / DAY_MINUTES * 100}%`, `left-0 right-0 z-10 rounded-sm
pointer-events-none`. Colour comes from a new `getCreateSelectionStyle(calendarColor)`
in `src/lib/event-styles.ts`, next to the draft/preview styles: the same boosted accent
`getEventBlockColors` derives, mixed with `transparent` (about 20%) rather than
`--background` so the hour lines stay visible. `calendarColor` is the default
calendar's (`defaultCalendarId` from `useEventDraft` → `getCalendarColor`), i.e. the
colour the draft will get. No text inside.

### 5. Wire into `src/components/main/week-view/WeekTimeGrid.tsx`

- Call `useDragToCreate(scrollContainerRef)`.
- On each timed column div: `onPointerDown={(e) => startCreateDrag(day.date, e)}`
  (composes fine with the `ContextMenuTrigger asChild` wrapper, which only handles
  touch/pen long-press there).
- Render `<DragToCreateSelection>` inside the column whose `dateKey === selection.dayKey`.
- While `selection` is non-null, add `select-none` to the scroll container so the drag
  doesn't sweep text selection across event titles (the reschedule overlay does the
  same with its full-window layer).
- Optional tidy-up: replace the local `getHourFromClickY` with
  `Math.floor(minutesAtY(rect, y) / 60)` so both entry points share one Y→time mapping.

### 6. `src/hooks/useOpenDayDraft.ts`

- Add `end?: EventTime | null`. When given, `end = withViewerZone(opts.end)`; otherwise
  keep `start + DEFAULT_DURATION_MINS`.
- Rename `clickY` → `anchorY` (it is no longer a click); update the context-menu call in
  `WeekTimeGrid`.

### 7. Docs

- New `docs/drag-to-create.md` mirroring `drag-to-reschedule.md`: Interaction / What a
  release does / Extending (where the math lives, the press-target rule, how to add the
  all-day lane later).
- `AGENTS.md` → Feature-specific notes: `- Drag to create (in Week view): docs/drag-to-create.md`.
- `docs/drag-to-reschedule.md`: one sentence noting that presses on the column
  background belong to drag-to-create.

## Files touched

| File                                                                | Change                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/lib/drag-to-create.ts`                                         | new: `minutesAtY`, `selectionForPointer`, `selectionRange` |
| `src/lib/drag-to-create.test.ts`                                    | new: unit tests                                            |
| `src/components/main/week-view/useDragToCreate.ts`                  | new: session controller hook                               |
| `src/components/main/week-view/DragToCreateSelection.tsx`           | new: the flat block                                        |
| `src/components/main/week-view/WeekTimeGrid.tsx`                    | attach handler, render selection, `select-none`            |
| `src/lib/event-styles.ts`                                           | `getCreateSelectionStyle`                                  |
| `src/hooks/useOpenDayDraft.ts`                                      | `end` option, `clickY` → `anchorY`                         |
| `src/contexts/EventDragContext.tsx`                                 | export `suppressNextClick`                                 |
| `docs/drag-to-create.md`, `docs/drag-to-reschedule.md`, `AGENTS.md` | docs                                                       |

## Edge cases

- **A popover is already open** (new or edit): Radix `onPointerDownOutside` closes it on
  the press and swallows the next click; the drag proceeds; release opens a fresh draft.
- **Header compose input active** (`isDrafting`): `openDayDraft` already resets it.
- **Wheel-scroll mid-drag**: the selection is in minutes and lives inside the column, so
  it scrolls with the grid; the next pointermove re-snaps against the new rect.
- **Days prepended during the drag** (infinite scroll): columns are keyed by `dateKey`,
  so the stored `columnEl` stays the same node; `scrollLeft` compensation is untouched.
- **Press on the draft block or drag preview**: target isn't the column, nothing starts.
- **Touch/pen**: no special handling (same as reschedule). No `preventDefault` on
  pointerdown, so the Radix long-press context menu keeps working.
- **Read-only-only setups**: handled on release by `openDayDraft`'s gate.
- **Themes with a solid `--event-background`**: the selection uses the accent, not the
  fill token, so it stays a tint on every theme; verify in Electric Blue / Omarchy
  monochrome.

## Verification

- `just test` for the new unit tests.
- `just typecheck` (runs knip too, so every new export needs a real importer).
- `just debug drag-to-create`, then walk through:
  - plain click on a column still navigates; a 4px wiggle-and-release creates a 15 min draft;
  - drag down / up grows the right end; pointer past the column's sides stays in the column;
  - autoscroll at the top/bottom edge; Escape cancels and does not navigate;
  - release opens the popover beside the block; the dashed draft replaces the flat block
    without flashing; "Create" saves the exact range (check with `caldir`);
  - press-and-drag on an existing event still reschedules; right-click menu unaffected;
  - no text selection during the drag; with only read-only calendars the connect prompt shows.
- PR description: `Closes #105`.

## Out of scope / follow-ups

- All-day lane drag to create multi-day all-day events (`data-drop-zone="all-day"`).
- Cross-column drags for multi-day timed events.
- Double-click on an empty slot → 1-hour draft (the issue's other suggestion).
- A time-range label inside the selection while dragging.
