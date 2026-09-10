# Plan: continuous week snapping in the month view

Branch: `week-snapping` (this worktree: `week-snapping-fable`).
Builds on commit `95c5d46 Basic week snapping`.

## Goal

Make the week-row snap feel like the tail end of the user's own scroll, the way
Notion Calendar does in Chromium: one continuous motion from finger lift to the
week boundary, with no pause and no second animation.

Today the session waits 700 ms of silence and then calls
`scrollTo({ behavior: "smooth" })`. In WebKit that is a separate ease-in-out
capped at 200 ms, starting from zero velocity, after the fling has already died.
Two motions and a gap, which reads as "stop, then snap".

## Facts that shape the design

All verified against Notion's bundle (`~/Downloads/App-DnfGLEPj.js`) and the
WebKit source at tag `webkitgtk-2.52.6` (the installed `webkit2gtk-4.1`).

1. **Notion never snaps with JS.** Its month-view scroll container keeps
   `scroll-snap-type: y mandatory` on for the whole gesture. Snap targets are
   invisible 1px marker divs (`scroll-snap-align: start`), one per week, for
   ±60 weeks around the current period. Weeks containing the 1st of a month get
   `scroll-snap-stop: always`. JS only re-centres the marker window 200 ms after
   the last scroll event, hiding snap alignment for one frame while markers move.
   Chromium's compositor (`cc::SnapFlingController`) then lands the fling on the
   snap point as a velocity-continuous animation. No idle timer anywhere.

2. **We cannot copy that in WebKitGTK.** In
   `ScrollingEffectsController::processWheelEventForKineticScrolling`:
   `if (usesScrollSnap()) return false;`. Snap points disable kinetic scrolling
   entirely, and the file states momentum-based snapping is Mac only. With CSS
   snapping on, the fling dies at finger lift and the end-of-gesture event is
   clamped to the nearest snap offset. This is what the existing doc note about
   "fast gestures crossing weeks" was working around.

3. **JS cannot see the finger lift.** GTK's scroll-stop event becomes a
   zero-delta wheel event with phase `Ended`. `Element::dispatchWheelEvent`
   calls `stopPropagation()` on zero-delta events, so no listener ever sees it.

4. **WebKitGTK's fling physics are simple and fully predictable**
   (`ScrollAnimationKinetic.cpp`, a port of GTK+ 3.20 kinetic scrolling):

   ```
   decelFriction = 4  (1/s)
   offset(t)   = x0 + (v0 / 4) · (1 − e^(−4t))
   velocity(t) = v0 · e^(−4t)
   remaining travel from any instant = velocity / 4
   animation ends when |velocity| < 1 px/s or the frame delta is < 1 px
   ```

   `v0` is the sum of wheel deltas in the last 150 ms divided by that time span
   (`scrollCaptureThreshold`). Those deltas and timestamps are exactly what our
   `wheel` listener receives, so we can reproduce `v0` if needed.

5. **Fling frames are distinguishable from gesture frames.** During a gesture
   every `scroll` event is preceded by a `wheel` event (WebKit applies the delta
   synchronously, the scroll event fires at the next rendering update). During
   the kinetic animation `scroll` events arrive every frame with no `wheel`
   events between them.

6. **Mouse wheels never fling.** `hasPreciseScrollingDeltas` is false for
   `GDK_SOURCE_MOUSE`, so WebKit skips kinetic scrolling and instead animates
   each notch with `ScrollAnimationSmooth` (ease-in-out, ≤200 ms) when smooth
   scrolling is enabled. Those animated frames also arrive without wheel events,
   so a naive "no wheel between scrolls" rule would hijack mouse-wheel notches.

7. **A programmatic instant `scrollTo` stops the running native animation.**
   The current `pause()` already relies on this for smooth-scroll animations;
   kinetic animations occupy the same `m_currentAnimation` slot. Phase 0
   confirms it for the kinetic case before anything else is built.

## Design

Own the fling in JS, using WebKit's own physics.

