## Month view

The month view is a vertically-stacked, endlessly-scrollable grid of week rows.
Two things move independently and must never be confused:

- **Scroll position** — where the viewport is. Moved by the user, and by deliberate
  navigation, with a final week-row snap after the user's scrolling settles.
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

- The scroll container aligns to the nearest week with an explicit
  `scrollTo({ top, behavior: "smooth" })` after 700 ms without wheel input or scroll
  movement. This quiet
  period includes momentum and allows short pauses between trackpad swipes.
  `weekSnapSession.ts` owns that input session; the browser owns the snap animation.
- New wheel input synchronously interrupts an active snap
  before the browser applies the input. During the gesture there are no snap points
  constraining the viewport, prevented wheel events, or synthetic scroll deltas.
- The target uses the current row height and scroll offset, clamped to the scroll
  range. CSS scroll snapping remains off, so fast gestures can cross any number of
  weeks and changing snap styles cannot cause an instant jump in WebKitGTK.
- Snapping is disabled during initial positioning and event creation/rescheduling
  drags, and when reduced motion is requested. Date navigation already targets
  week boundaries and keeps its existing scroll-follow suppression.
- Pointer/key release is required before settling. Prepend/resize corrections
  suspend snapping; explicit date navigation cancels the pending session.
- `just debug month-scroll` logs native scroll-end offsets for checking alignment.

The reference Notion Calendar bundles (`App-DnfGLEPj.js`, `cron-BwS_eHfk.js`,
inspected September 2026) use native mandatory snapping with independent markers.
They reset the marker range after 200 ms of scroll inactivity, plus another 1000 ms
only when their Safari user-agent check matches. Chromium does not use that extra
delay. Our input-session gate and explicit smooth alignment adapt this behavior
for renCal's WebKitGTK trackpad handling. Enabling CSS snapping after the idle
period caused an instant jump even with `scroll-behavior: smooth`.

### Active date while scrolling

- On open, the grid is positioned so the first week of the current date's month is at
  the top of the viewport (the 1st of that month is visible).
- As the user scrolls, the active date follows the scroll. Updating the active date
  never moves the viewport; the browser handles week-row snapping as scrolling settles.
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
