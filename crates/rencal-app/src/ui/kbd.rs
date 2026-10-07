//! Key chips (the old `Kbd`/`KbdGroup`): a binding's keys as a row of small
//! labelled boxes, for the shortcuts overlay, the palette and tooltips.

use gpui_kit::component::h_flex;
use gpui_kit::{App, FontWeight, IntoElement, ParentElement, Styled, div, px};

use crate::keymap::key_labels;
use crate::theme::ActiveRenTheme;
use crate::ui::{color, radius, text_size};

pub fn kbd_group(keys: &str, cx: &App) -> impl IntoElement + use<> {
    let theme = cx.ren_theme();
    let background = color(theme, "ghost_element.hover");
    let text = color(theme, "text.muted");
    let size = text_size(theme, "xs");
    let rounded = radius(theme, 0.6);
    h_flex()
        .items_center()
        .gap_1()
        .children(key_labels(keys).into_iter().map(move |label| {
            div()
                .flex()
                .items_center()
                .justify_center()
                .h(px(20.))
                .min_w(px(20.))
                .px_1()
                .rounded(rounded)
                .bg(background)
                .text_color(text)
                .text_size(size)
                .font_weight(FontWeight::MEDIUM)
                .child(label)
        }))
}
