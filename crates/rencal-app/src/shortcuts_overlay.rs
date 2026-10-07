//! The keyboard shortcuts sheet (port of `ShortcutsOverlay.tsx`): every
//! shortcut by group, filterable by label, group or key.

use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::{WindowExt, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    App, AppContext, Context, Entity, FontWeight, InteractiveElement, IntoElement, ParentElement,
    Render, StatefulInteractiveElement, Styled, Subscription, Window, div, px,
};

use crate::keymap::{SHORTCUTS, Shortcut, ShortcutGroup};
use crate::theme::ActiveRenTheme;
use crate::ui::kbd::kbd_group;
use crate::ui::{color, text_size};

pub fn open(window: &mut Window, cx: &mut App) {
    let overlay = cx.new(|cx| ShortcutsOverlay::new(window, cx));
    let input = overlay.read(cx).input.clone();
    window.open_sheet(cx, move |sheet, _, _| {
        sheet
            .title("Keyboard shortcuts")
            .size(px(448.))
            .child(overlay.clone())
    });
    input.update(cx, |input, cx| input.focus(window, cx));
}

/// Whether `shortcut` matches the lowercase, trimmed `query`.
pub fn matches(shortcut: &Shortcut, query: &str) -> bool {
    query.is_empty()
        || shortcut.label.to_lowercase().contains(query)
        || shortcut.group.label().to_lowercase().contains(query)
        || shortcut
            .bindings
            .iter()
            .any(|binding| !binding.hidden && binding.keys.to_lowercase().contains(query))
}

pub struct ShortcutsOverlay {
    input: Entity<InputState>,
    _subscriptions: Vec<Subscription>,
}

impl ShortcutsOverlay {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = cx.new(|cx| InputState::new(window, cx).placeholder("Find keyboard shortcuts"));
        let subscriptions = vec![cx.subscribe(&input, |_, _, event: &InputEvent, cx| {
            if matches!(event, InputEvent::Change) {
                cx.notify();
            }
        })];
        Self {
            input,
            _subscriptions: subscriptions,
        }
    }
}

impl Render for ShortcutsOverlay {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let query = self.input.read(cx).value().trim().to_lowercase();
        let theme = cx.ren_theme();
        let muted = color(theme, "text.muted");
        let text = color(theme, "text");
        let size_sm = text_size(theme, "sm");
        let size_xs = text_size(theme, "xs");
        let shown: Vec<&Shortcut> = SHORTCUTS.iter().filter(|s| matches(s, &query)).collect();

        let groups = ShortcutGroup::ALL.into_iter().filter_map(|group| {
            let rows: Vec<&&Shortcut> = shown.iter().filter(|s| s.group == group).collect();
            (!rows.is_empty()).then(|| {
                v_flex()
                    .gap_2()
                    .child(
                        div()
                            .text_size(size_sm)
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(text)
                            .child(group.label()),
                    )
                    .children(rows.into_iter().map(|shortcut| {
                        let bindings: Vec<_> =
                            shortcut.bindings.iter().filter(|b| !b.hidden).collect();
                        h_flex()
                            .min_h_8()
                            .items_center()
                            .justify_between()
                            .gap_4()
                            .text_size(size_sm)
                            .child(div().text_color(muted).child(shortcut.label))
                            .child(h_flex().flex_shrink_0().items_center().gap_1p5().children(
                                bindings.into_iter().enumerate().map(|(i, binding)| {
                                    h_flex()
                                        .items_center()
                                        .gap_1p5()
                                        .when(i > 0, |this| {
                                            this.child(
                                                div()
                                                    .text_size(size_xs)
                                                    .text_color(muted)
                                                    .child("or"),
                                            )
                                        })
                                        .child(kbd_group(binding.keys, cx))
                                }),
                            ))
                    }))
            })
        });
        let empty = shown.is_empty();

        v_flex()
            .size_full()
            .gap_4()
            .child(Input::new(&self.input))
            .child(
                v_flex()
                    .id("shortcuts-list")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .gap_7()
                    .pb_4()
                    .children(groups)
                    .when(empty, |this| {
                        this.child(
                            div()
                                .py_10()
                                .text_center()
                                .text_size(size_sm)
                                .text_color(muted)
                                .child("No shortcuts found"),
                        )
                    }),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keymap::shortcut;

    #[test]
    fn filters_by_label_group_and_visible_keys() {
        let search = shortcut("search").unwrap();
        assert!(matches(search, ""));
        assert!(matches(search, "sear"));
        assert!(matches(search, "general"));
        assert!(matches(search, "/"));
        // Hidden bindings don't count.
        assert!(!matches(search, "mod+f"));
        assert!(matches(shortcut("settings").unwrap(), "comma"));
    }
}