1. Let the native gesture and the first two kinetic frames run untouched.
2. On the second consecutive scroll event with no wheel event in between
   (a trackpad session, no pointer or key held), measure the current velocity
   from the last scroll samples, stop the native animation with one instant
   `scrollTo`, predict where the fling would have ended (`x + v / 4`), choose the
   week boundary nearest that point, and drive our own frame loop to it with the
   same exponential decay, velocity matched at the takeover instant.
3. If the gesture ends without a fling (slow release, held fingers, mouse wheel,
   keyboard, scrollbar), fall back to a short idle timer and run the same
   animator from zero velocity.

Because the takeover happens about two frames after release, at the fling's own
velocity, on the fling's own curve, it reads as one motion.

### Physics (pure, `weekSnapFling.ts`)

```
WEBKIT_DECEL_FRICTION = 4         // px/s velocity decays as v·e^(−4t)
predictedEnd = clamp(from + v / WEBKIT_DECEL_FRICTION, 0, maxOffset)
target       = clamp(round(predictedEnd / rowHeight) · rowHeight, 0, maxOffset)
d            = target − from
k            = clamp(|v / d|, DECAY_MIN, DECAY_MAX)   // v = 0 ⇒ DECAY_MIN
offset(t)    = target − d · e^(−k·t)                   // t = seconds since takeover
done when    |target − offset| < 0.5 px  ⇒ write target exactly
```

Rationale for `k`: `offset(t)` starts with velocity `k · d`. Choosing
`k = v / d` preserves the measured velocity exactly, so the only thing that
changes at takeover is where the curve lands. When the boundary is farther than
the natural end, the decay is slower (a longer glide). When it is nearer, the
decay is faster (a firmer landing). `DECAY_MIN` stops a slow fling far from a
boundary from gliding for seconds; `DECAY_MAX` keeps tiny corrections from
being an instant jump. Closed form over elapsed time, with `current` tracked in
JS rather than read back from `scrollTop`, so integer rounding of `scrollTop`
cannot stall the tail.

### Input session (`weekSnapSession.ts`, reworked)

State machine, one object per scroll container:

```
phase:  idle | gesture | fling | settle
input:  wheel | pointer | key           (what started the gesture)
samples: last 3 user scroll samples { t, y } from event.timeStamp / scrollTop
coasting: consecutive scroll events with no wheel event in between
```

Transitions:

- `wheel` (non-ctrl, deltaY ≠ 0): cancel any running fling/settle (rAF cancel,
  no scrollTo needed since the animation is ours), `phase = gesture`,
  `input = wheel`, `wheelSinceScroll = true`, restart the idle timer.
- `scroll`:
  - `phase = idle` or suspended (see `pause`): ignore. Programmatic scrolls from
    navigation and geometry corrections never start a session.
  - `phase = fling | settle`: expect our own frame. If `scrollTop` differs from
    the last value we wrote by more than 1 px, log it (Phase 0 diagnostic; this
    would mean the native animation was not cancelled).
  - `phase = gesture`: push sample; `coasting = wheelSinceScroll ? 0 : coasting + 1`;
    `wheelSinceScroll = false`; restart the idle timer; then try takeover.
- Takeover (all must hold): `input = wheel`, `coasting >= 2`, no pointer or key
  held, `getState().enabled`, no reduced-motion preference, both coasting frame
  deltas have the same sign and the second is not larger than the first
  (kinetic decay decelerates from frame one; a mouse-notch ease-in-out
  accelerates first), and `|target − from| >= 1`. Then `phase = fling`,
  `el.scrollTo({ top: from, behavior: "instant" })` once to stop the native
  animation, start the animator.
- Idle timer fires (`SETTLE_IDLE_MS`, `phase = gesture`, no pointer/key held):
  `phase = settle`, animator from `v = 0` to the nearest week, if
  `getState().enabled`, not reduced motion, and off-boundary by ≥ 1 px.
- Animator done: write `target`, `phase = idle`.
- `pointerdown` / `keydown` (scroll keys): cancel animation, `phase = gesture`,
  `input = pointer | key`. `pointerup` / `keyup`: restart the idle timer.
  Scrollbar drags and key scrolling therefore only ever use the settle path.
