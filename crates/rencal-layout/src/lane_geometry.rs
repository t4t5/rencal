//! Month-row all-day bar geometry (port of `month-view/lane-geometry.ts`, which
//! produced CSS `calc()` strings; here the theme metrics are inputs and the
//! result is a rectangle).

use crate::lanes::AllDaySpan;
use crate::{DAYS_PER_WEEK, Rect};

/// Vertical gap below each lane's bar, in px.
pub const LANE_GAP: f32 = 3.0;

/// How far a bar extends past a clipped end (one continuing from the previous
/// row or into the next), in px, so it reads as running off the row.
pub const BAR_BLEED: f32 = 2.0;

/// The theme metrics a month row's bars depend on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MonthRowMetrics {
    pub row_width: f32,
    /// Theme `month.lane_height` (the old `--lane-height`).
    pub lane_height: f32,
    /// Inset at a bar's real start/end (the old `--month-padding-inline`).
    pub padding_inline: f32,
}

/// The bar for `span` in `lane`, in row-local coordinates. Real ends are inset
/// by the row padding; clipped ends bleed `BAR_BLEED` past the cell edge.
pub fn all_day_bar_rect(span: &AllDaySpan, lane: usize, metrics: &MonthRowMetrics) -> Rect {
    let column_width = metrics.row_width / DAYS_PER_WEEK as f32;
    let edge_inset = |real_end: bool| {
        if real_end {
            metrics.padding_inline
        } else {
            -BAR_BLEED
        }
    };
    let top = metrics.lane_height * lane as f32;
    Rect {
        left: column_width * span.start_col as f32 + edge_inset(span.is_start),
        top,
        right: column_width * span.end_col as f32 - edge_inset(span.is_end),
        bottom: top + metrics.lane_height - LANE_GAP,
    }
}

/// Height a day cell reserves above its timed events for `lanes` bars (the last
/// bar's gap is dropped); `None` when there are none.
pub fn reserved_all_day_height(lanes: usize, lane_height: f32) -> Option<f32> {
    (lanes > 0).then_some(lane_height * lanes as f32 - LANE_GAP)
}
