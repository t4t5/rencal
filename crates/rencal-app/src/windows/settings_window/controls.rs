//! Building blocks the settings pages share: the scrolling page body
//! (`SettingsContent`), field labels, selects, checkbox rows, the "⋯" menu
//! button and the calendar-coloured checkbox.

use std::rc::Rc;

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::checkbox::Checkbox;
use gpui_kit::component::menu::{DropdownMenu, PopupMenu, PopupMenuItem};
use gpui_kit::component::{Icon, Sizable, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    App, Context, ElementId, Hsla, InteractiveElement, IntoElement, ParentElement, Pixels,
    SharedString, StatefulInteractiveElement, Styled, Window, div, px,
};
use rencal_theme::ResolvedTheme;

use crate::assets::RenIcon;
use crate::ui::{color, metric, radius, text_size};

/// A page's scrolling body (`SettingsContent`: `p-4 flex-col gap-6`).
pub fn content(id: impl Into<ElementId>) -> gpui_kit::Stateful<gpui_kit::Div> {
    v_flex()
        .id(id)
        .flex_1()
        .min_w_0()
        .min_h_0()
        .overflow_y_scroll()
        .p_4()
        .gap_6()
}

/// A field's label (`text-sm`).
pub fn label(theme: &ResolvedTheme, text: &str) -> gpui_kit::Div {
    div()
        .text_size(text_size(theme, "sm"))
        .child(SharedString::from(text.to_owned()))
}

/// A labelled field of `width`.
pub fn field(theme: &ResolvedTheme, title: &str, width: Pixels) -> gpui_kit::Div {
    v_flex().gap_2().w(width).child(label(theme, title))
}

pub type OnPick = Rc<dyn Fn(&mut Window, &mut App)>;

/// One choice of a select.
pub struct SelectOption {
    pub label: SharedString,
    pub selected: bool,
    pub on_pick: OnPick,
}

impl SelectOption {
    pub fn new(
        label: &str,
        selected: bool,
        on_pick: impl Fn(&mut Window, &mut App) + 'static,
    ) -> Self {
        Self {
            label: SharedString::from(label.to_owned()),
            selected,
            on_pick: Rc::new(on_pick),
        }
    }
}

/// A bordered select (`Select` with the default trigger variant): the
/// current choice and a chevron, opening the choices as a menu.
pub fn select(
    id: impl Into<ElementId>,
    theme: &ResolvedTheme,
    options: Vec<SelectOption>,
) -> impl IntoElement {
    let current = options
        .iter()
        .find(|option| option.selected)
        .map(|option| option.label.clone())
        .unwrap_or_default();
    let options = Rc::new(options);
    Button::new(id)
        .ghost()
        .w_full()
        .h(metric(theme, "control.height"))
        .border_1()
        .border_color(color(theme, "border.input"))
        .rounded(radius(theme, 0.8))
        .child(
            h_flex()
                .w_full()
                .justify_between()
                .gap_2()
                .text_size(text_size(theme, "sm"))
                .child(current)
                .child(
                    Icon::new(RenIcon::ChevronDown)
                        .size_4()
                        .text_color(color(theme, "text.muted")),
                ),
        )
        .dropdown_menu(move |menu, _, _| {
            options.iter().fold(menu, |menu, option| {
                let on_pick = option.on_pick.clone();
                menu.item(
                    PopupMenuItem::new(option.label.clone())
                        .checked(option.selected)
                        .on_click(move |_, window, cx| on_pick(window, cx)),
                )
            })
        })
}

/// A checkbox with its label; clicking either toggles it.
pub fn checkbox(
    id: impl Into<ElementId>,
    theme: &ResolvedTheme,
    checked: bool,
    text: &str,
    on_change: impl Fn(bool, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    Checkbox::new(id)
        .checked(checked)
        .label(SharedString::from(text.to_owned()))
        .text_size(text_size(theme, "sm"))
        .on_click(move |checked, window, cx| on_change(*checked, window, cx))
}

/// The "⋯" button opening a menu (`MoreButton` + dropdown).
pub fn more_menu(
    id: impl Into<ElementId>,
    theme: &ResolvedTheme,
    build: impl Fn(PopupMenu, &mut Window, &mut Context<PopupMenu>) -> PopupMenu + 'static,
) -> impl IntoElement {
    Button::new(id)
        .ghost()
        .xsmall()
        .icon(Icon::new(RenIcon::MoreHoriz).text_color(color(theme, "text.muted")))
        .dropdown_menu_with_anchor(gpui_kit::Anchor::TopRight, build)
}

/// A checkbox filled with a calendar's colour when checked (the calendar
/// lists' `--calendar-color` checkbox).
pub fn color_checkbox(
    id: impl Into<ElementId>,
    theme: &ResolvedTheme,
    checked: bool,
    fill: Hsla,
    on_click: impl Fn(&mut Window, &mut App) + 'static,
) -> impl IntoElement {
    let border = color(theme, "border.input");
    let id = id.into();
    let selector = id.to_string();
    div()
        .id(id)
        .debug_selector(move || selector)
        .flex_none()
        .size(px(16.))
        .rounded(radius(theme, 0.4))
        .border_1()
        .flex()
        .items_center()
        .justify_center()
        .map(|this| {
            if checked {
                this.bg(fill).border_color(fill).child(
                    Icon::new(RenIcon::Check)
                        .size(px(12.))
                        .text_color(gpui_kit::white()),
                )
            } else {
                this.border_color(border)
            }
        })
        .on_click(move |_, window, cx| on_click(window, cx))
}
