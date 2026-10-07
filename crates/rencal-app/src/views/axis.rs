//! `InfiniteAxis` (GPUI_PORT_PLAN.md D8, §6.1): scroll state along an endless
//! axis of equal-size items, as a fractional item index from a fixed origin
//! (month view: weeks; week view: days). Every index exists, so there is no
//! prepending and no anchoring; resizing changes the item size while the
//! position stays, so the viewport never jumps.
//!
//! `WeekSnap` is the month view's snap session (port of `weekSnapSession.ts`
//! adapted to GPUI input; the maths is `rencal_layout::week_snap`):
//! - GPUI has no kinetic scrolling on Linux (Wayland's axis-stop is ignored),
//!   so there is no native fling to take over. A precise (touchpad) gesture
//!   that stops while still moving fast counts as a finger lift and flings to
//!   the week boundary ahead. On macOS the lift is the `Ended` touch phase,
//!   and the OS momentum events that follow are swallowed while the fling
//!   runs.
//! - Any other scroll settles to the nearest week after `SETTLE_IDLE_MS`.
//!
//! Everything here is plain data driven by explicit timestamps; the views own
//! the timers and the frame loop.

use std::collections::VecDeque;
use std::ops::Range;
use std::time::{Duration, Instant};

use rencal_layout::week_snap::{
    SCROLL_CAPTURE_MS, SETTLE_IDLE_MS, SnapFling, WheelSample, classify_gesture, pick_fling_target,
    pick_snap_target,
};

/// Programmatic smooth scrolls take this long.
const SCROLL_DURATION: Duration = Duration::from_millis(350);
/// A smooth scroll further than this many viewports jumps most of the way
/// first, so it never crawls through months of rows.
const MAX_ANIMATED_VIEWPORTS: f64 = 2.0;

