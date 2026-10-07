# rencal-layout

Pure layout geometry (`GPUI_PORT_PLAN.md` §3.1, §5, §6.1, §6.2): week/day time-grid placement with overlap columns, all-day lanes, month rows and grid, month bar geometry, and the pointer maths for drag-to-reschedule, drag-to-create and month-view week snapping. No GPUI, no IO, no globals; depends only on `rencal-time`. Specs: `docs/drag-to-reschedule.md`, `docs/drag-to-create.md`, `docs/scroll-behaviour.md`.

## Layout

- `src/grid.rs`: `GridDay` (TS `MonthDay`, used by both views), `month_grid_bounds`, `month_grid` (the `useMonthGrid` loop).
- `src/lanes.rs`: `AllDaySpan` (`clip`), `AllDayLaneItem<T>`, `build_all_day_span`, `assign_all_day_lanes`.
- `src/day_range.rs`: `day_range_layout` (TS `useDayRangeLayout`): all-day items plus `TimedPlacement`s per day column with overlap columns and `DisplayMode`.
- `src/month.rs`: `month_week_layout` / `month_event_layout` (TS `useMonthEventLayout`).
- `src/lane_geometry.rs`: `all_day_bar_rect`, `reserved_all_day_height`, `LANE_GAP`, `BAR_BLEED`.
- `src/drag/`: `reschedule.rs` (`lib/event-drag.ts`: `grab_for`, `compute_drop_range`, `make_drag_preview`, `edge_scroll_delta`) and `create.rs` (`lib/drag-to-create.ts`). Both re-exported from `drag`.
- `src/week_snap.rs`: fling prediction, snap/fling targets, gesture classification, `decay_rate`, and `SnapFling`, the landing curve of `startSnapFling` as a pure function of elapsed time.
- `tests/fixtures.rs`: golden fixtures from `scripts/fixtures/layout.fixtures.ts`. `tests/behaviour.rs`: the ported vitest suites.

## Rules

- Inputs are events with `date_info` for the viewer's zone (`CalendarEvent::with_viewer`); the viewer zone is an argument where a function builds `EventTime`s.
- The React hooks are plain functions over `(events, range)`. Layouts refer to events by index into the `events` slice they were given, so the app can cache them; there are no calendar colours here (resolve `calendar_slug` → colour in the app).
- Ranges are generic: `day_range_layout(events, first_day, day_count)` takes any number of days, and `month_week_layout` any week start, so new views (N-day, infinite axes) reuse them without a closed view enum.
- Keep the hot loops allocation-light: one pass over events per range, sorting in place.

## Decisions

- Units: pixel geometry is `f32` (`Rect`, `Point`; the app converts to `Pixels`). Minutes under the pointer are `f64`, so the snapping maths (`1e-9` epsilon, `Math.round`) matches the TS exactly. Week-snap offsets and velocities are `f64` because infinite-axis offsets outgrow `f32`'s exact integers.
- Timed placements keep whole viewer-local minutes (`start_minutes`, `duration_minutes`) instead of the TS percentages; overlap tests are exact integer comparisons, which replaces the TS `OVERLAP_EPS`. `top()`/`height()` return fractions of the day column.
- Columns are 0-based with exclusive ends (TS: 1-based CSS grid lines). Lane functions return lane counts (TS: `maxLane`, -1 when empty).
- `lane-geometry.ts` built CSS `calc()` strings from theme variables; `all_day_bar_rect` takes those metrics (`MonthRowMetrics`) and returns a row-local rectangle. The fixture test evaluates the CSS strings with sample metrics and compares.
- JS `Math.round` (halves toward +∞) is `js_round` in `lib.rs`; don't use `f64::round` where the TS rounded.
- Not ported: `startSnapFling`'s frame scheduling, cancel and `shift`, and the `weekSnapSession` state machine: the app's `views/axis.rs` (`InfiniteAxis`, `WeekSnap`) replaces them. The WebKitGTK takeover constants (`TAKEOVER_*`) were dropped: GPUI has no native kinetic scrolling on Linux to take over.
