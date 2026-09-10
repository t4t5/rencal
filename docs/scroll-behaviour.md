## Month view

The month view is a vertically-stacked, endlessly-scrollable grid of week rows.
Two things move independently and must never be confused:

- **Scroll position** — where the viewport is. Moved by the user, and by deliberate
  navigation, with the month-view snap animator landing user scrolls on week rows.
- **Active date** — the highlighted day that drives the header's month label, the
  minical, and keyboard navigation. Stays selected while the user scrolls.

### Infinite scrolling

- The grid scrolls endlessly in both directions. Months load lazily: as the user
  approaches the top or bottom edge, earlier/later months are added to the grid.
- When earlier months are prepended at the top, the viewport stays visually fixed —
  the content the user was looking at must not jump.
- Event loading follows the visible range but is best-effort: it must never block
  scrolling. The grid stays fully scrollable while events are still loading, when no
  calendars are visible, and when the calendar is empty.

### Week-row snapping

`weekSnapSession.ts` leaves the user's direct scrolling native, then takes over a
trackpad fling to land on a week boundary. `weekSnapFling.ts` owns the animation:
there is no CSS snapping or second native smooth-scroll animation.

- A wheel session becomes eligible after two scroll events without intervening wheel
  input and at least one strictly shrinking pair of coast deltas in the same
  direction. Growth or a sign flip resets the decay count; equal nonzero deltas
  leave it unchanged. Every coasting frame retries, so a partial first frame delays
  takeover instead of rejecting the entire fling. This follows the decay-wait model
  in Chromium's `cc/input/snap_fling_controller.cc`, without adopting its curve-specific
  ratio threshold. The wheel stream must also look precise: at least three events
  within 150 ms of the newest event, with at least two distinct absolute delta values.
  Explicit line/page wheel input is excluded. This is a provisional device heuristic;
  physical WebKitGTK traces are still needed to validate it against trackpads and mice.
- On takeover, one instant `scrollTo` stops the native animation. Measured velocity
  predicts the natural end as `from + velocity / 4`. The target is the week boundary
  nearest that prediction **among boundaries ahead in the direction of motion**,
  clamped to the current scroll range. A boundary less than 1 px ahead counts as
  reached, so a tiny fling past a line continues to the next one. With nothing ahead
  at the range edge, native scrolling continues and the idle settle remains available.
  This follows `DirectionStrategy` in Chromium's `cc/input/scroll_snap_data.cc`, used
  by the fling path in `cc/input/input_handler.cc`; slow releases still use the nearest
  boundary in either direction, like `CreateForEndPosition`.
- The animator uses a finite, normalised exponential. For distance `d`, its rate
  `k = abs(velocity / d)` is clamped to 4–30 per second (zero velocity uses 4).
  Its duration is `T = max(0, ln(k * abs(d) / 60) / k)` seconds, and its offset is
  `from + d * (1 - exp(-k * t)) / (1 - exp(-k * T))` until the final write at `T`.
  This ends the glide before its approach speed falls below 60 px/s, removing the
  creeping tail, with the 1500 ms safety cap retained. Zero-duration corrections land
  on the first frame. Fractional positions stay in JS, independent of `scrollTop`
  rounding. Like Chromium's distance-driven `cc/input/snap_fling_curve.cc`, the curve
  may increase entry speed when the target lies beyond the natural landing point;
  normalisation also raises entry speed slightly.
- Without an eligible fling, 250 ms without input or scrolling starts the same
  ease-out animator from zero velocity toward the nearest week. Pointer and scroll
  key sessions only use this settle path, after all held pointers/keys are released.
- New wheel, pointer, or scroll-key input cancels our frame loop immediately.
  Wheel events are never prevented and direct gestures receive no synthetic deltas.
- Snapping is disabled during initial positioning, date navigation, event creation
  and rescheduling drags, and when reduced motion is requested. Programmatic scrolls
  never start a session. Navigation cancels the current session.
- Prepend/resize corrections cancel the animation and reset velocity samples. Their
  scroll events are ignored until the next animation frame; an existing user session
  then re-settles using the corrected offset and current row height. Geometry changes
  while idle do not start a new session.