- `blur`, `cleanup`, `cancel()`: cancel animation, `phase = idle`, clear timers.
- `pause()` (geometry corrections from the grid): cancel animation, keep
  `phase = gesture` so the idle timer re-settles after the correction, reset
  `coasting`, and ignore scroll events until the next animation frame
  (`requestAnimationFrame` clears the suspension). The correction's own scroll
  event runs in the scroll steps of the next rendering update, before rAF
  callbacks, so it is always swallowed.

`el.dataset.weekSnap` reflects `fling` / `settle` while animating and is removed
otherwise. It exists for tests and DevTools only.

### Grid integration (`Grid.tsx`)

Unchanged in shape: the session is attached once, `getSnapState` still reports
`enabled` (initial scroll done, no create-drag, no event drag, not navigating)
and `rowHeight`. `pause()` on prepend/resize and `cancel()` on navigation stay.
The scroll-follow logic needs no change: animated frames still fire `scroll`
events, so the active month follows a fling exactly as it follows a native one.
Rename the `scrollend` debug message from "native week snap settled" to
"week snap settled".

## Files

```
src/components/main/month-view/weekSnapFling.ts        new: constants, physics, frame animator
src/components/main/month-view/weekSnapFling.test.ts   new
src/components/main/month-view/weekSnapSession.ts      rework: state machine above
src/components/main/month-view/weekSnapSession.test.ts update + new cases
src/components/main/month-view/Grid.tsx                debug message rename only
docs/scroll-behaviour.md                               rewrite "Week-row snapping"
```