#[derive(Clone, Copy, Debug, PartialEq)]
enum Animation {
    /// A programmatic smooth scroll, eased out.
    Scroll { from: f64, to: f64, start: Instant },
    /// A week-snap landing, in px offsets at `item_size`.
    Snap {
        fling: SnapFling,
        start: Instant,
        item_size: f32,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct InfiniteAxis {
    /// Items from the origin at the viewport's leading edge.
    position: f64,
    item_size: f32,
    viewport: f32,
    animation: Option<Animation>,
}

impl InfiniteAxis {
    pub fn new(position: f64) -> Self {
        Self {
            position,
            item_size: 0.0,
            viewport: 0.0,
            animation: None,
        }
    }

    pub fn position(&self) -> f64 {
        self.position
    }

    pub fn item_size(&self) -> f32 {
        self.item_size
    }

    /// Whether the size has been measured.
    pub fn is_measured(&self) -> bool {
        self.item_size > 0.0 && self.viewport > 0.0
    }

    /// Items that fit in the viewport.
    pub fn items_in_view(&self) -> f64 {
        if self.item_size <= 0.0 {
            return 0.0;
        }
        f64::from(self.viewport) / f64::from(self.item_size)
    }

    /// Updates the measured sizes. True when anything changed. A new item
    /// size keeps the position (the same item stays at the edge) and cancels
    /// a snap landing, whose offsets were in the old size.
    pub fn set_metrics(&mut self, item_size: f32, viewport: f32) -> bool {
        if item_size == self.item_size && viewport == self.viewport {
            return false;
        }
        if item_size != self.item_size && matches!(self.animation, Some(Animation::Snap { .. })) {
            self.animation = None;
        }
        self.item_size = item_size;
        self.viewport = viewport;
        true
    }

    /// The items at least partly in view, plus `overscan` on each side.
    pub fn visible_range(&self, overscan: i64) -> Range<i64> {
        let first = self.position.floor() as i64;
        let last = (self.position + self.items_in_view()).ceil() as i64;
        (first - overscan)..(last + overscan)
    }

    /// Where item `index` starts, relative to the viewport's leading edge.
    pub fn offset_of(&self, index: i64) -> f32 {
        ((index as f64 - self.position) * f64::from(self.item_size)) as f32
    }

    /// Whether items `[start, end)` are fully in view, with `tolerance` px of
    /// slack (rounding).
    pub fn is_fully_visible(&self, start: f64, end: f64, tolerance: f32) -> bool {
        if self.item_size <= 0.0 {
            return false;
        }
        let slack = f64::from(tolerance) / f64::from(self.item_size);
        start >= self.position - slack && end <= self.position + self.items_in_view() + slack
    }

    /// Scrolls by `delta` px (positive moves towards later items). Stops any
    /// animation: new input always wins.
    pub fn scroll_by(&mut self, delta: f32) {
        self.animation = None;
        if self.item_size > 0.0 {
            self.position += f64::from(delta) / f64::from(self.item_size);
        }
    }

    pub fn set_position(&mut self, position: f64) {
        self.animation = None;
        self.position = position;
    }

    /// Scrolls item `index` to the leading edge, smoothly or at once.
    pub fn scroll_to(&mut self, index: f64, smooth: bool, now: Instant) {
        if !smooth || !self.is_measured() {
            self.set_position(index);
            return;
        }
        let max_distance = (self.items_in_view() * MAX_ANIMATED_VIEWPORTS).max(1.0);
        let from = if (index - self.position).abs() > max_distance {
            index - max_distance.copysign(index - self.position)
        } else {
            self.position
        };
        self.position = from;
        self.animation = Some(Animation::Scroll {
            from,
            to: index,
            start: now,
        });
    }

    /// Starts a snap landing from the current offset.
    pub fn start_snap(&mut self, fling: SnapFling, now: Instant) {
        self.animation = Some(Animation::Snap {
            fling,
            start: now,
            item_size: self.item_size,
        });
    }

    pub fn is_animating(&self) -> bool {
        self.animation.is_some()
    }

    /// Where a running snap landing ends, in items (tests).
    #[cfg(test)]
    pub fn snap_target(&self) -> Option<f64> {
        match self.animation {
            Some(Animation::Snap {
                fling, item_size, ..
            }) => Some(fling.to / f64::from(item_size)),
            _ => None,
        }
    }

    pub fn cancel_animation(&mut self) {
        self.animation = None;
    }

    /// The position as px offset from the origin (snap maths works in px).
    pub fn offset(&self) -> f64 {
        self.position * f64::from(self.item_size)
    }

    /// Advances the animation to `now`. True while it is still running.
    pub fn tick(&mut self, now: Instant) -> bool {
        match self.animation {
            None => false,
            Some(Animation::Scroll { from, to, start }) => {
                let t = now.saturating_duration_since(start).as_secs_f64()
                    / SCROLL_DURATION.as_secs_f64();
                if t >= 1.0 {
                    self.position = to;
                    self.animation = None;
                    return false;
                }
                let eased = 1.0 - (1.0 - t).powi(3);
                self.position = from + (to - from) * eased;
                true
            }
            Some(Animation::Snap {
                fling,
                start,
                item_size,
            }) => {
                let elapsed = now.saturating_duration_since(start).as_secs_f64() * 1000.0;
                self.position = fling.offset_at(elapsed) / f64::from(item_size);
                if fling.is_done(elapsed) {
                    self.animation = None;
                    return false;
                }
                true
            }
        }
    }
}

/// A gesture that stops faster than this (px/s) counts as a fling.
pub const FLING_MIN_VELOCITY: f64 = 300.0;
/// Without a lift event (Linux), this long without touchpad input after a
/// precise gesture counts as the finger leaving the pad.
pub const LIFT_GAP: Duration = Duration::from_millis(50);
/// Samples this recent measure a gesture's velocity, in ms.
const VELOCITY_WINDOW_MS: f64 = 100.0;
/// OS momentum stops counting as part of the lifted gesture after this gap.
const MOMENTUM_GAP: Duration = Duration::from_millis(300);

pub const SETTLE_IDLE: Duration = Duration::from_millis(SETTLE_IDLE_MS as u64);

/// The touch phase of a wheel event (GPUI's `TouchPhase`, minus cancel).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WheelPhase {
    Started,
    Moved,
    /// The finger left the pad (macOS).
    Ended,
}

/// What a view should do with a wheel event.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WheelAction {
    /// Scroll by the delta and (re)arm the idle timers.
    Scroll,
    /// Scroll, then treat the gesture as lifted now (macOS `Ended`).
    ScrollThenLift,
    /// OS momentum after a lift: ignore it.
    Swallow,
}

#[derive(Clone, Debug)]
pub struct WeekSnap {
    epoch: Instant,
    samples: VecDeque<WheelSample>,
    /// Between a lift and the next touch: wheel events are OS momentum.
    momentum: Option<Instant>,
}

impl WeekSnap {
    pub fn new(now: Instant) -> Self {
        Self {
            epoch: now,
            samples: VecDeque::new(),
            momentum: None,
        }
    }

