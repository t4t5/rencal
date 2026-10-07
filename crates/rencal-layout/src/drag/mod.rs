//! Pointer maths for drag sessions (GPUI_PORT_PLAN.md §6.2). Hit-testing (which
//! day column or cell is under the pointer) belongs to the app; these functions
//! take its result and decide what a drop or a selection means.

mod create;
mod reschedule;

pub use create::{
    CreateSelection, DaySelection, clamp_point_to_rect, day_selection_for_pointer,
    day_selection_range, minutes_at_y, selection_for_pointer, selection_range,
};
pub use reschedule::{
    AUTOSCROLL_EDGE_PX, AUTOSCROLL_MAX_STEP_PX, DRAG_PREVIEW_ID_SUFFIX, DRAG_SNAP_MINUTES,
    DRAG_THRESHOLD_PX, DragGrab, DropHit, DropZone, compute_drop_range, edge_scroll_delta,
    grab_for, make_drag_preview,
};
