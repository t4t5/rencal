//! Month-view week snapping maths (port of the pure parts of
//! `month-view/weekSnapFling.ts`; the scroll session that drives it is app
//! code, GPUI_PORT_PLAN.md §6.1).
//!
//! A fling lands on the week boundary ahead of where kinetic scrolling would
//! have stopped; any other scroll settles to the nearest boundary after
//! `SETTLE_IDLE_MS` without input. (The TS session took over WebKitGTK's
//! native kinetic scroll after a few coasting frames; GPUI has no native
//! kinetic scrolling on Linux, so the app flings at the finger lift instead
//! and those takeover constants are gone.) Offsets and velocities are px and
//! px/s as `f64` (see the crate docs).

/// Kinetic scrolling friction the fling prediction models (WebKitGTK's).
const DECEL_FRICTION: f64 = 4.0;
/// Window of recent wheel events used to classify a gesture, in ms (TS
/// `WEBKIT_SCROLL_CAPTURE_MS`).
pub const SCROLL_CAPTURE_MS: f64 = 150.0;
/// Idle time after the last scroll input before settling to a week, in ms.
pub const SETTLE_IDLE_MS: f64 = 250.0;
const PRECISE_MIN_EVENTS: usize = 3;
/// A target closer than this (in the direction of motion) counts as reached.
const SNAP_AHEAD_MIN_PX: f64 = 1.0;
const DECAY_MIN: f64 = 4.0;
const DECAY_MAX: f64 = 30.0;
const FLING_MAX_MS: f64 = 1500.0;
/// Speed (px/s) at which the landing curve ends instead of creeping on.
const LANDING_END_VELOCITY: f64 = 60.0;

fn clamp_offset(offset: f64, max_offset: f64) -> f64 {
    offset.min(max_offset.max(0.0)).max(0.0)
}

/// Where native kinetic scrolling would stop.
pub fn predict_fling_end(from: f64, velocity: f64, max_offset: f64) -> f64 {
    clamp_offset(from + velocity / DECEL_FRICTION, max_offset)
}

/// The nearest week boundary to `offset`.
pub fn pick_snap_target(offset: f64, row_height: f64, max_offset: f64) -> f64 {
    clamp_offset(
        crate::js_round(offset / row_height) * row_height,
        max_offset,
    )
}

/// The week boundary a fling lands on: nearest to the predicted end, but always
/// at least one pixel ahead in the direction of motion. `None` when there is no
/// motion or no boundary ahead.
pub fn pick_fling_target(
    from: f64,
    velocity: f64,
    row_height: f64,
    max_offset: f64,
) -> Option<f64> {
    if velocity == 0.0 || velocity.is_nan() || row_height <= 0.0 {
        return None;
    }
    let direction = velocity.signum();
    let predicted = predict_fling_end(from, velocity, max_offset);
    let mut target = crate::js_round(predicted / row_height) * row_height;
    if (target - from) * direction < SNAP_AHEAD_MIN_PX {
        target += direction * row_height;
    }
    let target = clamp_offset(target, max_offset);
    ((target - from) * direction >= SNAP_AHEAD_MIN_PX).then_some(target)
}

/// One wheel event in the recent-input log.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct WheelSample {
    /// Timestamp in ms.
    pub t: f64,
    pub delta_y: f64,
    /// DOM `deltaMode`: 0 pixels, 1 lines, 2 pages.
    pub delta_mode: u32,
}

/// Whether the recent wheel stream looks like a precise (touchpad) gesture: at
/// least three pixel-mode events within `SCROLL_CAPTURE_MS` of the newest with
/// at least two distinct magnitudes. Mouse wheels repeat one step size.
pub fn classify_gesture(log: &[WheelSample]) -> bool {
    let Some(newest) = log.last() else {
        return false;
    };
    let mut recent = log
        .iter()
        .filter(|sample| newest.t - sample.t <= SCROLL_CAPTURE_MS);
    // Line/page input stays excluded until real traces show its modes.
    if recent.clone().any(|sample| sample.delta_mode != 0) {
        return false;
    }
    let Some(first) = recent.next() else {
        return false;
    };
    let mut count = 1;
    let mut varied = false;
    for sample in recent {
        count += 1;
        varied |= sample.delta_y.abs() != first.delta_y.abs();
    }
    count >= PRECISE_MIN_EVENTS && varied
}

/// Exponential decay rate (1/s) of a landing: matches the fling's velocity over
/// the distance where possible, bounded so short hops don't snap and long ones
/// don't crawl.
pub fn decay_rate(velocity: f64, distance: f64) -> f64 {
    if velocity == 0.0 || distance == 0.0 {
        return DECAY_MIN;
    }
    (velocity / distance).abs().clamp(DECAY_MIN, DECAY_MAX)
}

/// The landing curve from `from` to `to`: exponential decay at `decay_rate`,
/// cut off where its speed drops to `LANDING_END_VELOCITY` (then normalised to
/// cover the whole distance) and capped at `FLING_MAX_MS`. The session samples
/// it per frame with the elapsed time, so it is frame-rate independent.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SnapFling {
    pub from: f64,
    pub to: f64,
    rate: f64,
    duration_ms: f64,
    scale: f64,
}

impl SnapFling {
    pub fn new(from: f64, velocity: f64, to: f64) -> Self {
        let distance = to - from;
        let rate = decay_rate(velocity, distance);
        let duration = ((rate * distance.abs() / LANDING_END_VELOCITY).ln() / rate).max(0.0);
        Self {
            from,
            to,
            rate,
            duration_ms: duration * 1000.0,
            scale: -(-rate * duration).exp_m1(),
        }
    }

    /// Whether the landing is over `elapsed_ms` after it started.
    pub fn is_done(&self, elapsed_ms: f64) -> bool {
        let elapsed = elapsed_ms.max(0.0);
        elapsed >= self.duration_ms || elapsed >= FLING_MAX_MS
    }

    /// The offset `elapsed_ms` after the start; exactly `to` once done.
    pub fn offset_at(&self, elapsed_ms: f64) -> f64 {
        if self.is_done(elapsed_ms) {
            return self.to;
        }
        let progress = -(-self.rate * elapsed_ms.max(0.0) / 1000.0).exp_m1() / self.scale;
        self.from + (self.to - self.from) * progress
    }
}
