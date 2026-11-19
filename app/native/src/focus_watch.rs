//! `<FocusWatch onFocusIn={…} onFocusOut={…}>…</FocusWatch>`: the keyboard
//! focus coming into a subtree and leaving it. TSX's `onFocus` is only the
//! view's own, and NSH gives focus-within to Rust alone
//! (`ElementRef::on_focus_in`); longbridge/nsh#2477 asks for it in TSX.

use nsh_core::prelude::*;

/// The props of [`FocusWatch`].
#[derive(Debug, Clone, PartialEq, Props)]
pub struct FocusWatchProps {
    /// What it watches.
    pub children: Prop<Children>,
}

/// The events of a [`FocusWatch`].
#[derive(Debug, Clone, PartialEq, Event)]
pub enum FocusWatchEvent {
    /// The focus came in from outside, onto a view inside it (an overlay's
    /// content counts as inside the view the overlay is in).
    FocusIn,
    /// The focus left for a view outside it, or for none.
    FocusOut,
}

/// A view that hears the keyboard focus come into its children and leave
/// them; a move between views inside it is neither.
#[component]
pub fn FocusWatch(props: FocusWatchProps, cx: Scope<FocusWatchEvent>) -> impl IntoElement {
    let area = element_ref();
    area.on_focus_in(move || cx.emit(FocusWatchEvent::FocusIn));
    area.on_focus_out(move || cx.emit(FocusWatchEvent::FocusOut));
    view().element_ref(&area).child(props.children)
}