- `data-week-snap` is `fling` or `settle` only while our animator runs. Native
  `scrollend` events do not control that lifecycle. `just debug month-scroll` logs
  animation starts/finishes and scroll-end offsets (`offsetFromWeek` should reach 0).
  Each declined takeover logs its reason (`not-precise`, `waiting-for-decay`,
  `no-target-ahead`, or `disabled`), coast count, and current/previous deltas.
  `just debug wheel-trace` logs wheel/scroll timestamps, deltas, `deltaMode`, the
  nonstandard `wheelDeltaY`, offsets, whether a wheel arrived since the last scroll,
  and unexpected offsets during animation.
  Use `just debug month-scroll,wheel-trace` for both.

All tuning constants live at the top of `weekSnapFling.ts`: kinetic friction 4,
takeover after at least 2 coast frames and 1 shrinking pair, a 150 ms wheel capture
window with at least 3 events, a 1 px ahead threshold, decay bounds 4–30, idle delay
250 ms, maximum duration 1500 ms, and minimum approach speed 60 px/s.

The WebKitGTK constraints documented in the implementation plan (WebKit tag
`webkitgtk-2.52.6`) explain this approach:

- `ScrollingEffectsController::processWheelEventForKineticScrolling` skips kinetic
  scrolling when CSS snap points exist; momentum-based snapping is Mac-only there.
- GTK finger lift becomes a zero-delta ended wheel event. `Element::dispatchWheelEvent`
  stops propagation for zero deltas, so JS cannot observe release directly.
- `ScrollAnimationKinetic.cpp` uses exponential decay with friction 4 per second.
  Native gesture scroll frames follow wheel events; kinetic frames continue without
  wheel input. The latter are the takeover opportunity.
- Mouse wheels do not use kinetic scrolling. Their notches can use
  `ScrollAnimationSmooth`, producing scroll-only frames with an ease-in-out curve.
  The wheel-stream classifier keeps isolated or fixed-magnitude notches on the settle
  path while allowing trackpad coasting to recover from an initially growing frame.

Notion Calendar's reference bundle uses permanent mandatory CSS snapping; Chromium
can carry a fling continuously into its snap target. renCal instead adapts the fling
in JS for WebKitGTK. Physical trackpad/mouse traces, native kinetic cancellation,
and feel tuning still need live verification on the target WebKitGTK build; unit
fixtures verify the session/physics rules but cannot establish native event behavior.

### Active date while scrolling

- On open, the grid is positioned so the first week of the current date's month is at
  the top of the viewport (the 1st of that month is visible).
- Scrolling leaves the active date unchanged, including when crossing month
  boundaries. The snap session handles week-row alignment independently.

### Jump navigation

- Deliberately jumping to a date — the "t" (today) shortcut, "hjkl", a minical click,
  or clicking a day — sets the active date and, if that date's week is not already
  fully visible, scrolls it to the top of the viewport. If it is already fully
  visible, the viewport does not move.
- A jump changes the active date directly; scrolling into view does not select a day.

## Week view

The week view is a horizontally-scrollable strip of day columns, over a fixed 24-hour
time grid. The same separation as the month view applies: the **scroll position**
follows the user (and deliberate jumps); the **active date** stays selected while the
user scrolls.

### Infinite scrolling

- The strip scrolls endlessly left and right; only the horizontal axis is infinite (the
  vertical time axis is a fixed 24 hours). Days load lazily: as the user approaches the
  left or right edge, earlier/later days are added.
- When earlier days are prepended at the left, the viewport stays visually fixed — the
  content the user was looking at must not jump.
- Event loading follows the visible day range but is best-effort: it must never block
  scrolling. The strip stays fully scrollable while events load, when no calendars are
  visible, and when the calendar is empty.

### Active date while scrolling

- On open, the strip is positioned so the first day of the active date's week (per the
  first-day-of-week setting) is at the far left, with the active day highlighted within
  that week.
- Scrolling leaves the active date unchanged, both during the gesture and after it
  settles.

### Jump navigation

- Deliberately jumping to a date sets the active date and, if that day's column is not
  already fully visible, smooth-scrolls it into view. If it is already visible, the
  viewport does not move.
- A jump changes the active date directly; scrolling into view does not select a day.