    fn ms(&self, at: Instant) -> f64 {
        at.saturating_duration_since(self.epoch).as_secs_f64() * 1000.0
    }

    /// Forgets the current gesture (navigation, drags, a new touch).
    pub fn reset(&mut self) {
        self.samples.clear();
        self.momentum = None;
    }

    /// Records a wheel event that moved the offset by `delta` px. `precise`
    /// is pixel (touchpad) input as opposed to mouse-wheel lines.
    pub fn on_wheel(
        &mut self,
        now: Instant,
        delta: f64,
        precise: bool,
        phase: WheelPhase,
    ) -> WheelAction {
        match phase {
            WheelPhase::Started => self.reset(),
            WheelPhase::Moved => {
                if let Some(last) = self.momentum {
                    if precise && now.saturating_duration_since(last) < MOMENTUM_GAP {
                        self.momentum = Some(now);
                        return WheelAction::Swallow;
                    }
                    self.momentum = None;
                    self.samples.clear();
                }
            }
            WheelPhase::Ended => {}
        }
        let t = self.ms(now);
        self.samples.push_back(WheelSample {
            t,
            delta_y: delta,
            delta_mode: if precise { 0 } else { 1 },
        });
        while self
            .samples
            .front()
            .is_some_and(|sample| sample.t < t - SCROLL_CAPTURE_MS)
        {
            self.samples.pop_front();
        }
        if phase == WheelPhase::Ended {
            self.momentum = Some(now);
            WheelAction::ScrollThenLift
        } else {
            WheelAction::Scroll
        }
    }

    /// Whether the current gesture is a touchpad one.
    pub fn is_precise(&self) -> bool {
        let samples: Vec<WheelSample> = self.samples.iter().copied().collect();
        classify_gesture(&samples)
    }

    /// The gesture's velocity in px/s at its last sample, from the samples
    /// in the last `VELOCITY_WINDOW_MS`. `None` without enough of them.
    pub fn velocity(&self) -> Option<f64> {
        let last = self.samples.back()?;
        let recent: Vec<&WheelSample> = self
            .samples
            .iter()
            .filter(|sample| last.t - sample.t <= VELOCITY_WINDOW_MS)
            .collect();
        if recent.len() < 2 {
            return None;
        }
        // Each sample's delta covers the interval before it, so the first
        // sample only marks where the window starts.
        let span = last.t - recent[0].t;
        if span <= 0.0 {
            return None;
        }
        let distance: f64 = recent[1..].iter().map(|sample| sample.delta_y).sum();
        Some(distance / span * 1000.0)
    }

    /// The landing for a gesture lifted at `offset`, if it was a fling.
    pub fn fling(&mut self, offset: f64, row_height: f64) -> Option<SnapFling> {
        let fling = (|| {
            if !self.is_precise() {
                return None;
            }
            let velocity = self.velocity()?;
            if velocity.abs() < FLING_MIN_VELOCITY {
                return None;
            }
            let to = pick_fling_target(offset, velocity, row_height, f64::MAX)?;
            Some(SnapFling::new(offset, velocity, to))
        })();
        self.samples.clear();
        fling
    }

