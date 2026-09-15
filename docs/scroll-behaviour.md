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

User scrolls land on a week boundary. Snapping is off during initial positioning,
event drags, drag-to-create selections, and when reduced motion is requested.
Programmatic scrolls (the initial anchor, jump navigation, the row-height rescale on
resize, and the prepend correction) always target a row multiple, so they never
fight the snap. There are two implementations, chosen once at startup by platform:

**macOS: native CSS scroll snap.** The scroller gets `scroll-snap-type: y mandatory`
and `src/components/main/month-view/WeekSnapPoints.tsx` renders an invisible 1px
`scroll-snap-align: start` sentinel per loaded week. The week rows are virtualized,
so they cannot be the snap areas: a fling needs targets ahead of the rendered
window. Weeks containing the 1st are `scroll-snap-stop: always`, so a fling never
skips past a month boundary (as in Notion Calendar). WebKit's Mac port folds the snap
into the trackpad momentum itself, so there is no JS animation and no input tracking.

- Snapping is toggled off by removing the snap classes while a drag or selection is
  active: both autoscrollers move the container with per-frame `scrollBy` calls that a
  mandatory snap would clamp back to the current row. The snap re-engages on drop.
- During a prepend, native snapping is disabled in the render that moves the sentinels
  and stays disabled until `scrollend` (with a short fallback). Re-enabling it on the
  next frame can make WebKit resume toward its stale, pre-prepend momentum target. A
  row-height change only needs the snap areas hidden for the correction frame.
- A prepend that lands mid-fling stops WebKit's momentum at the corrected position.
  This is the one case that still needs physical trackpad verification.

**Linux (WebKitGTK): JS fling takeover.** WebKitGTK disables kinetic scrolling
entirely once snap points exist ([WebKit bug 229037](https://bugs.webkit.org/show_bug.cgi?id=229037)),
so CSS snapping would kill every trackpad fling at finger lift.

- Direct scrolling stays native. Eligible trackpad flings transition to a JS
  animation that lands on a week boundary ahead in the direction of motion.
  Other scrolls settle to the nearest week after 250 ms idle.
- New input cancels the animation immediately. Snapping is additionally disabled
  during date navigation. Programmatic scrolls never start a snap session.
- Prepending months preserves the ongoing gesture or animation. Resizing cancels
  the animation and lets an active session settle using the new row height.

Implementation: `src/components/main/month-view/weekSnapSession.ts` manages input
and sessions; `weekSnapFling.ts` owns animation and tuning. Device detection and
native fling takeover still need physical trackpad/mouse verification.

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
- This visibility check also runs when the target date is already active, so "t"
  brings today back into view after scrolling away without changing the selection.
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
- This visibility check also runs when the target date is already active, so "t"
  brings today back into view after scrolling away without changing the selection.
- A jump changes the active date directly; scrolling into view does not select a day.
