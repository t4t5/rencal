## Month view

The month view is a vertically-stacked, endlessly-scrollable grid of week rows.
Two things move independently and must never be confused:

- **Scroll position** — where the viewport is. Moved by the user, and by deliberate
  navigation, with the month-view snap animator landing user scrolls on week rows.
- **Active date** — the highlighted day that drives the header's month label, the
  minical, and keyboard navigation. Follows the scroll, but does not control it.

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

- A wheel session becomes eligible after two consecutive scroll events without
  intervening wheel input. The last three timestamped offsets must show movement
  in the same direction with non-increasing frame deltas. Acceleration disqualifies
  that coasting sequence, including its later deceleration; line/page wheel input
  is also excluded. This is a heuristic, since DOM wheel events do not identify
  the physical input device.
- On takeover, one instant `scrollTo` stops the native animation. Measured velocity
  predicts the natural end as `from + velocity / 4`; the nearest week boundary to
  that prediction becomes the target, clamped to the current scroll range. A target
  behind the current motion is left for idle settling instead of reversing a fling.
- The frame loop follows `target - (target - from) * exp(-rate * elapsedSeconds)`.
  The rate is `abs(velocity / (target - from))`, clamped to 4–30 per second. This
  matches entry velocity when within those limits. Fractional positions stay in JS
  so rounded `scrollTop` values cannot stall the tail. The final write lands exactly
  on the target, within 0.5 px or at the 1500 ms safety cap.
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
  `just debug wheel-trace` logs wheel/scroll timestamps, deltas, offsets, whether a
  wheel arrived since the last scroll, and unexpected offsets during animation.
  Use `just debug month-scroll,wheel-trace` for both.

All tuning constants live at the top of `weekSnapFling.ts`: kinetic friction 4,
takeover after 2 coast frames, decay bounds 4–30, idle delay 250 ms, maximum duration
1500 ms, and completion tolerance 0.5 px.

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
  The acceleration guard avoids treating that curve as a trackpad fling.

Notion Calendar's reference bundle uses permanent mandatory CSS snapping; Chromium
can carry a fling continuously into its snap target. renCal instead adapts the fling
in JS for WebKitGTK. Physical trackpad/mouse traces, native kinetic cancellation,
and feel tuning still need live verification on the target WebKitGTK build; unit
fixtures verify the session/physics rules but cannot establish native event behavior.

### Active date while scrolling

- On open, the grid is positioned so the first week of the current date's month is at
  the top of the viewport (the 1st of that month is visible).
- As the user scrolls, the active date follows the scroll. Updating the active date
  never moves the viewport; the snap session handles week-row alignment independently.
  - The active date jumps to the 1st of whichever month currently fills the most of
    the viewport.
  - The jump only commits once that month's first-of-month week is fully visible.
    Scrolling within a month (when no 1st-of-month week is on screen) leaves the
    active date unchanged.
  - To avoid flicker at month boundaries, the current month wins ties — we only
    switch when another month is _strictly_ more visible.

### Jump navigation

- Deliberately jumping to a date — the "t" (today) shortcut, "hjkl", a minical click,
  or clicking a day — sets the active date and, if that date's week is not already
  fully visible, scrolls it to the top of the viewport. If it is already fully
  visible, the viewport does not move.
- These programmatic scrolls must not trigger the scroll-follow behavior above: a jump
  changes the active date directly, not as a reaction to what scrolls into view.

## Week view

The week view is a horizontally-scrollable strip of day columns, over a fixed 24-hour
time grid. The same separation as the month view applies: the **scroll position**
follows the user (and deliberate jumps); the **active date** follows the scroll but
never controls it.

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
- As the user scrolls, the active date follows but the viewport is never programmatically
  moved. The active date does not change mid-scroll; once scrolling settles, it becomes
  the leftmost fully-visible day column.

### Jump navigation

- Deliberately jumping to a date sets the active date and, if that day's column is not
  already fully visible, smooth-scrolls it into view. If it is already visible, the
  viewport does not move.
- These programmatic scrolls must not trigger the scroll-follow behavior above.