    /// The landing that settles `offset` on the nearest row, if it is off one.
    pub fn settle(offset: f64, row_height: f64) -> Option<SnapFling> {
        if row_height <= 0.0 {
            return None;
        }
        let to = pick_snap_target(offset, row_height, f64::MAX);
        ((to - offset).abs() >= 1.0).then(|| SnapFling::new(offset, 0.0, to))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn measured(position: f64) -> InfiniteAxis {
        let mut axis = InfiniteAxis::new(position);
        axis.set_metrics(100.0, 450.0);
        axis
    }

    #[test]
    fn visible_range_covers_partial_items_and_overscan() {
        let axis = measured(10.5);
        assert_eq!(axis.visible_range(0), 10..15);
        assert_eq!(axis.visible_range(2), 8..17);
        assert_eq!(axis.offset_of(12), 150.0);
    }

    #[test]
    fn resizing_keeps_the_position() {
        let mut axis = measured(10.5);
        axis.set_metrics(150.0, 600.0);
        assert_eq!(axis.position(), 10.5);
        assert_eq!(axis.offset_of(11), 75.0);
    }

    #[test]
    fn full_visibility_has_tolerance() {
        let axis = measured(10.0);
        assert!(axis.is_fully_visible(10.0, 14.0, 1.0));
        assert!(!axis.is_fully_visible(10.0, 15.0, 1.0));
        assert!(axis.is_fully_visible(9.995, 11.0, 1.0));
        assert!(!axis.is_fully_visible(9.0, 10.0, 1.0));
    }

    #[test]
    fn smooth_scrolls_ease_to_the_target_and_input_cancels_them() {
        let start = Instant::now();
        let mut axis = measured(10.0);
        axis.scroll_to(12.0, true, start);
        assert!(axis.tick(start + Duration::from_millis(100)));
        assert!(axis.position() > 10.0 && axis.position() < 12.0);
        assert!(!axis.tick(start + SCROLL_DURATION));
        assert_eq!(axis.position(), 12.0);

        axis.scroll_to(20.0, true, start);
        axis.scroll_by(50.0);
        assert!(!axis.is_animating());
    }

    #[test]
    fn far_smooth_scrolls_jump_most_of_the_way() {
        let start = Instant::now();
        let mut axis = measured(10.0);
        axis.scroll_to(1000.0, true, start);
        assert!((axis.position() - (1000.0 - 4.5 * MAX_ANIMATED_VIEWPORTS)).abs() < 1e-9);
        axis.tick(start + SCROLL_DURATION);
        assert_eq!(axis.position(), 1000.0);
    }

    #[test]
    fn snap_landings_end_on_the_target_and_a_resize_cancels_them() {
        let start = Instant::now();
        let mut axis = measured(10.3);
        let fling = WeekSnap::settle(axis.offset(), 100.0).unwrap();
        assert_eq!(fling.to, 1000.0);
        axis.start_snap(fling, start);
        while axis.tick(start + Duration::from_secs(2)) {}
        assert_eq!(axis.position(), 10.0);

        axis.start_snap(WeekSnap::settle(1030.0, 100.0).unwrap(), start);
        axis.set_metrics(120.0, 450.0);
        assert!(!axis.is_animating());
    }

    fn feed(snap: &mut WeekSnap, start: Instant, deltas: &[(u64, f64)]) {
        for &(ms, delta) in deltas {
            snap.on_wheel(
                start + Duration::from_millis(ms),
                delta,
                true,
                WheelPhase::Moved,
            );
        }
    }

    #[test]
    fn a_fast_touchpad_stop_flings_to_the_boundary_ahead() {
        let start = Instant::now();
        let mut snap = WeekSnap::new(start);
        feed(
            &mut snap,
            start,
            &[(0, 20.0), (10, 24.0), (20, 30.0), (30, 28.0)],
        );
        // 82px over 30ms ≈ 2733px/s.
        let velocity = snap.velocity().unwrap();
        assert!((velocity - 82.0 / 30.0 * 1000.0).abs() < 1e-6);
        let fling = snap.fling(1030.0, 100.0).unwrap();
        assert!(fling.to > 1030.0 && fling.to % 100.0 == 0.0);
    }

    #[test]
    fn slow_stops_and_mouse_wheels_settle_instead() {
        let start = Instant::now();
        let mut snap = WeekSnap::new(start);
        feed(&mut snap, start, &[(0, 1.0), (16, 2.0), (32, 1.0)]);
        assert_eq!(snap.fling(1030.0, 100.0), None);

        for ms in [0, 50, 100] {
            snap.on_wheel(
                start + Duration::from_millis(ms),
                53.0,
                false,
                WheelPhase::Moved,
            );
        }
        assert_eq!(snap.fling(1030.0, 100.0), None);
        assert_eq!(WeekSnap::settle(1030.0, 100.0).unwrap().to, 1000.0);
        assert_eq!(WeekSnap::settle(1000.4, 100.0), None);
    }

    #[test]
    fn os_momentum_after_a_lift_is_swallowed_until_the_next_touch() {
        let start = Instant::now();
        let mut snap = WeekSnap::new(start);
        feed(&mut snap, start, &[(0, 20.0), (10, 24.0), (20, 30.0)]);
        let lift = snap.on_wheel(
            start + Duration::from_millis(30),
            28.0,
            true,
            WheelPhase::Ended,
        );
        assert_eq!(lift, WheelAction::ScrollThenLift);
        let momentum = start + Duration::from_millis(46);
        assert_eq!(
            snap.on_wheel(momentum, 20.0, true, WheelPhase::Moved),
            WheelAction::Swallow
        );
        assert_eq!(
            snap.on_wheel(momentum, 5.0, true, WheelPhase::Started),
            WheelAction::Scroll
        );
    }
}