`weekSnapFling.ts` exports only what the session and its tests use
(`just typecheck` runs knip's unused-export check). Suggested API:

```ts
export const WEBKIT_DECEL_FRICTION = 4
export function predictFlingEnd(from: number, velocity: number, maxOffset: number): number
export function pickSnapTarget(offset: number, rowHeight: number, maxOffset: number): number
export function decayRate(velocity: number, distance: number): number
export function startSnapFling(
  el: Pick<HTMLElement, "scrollTo">,
  opts: { from: number; velocity: number; to: number; onDone: () => void },
  clock?: {
    now: () => number
    requestFrame: typeof requestAnimationFrame
    cancelFrame: typeof cancelAnimationFrame
  },
): { cancel: () => void; lastWritten: () => number }
```

The injectable clock keeps the animator testable with the existing fake
`ScrollContainer` and `vi.useFakeTimers()` without a DOM.

## Constants (one block at the top of `weekSnapFling.ts`, all tunable)

| Name                    | Start value | Why                                                              |
| ----------------------- | ----------- | ---------------------------------------------------------------- |
| `WEBKIT_DECEL_FRICTION` | 4           | WebKit's kinetic friction; predicts the native landing point     |
| `TAKEOVER_COAST_FRAMES` | 2           | first frame is indistinguishable from a gesture frame            |
| `DECAY_MIN`             | 4           | never glide slower than WebKit's own fling; also the settle rate |
| `DECAY_MAX`             | 30          | sub-row corrections finish in ~100 ms instead of jumping         |
| `SETTLE_IDLE_MS`        | 250         | Notion re-centres after 200 ms; we also cannot see held fingers  |
| `FLING_MAX_MS`          | 1500        | safety cap on any animation                                      |
| `DONE_EPSILON_PX`       | 0.5         | land exactly on the boundary                                     |

`SETTLE_IDLE_MS` replaces the 700 ms gate. The gap between two swipes no longer
needs covering: the first swipe's fling is taken over immediately, and the next
swipe's wheel event cancels it on the spot.

## Phases

### Phase 0: instrument and verify assumptions (no behaviour change)

Add a `wheel-trace` debug namespace (or extend `month-scroll`) that logs every
`wheel` and `scroll` event on the grid with `timeStamp`, `deltaY`, `scrollTop`,
and the wheel-since-last-scroll flag. Run `just debug wheel-trace` and record:

1. Trackpad flick: wheel→scroll alternation during the gesture, then scroll-only
   frames. Check consecutive coasting deltas shrink by ≈ `e^(−4·dt)` (≈ 0.94 per
   16.7 ms frame). This validates the friction constant in this build.
2. Trackpad slow drag, hold, lift: no coasting frames, then silence.
3. Mouse wheel, one notch and a fast spin: delta values, cadence, and whether an
   animation runs (accelerating frames = ease-in-out) or the offset jumps.
4. Temporarily call `scrollTo({ top: scrollTop, behavior: "instant" })` on the
   second coasting frame and confirm no further native scroll events arrive.
   If they do, the takeover design needs a different cancellation and the rest
   of this plan is on hold.
5. Keyboard and scrollbar scrolling, for completeness.

Findings feed the takeover rule and the constants. Keep the tracer; it is cheap
and gated by `isDebugMode`.

### Phase 1: physics module

`weekSnapFling.ts` and tests: predicted end and clamping; nearest-row target
including ties and range clamping; `decayRate` clamping; the animator lands
exactly on `to`, is monotonic, is frame-rate independent (8 ms and 16 ms fake
frames reach the same offsets at the same times), honours `cancel`, and
respects `FLING_MAX_MS`.

### Phase 2: session rework

Rewrite `weekSnapSession.ts` to the state machine above. Update existing tests
(700 → `SETTLE_IDLE_MS`, `"settling"` → `"settle"`) and add:

- two coasting scroll events from a wheel session trigger exactly one instant
  `scrollTo` followed by animator frames to the nearest row;
- a wheel event mid-fling cancels the animation and no further frames run;
- pointer-started and key-started sessions never take over, only settle;
- accelerating coasting frames (mouse-notch shape) do not take over;
- the scroll event after `pause()` is ignored and the session still settles;
- `enabled: false` at takeover time leaves the native fling alone;
- `cancel()` and `cleanup()` leave no timers or frames behind.

### Phase 3: grid and docs

Rename the `scrollend` debug message in `Grid.tsx`. Rewrite the
"Week-row snapping" section of `docs/scroll-behaviour.md`: the takeover model,
the constants, and facts 2 to 6 above (short, with the WebKit file names), and
fix the two sentences elsewhere in that doc that say the browser owns the snap.
Run `just typecheck` and `just test`.

### Phase 4: tune in the app

`just debug month-scroll`, checklist:

- flick: one continuous motion, lands on a boundary, `offsetFromWeek` logs 0;
- flick then flick again mid-fling: instant handover, no jump, no double motion;
- slow release: settles within roughly a quarter second, ease-out only;
- mouse wheel notch and spin: not hijacked, settles afterwards;
- keyboard and scrollbar: settle only;
- fling into the top edge (prepend) and window resize during a fling: no jump,
  re-settles after the correction;
- `t`, `hjkl`, minical click, day click: unchanged, no snap interference;
- drag-to-create and event drag: unchanged;
- reduced motion: no animation at all.

Adjust `DECAY_MIN`, `DECAY_MAX`, and `SETTLE_IDLE_MS` from what feels right.

## Follow-ups (not in this pass)

- **Month-start hard stops.** Notion never lets a fling cross a month boundary
  (`scroll-snap-stop: always` on weeks containing the 1st). Needs the session
  to know which row indexes are hard stops; `getState` could return them.
- **Shift instead of cancel on prepend.** A prepend mid-fling currently
  cancels the fling and re-settles. A `session.shift(deltaPx)` that moves the
  animator's `from` and `to` would keep the motion continuous.
- **Directional mouse-wheel snapping.** Chromium snaps wheel notches in the
  wheel's direction, so each notch is one week in Notion. Could replace the
  settle path for mouse sessions once Phase 0 shows a reliable mouse signature.
- Week view keeps its current behaviour.

## Non-goals

- CSS scroll snapping in any form (fact 2).
- `preventDefault` on wheel events or synthetic scroll deltas during a gesture.
  The native gesture stays untouched; we only own the coasting phase.
