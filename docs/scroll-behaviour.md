## Month view

The month view is a vertically-stacked, endlessly-scrollable grid of week rows.
Two things move independently and must never be confused:

- **Scroll position** — where the viewport is. Moved by the user, and by deliberate
  navigation. Never moved as a side effect of the user's own scrolling.
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

### Active date while scrolling

- On open, the grid is positioned so the first week of the current date's month is at
  the top of the viewport (the 1st of that month is visible).
- As the user scrolls, the active date follows the scroll, but **the viewport is never
  programmatically moved** — we never hijack the user's scroll position.
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

- On open, the strip is positioned so the Monday of the active date's week is at the far
  left, with the active day highlighted within that week.
- As the user scrolls, the active date follows but the viewport is never programmatically
  moved. The active date does not change mid-scroll; once scrolling settles, it becomes
  the leftmost fully-visible day column.

### Jump navigation

- Deliberately jumping to a date sets the active date and, if that day's column is not
  already fully visible, smooth-scrolls it into view. If it is already visible, the
  viewport does not move.
- These programmatic scrolls must not trigger the scroll-follow behavior above.
