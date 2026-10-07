//! The event editor's inputs (ports of `components/event-parts/inputs/`):
//! shared control styling (`Controls`, the old `control-row` / `ItemMedia`
//! classes) and `ComboState`, the input-as-combobox the time, reminder and
//! attendee fields build on (the old `combo-box.tsx` over cmdk).
//!
//! Controls are "ghost" surfaces like the old ones: no border until hovered,
//! the theme's `control.active.*` paint while focused or open.

pub mod attendees;
pub mod date;
pub mod reminders;
pub mod time;
pub mod timezone;

use gpui_kit::component::input::{Escape, Input, InputEvent, InputState, MoveDown, MoveUp};
use gpui_kit::component::{Icon, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, App, AppContext, Bounds, BoxShadow, Context, Div, ElementId, EventEmitter,
    FocusHandle, Focusable, Hsla, InteractiveElement, IntoElement, MouseButton, ParentElement,
    Pixels, ScrollHandle, SharedString, StatefulInteractiveElement, Styled, Subscription, Window,
    anchored, canvas, deferred, div, point, px,
};
use rencal_theme::ResolvedTheme;

use crate::assets::RenIcon;
use crate::ui::{color, metric, radius, text_size};

/// Theme values the editor's controls share, read once per render.
#[derive(Clone, Copy, Debug)]
pub struct Controls {
    pub height: Pixels,
    pub padding_x: Pixels,
    pub gap: Pixels,
    pub row_gap: Pixels,
    pub leading: Pixels,
    pub radius: Pixels,
    pub text: Hsla,
    pub muted: Hsla,
    pub placeholder: Hsla,
    pub border: Hsla,
    pub border_input: Hsla,
    pub active_background: Hsla,
    pub active_border: Hsla,
    pub highlight: Hsla,
    pub highlight_text: Hsla,
    pub popover: Hsla,
    pub popover_text: Hsla,
    pub text_sm: Pixels,
    pub text_xs: Pixels,
}

impl Controls {
    pub fn new(theme: &ResolvedTheme) -> Self {
        Self {
            height: metric(theme, "control.height"),
            padding_x: metric(theme, "control.padding_x"),
            gap: metric(theme, "control.gap"),
            row_gap: metric(theme, "control.row_gap"),
            leading: metric(theme, "control.leading_size"),
            radius: radius(theme, 0.8),
            text: color(theme, "text"),
            muted: color(theme, "text.muted"),
            placeholder: color(theme, "text.placeholder"),
            border: color(theme, "border"),
            border_input: color(theme, "border.input"),
            active_background: color(theme, "control.active.background"),
            active_border: color(theme, "control.active.border"),
            highlight: color(theme, "element.highlight"),
            highlight_text: color(theme, "element.highlight.text"),
            popover: color(theme, "elevated_surface.background"),
            popover_text: color(theme, "elevated_surface.text"),
            text_sm: text_size(theme, "sm"),
            text_xs: text_size(theme, "xs"),
        }
    }

    /// A ghost control surface (`control-row` + `controlSurfaceActive`):
    /// bordered on hover, painted with the active tokens while `active`.
    pub fn row(
        &self,
        id: impl Into<ElementId>,
        active: bool,
        editable: bool,
    ) -> gpui_kit::Stateful<Div> {
        let border_input = self.border_input;
        h_flex()
            .id(id)
            .min_w_0()
            .min_h(self.height)
            .items_center()
            .gap(self.gap)
            .px(self.padding_x)
            .rounded(self.radius)
            .border_1()
            .text_size(self.text_sm)
            .map(|this| {
                if active {
                    this.bg(self.active_background)
                        .border_color(self.active_border)
                } else {
                    this.border_color(gpui_kit::transparent_black())
                        .when(editable, |this| {
                            this.hover(move |style| style.border_color(border_input))
                        })
                }
            })
    }

    /// The leading icon slot (`ItemMedia`): muted, `control.leading_size`.
    pub fn leading(&self, icon: Option<RenIcon>) -> Div {
        div()
            .flex()
            .flex_none()
            .w(self.leading)
            .items_center()
            .justify_center()
            .text_color(self.muted)
            .children(icon.map(|icon| Icon::new(icon).size(self.leading)))
    }

    /// The floating list surface of combos and selects.
    pub fn popup(&self) -> Div {
        v_flex()
            .p_1()
            .bg(self.popover)
            .text_color(self.popover_text)
            .border_1()
            .border_color(self.border)
            .rounded(self.radius)
            .shadow(vec![BoxShadow {
                color: gpui_kit::hsla(0., 0., 0., 0.18),
                offset: point(px(0.), px(4.)),
                blur_radius: px(12.),
                spread_radius: px(0.),
                inset: false,
            }])
    }

    /// One row of a popup list.
    pub fn option(&self, id: impl Into<ElementId>, highlighted: bool) -> gpui_kit::Stateful<Div> {
        let (highlight, highlight_text) = (self.highlight, self.highlight_text);
        h_flex()
            .id(id)
            .px_2()
            .py_1p5()
            .gap_2()
            .rounded(self.radius)
            .text_size(self.text_sm)
            .when(highlighted, |this| {
                this.bg(highlight).text_color(highlight_text)
            })
            .hover(move |style| style.bg(highlight).text_color(highlight_text))
    }
}

/// A ghost control that opens a popover (a date, a time zone, a select).
/// The trigger of a gpui-kit `Popover`, which marks it open while it is.
#[derive(IntoElement)]
pub struct ControlTrigger {
    id: ElementId,
    controls: Controls,
    open: bool,
    readonly: bool,
    children: Vec<AnyElement>,
    full_width: bool,
}

impl ControlTrigger {
    pub fn new(id: impl Into<ElementId>, controls: Controls, readonly: bool) -> Self {
        Self {
            id: id.into(),
            controls,
            open: false,
            readonly,
            children: Vec::new(),
            full_width: false,
        }
    }

    pub fn full_width(mut self) -> Self {
        self.full_width = true;
        self
    }
}

impl ParentElement for ControlTrigger {
    fn extend(&mut self, elements: impl IntoIterator<Item = AnyElement>) {
        self.children.extend(elements);
    }
}

impl gpui_kit::component::Selectable for ControlTrigger {
    fn selected(mut self, selected: bool) -> Self {
        self.open = selected;
        self
    }

    fn is_selected(&self) -> bool {
        self.open
    }
}

impl gpui_kit::RenderOnce for ControlTrigger {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        self.controls
            .row(self.id, self.open, !self.readonly)
            .h(self.controls.height)
            .when(self.full_width, |this| this.w_full())
            .whitespace_nowrap()
            .children(self.children)
    }
}

/// What a combo tells its owner.
#[derive(Clone, Debug, PartialEq)]
pub enum ComboEvent {
    Opened,
    Closed,
    /// The text changed (typing, not `set_text`).
    Query(String),
    /// An option was picked: Enter on the highlight (`keyboard`) or a click.
    Commit {
        key: SharedString,
        keyboard: bool,
    },
    /// Enter with no option highlighted.
    Submit,
    /// The input lost focus.
    Blur,
}

/// An input with a dropdown list of options (the old `Combobox`). The owner
/// computes the options from the query on render and passes them to
/// `ComboList`; the state keeps the open flag, the highlighted option and the
/// keyboard handling (Up/Down move, Enter commits, Escape closes).
pub struct ComboState {
    pub input: gpui_kit::Entity<InputState>,
    open: bool,
    /// Opens when the input gains focus (time, reminders); otherwise the
    /// owner opens it (attendee suggestions).
    open_on_focus: bool,
    highlighted: Option<SharedString>,
    /// The option keys as last rendered, for keyboard movement.
    keys: Vec<SharedString>,
    bounds: Bounds<Pixels>,
    scroll: ScrollHandle,
    /// Text set by the owner, so its Change event isn't taken for typing.
    programmatic: bool,
    /// Scroll the highlight into view once the options are rendered.
    reveal_pending: bool,
    /// Frames the list has been shown; GPUI drops a scroll request made on
    /// a scroll container's first frame.
    shown_frames: u8,
    placeholder: String,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<ComboEvent> for ComboState {}

impl ComboState {
    pub fn new(open_on_focus: bool, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = cx.new(|cx| InputState::new(window, cx));
        // The frame's handle (what a click focuses), not the one the input's
        // own Focus / Blur events follow.
        let focus = input.read(cx).focus_handle(cx);
        let subscriptions = vec![
            cx.subscribe_in(&input, window, Self::on_input),
            cx.on_focus(&focus, window, |this, _, cx| {
                if this.open_on_focus {
                    this.set_open(true, cx);
                }
            }),
            cx.on_blur(&focus, window, |this, _, cx| {
                // A click on an option commits on mouse down, before the blur.
                this.set_open(false, cx);
                cx.emit(ComboEvent::Blur);
            }),
        ];
        Self {
            input,
            open: false,
            open_on_focus,
            highlighted: None,
            keys: Vec::new(),
            bounds: Bounds::default(),
            scroll: ScrollHandle::new(),
            programmatic: false,
            reveal_pending: false,
            shown_frames: 0,
            placeholder: String::new(),
            _subscriptions: subscriptions,
        }
    }

    fn on_input(
        &mut self,
        input: &gpui_kit::Entity<InputState>,
        event: &InputEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match event {
            InputEvent::Change => {
                if self.programmatic {
                    return;
                }
                let text = input.read(cx).value().to_string();
                if !self.open && self.open_on_focus {
                    self.set_open(true, cx);
                }
                cx.emit(ComboEvent::Query(text));
            }
            InputEvent::PressEnter { .. } => match self.highlighted.clone().filter(|_| self.open) {
                Some(key) => cx.emit(ComboEvent::Commit {
                    key,
                    keyboard: true,
                }),
                None => cx.emit(ComboEvent::Submit),
            },
            InputEvent::Focus | InputEvent::Blur => {}
        }
        let _ = window;
    }

    pub fn is_open(&self) -> bool {
        self.open
    }

    pub fn set_open(&mut self, open: bool, cx: &mut Context<Self>) {
        if self.open != open {
            self.open = open;
            self.reveal_pending |= open;
            cx.emit(if open {
                ComboEvent::Opened
            } else {
                ComboEvent::Closed
            });
            cx.notify();
        }
    }

    /// The input row's bounds last frame.
    #[cfg(test)]
    pub fn bounds(&self) -> Bounds<Pixels> {
        self.bounds
    }

    #[cfg(test)]
    pub fn scroll_offset(&self) -> gpui_kit::Point<Pixels> {
        self.scroll.offset()
    }

    #[cfg(test)]
    pub fn highlighted(&self) -> Option<&SharedString> {
        self.highlighted.as_ref()
    }

    /// Highlights `key` and scrolls it into view.
    pub fn set_highlighted(&mut self, key: Option<SharedString>, cx: &mut Context<Self>) {
        if self.highlighted != key {
            self.highlighted = key;
            self.reveal_pending = true;
            cx.notify();
        }
    }

    fn reveal(&self) {
        if let Some(index) = self
            .highlighted
            .as_ref()
            .and_then(|key| self.keys.iter().position(|k| k == key))
        {
            self.scroll.scroll_to_item(index);
        }
    }

    /// Replaces the text without reporting it as typing.
    pub fn set_text(&mut self, text: &str, window: &mut Window, cx: &mut Context<Self>) {
        if self.input.read(cx).value() == text {
            return;
        }
        self.programmatic = true;
        self.input
            .update(cx, |input, cx| input.set_value(text.to_owned(), window, cx));
        self.programmatic = false;
    }

    pub fn text(&self, cx: &App) -> String {
        self.input.read(cx).value().to_string()
    }

    pub fn set_placeholder(&mut self, text: &str, window: &mut Window, cx: &mut Context<Self>) {
        if self.placeholder != text {
            self.placeholder = text.to_owned();
            let text = SharedString::from(text.to_owned());
            self.input
                .update(cx, |input, cx| input.set_placeholder(text, window, cx));
        }
    }

    pub fn is_focused(&self, window: &Window, cx: &App) -> bool {
        self.input.read(cx).focus_handle(cx).is_focused(window)
    }

    fn move_highlight(&mut self, delta: isize, cx: &mut Context<Self>) {
        if self.keys.is_empty() {
            return;
        }
        let current = self
            .highlighted
            .as_ref()
            .and_then(|key| self.keys.iter().position(|k| k == key));
        let len = self.keys.len() as isize;
        let next = match current {
            Some(index) => (index as isize + delta).rem_euclid(len),
            None if delta > 0 => 0,
            None => len - 1,
        };
        self.set_highlighted(Some(self.keys[next as usize].clone()), cx);
    }

    fn set_keys(&mut self, keys: Vec<SharedString>, cx: &mut Context<Self>) {
        self.keys = keys;
        if !self.open {
            self.shown_frames = 0;
            return;
        }
        self.shown_frames = self.shown_frames.saturating_add(1);
        if self.reveal_pending {
            if self.shown_frames > 1 {
                self.reveal_pending = false;
                self.reveal();
            } else {
                cx.notify();
            }
        }
    }
}

impl Focusable for ComboState {
    fn focus_handle(&self, cx: &App) -> FocusHandle {
        self.input.read(cx).focus_handle(cx).clone()
    }
}

/// One option of a combo list.
pub struct ComboOption {
    pub key: SharedString,
    pub label: AnyElement,
    /// The current value (drawn medium).
    pub current: bool,
}

/// A combo's input row and, while open, its list.
#[allow(clippy::too_many_arguments)]
pub fn combo(
    id: impl Into<ElementId> + 'static,
    state: &gpui_kit::Entity<ComboState>,
    controls: Controls,
    leading: Option<Div>,
    trailing: Option<AnyElement>,
    options: Vec<ComboOption>,
    empty: &'static str,
    min_list_width: Pixels,
    readonly: bool,
    window: &mut Window,
    cx: &mut App,
) -> impl IntoElement {
    let id = id.into();
    let (open, highlighted, bounds, scroll, input, focused) = {
        state.update(cx, |state, cx| {
            state.set_keys(options.iter().map(|o| o.key.clone()).collect(), cx);
        });
        let s = state.read(cx);
        (
            s.open && !readonly,
            s.highlighted.clone(),
            s.bounds,
            s.scroll.clone(),
            s.input.clone(),
            s.is_focused(window, cx),
        )
    };
    let weak = state.downgrade();
    let list = open.then(|| {
        let rows = if options.is_empty() {
            vec![
                div()
                    .px_2()
                    .py_1p5()
                    .text_size(controls.text_sm)
                    .text_color(controls.muted)
                    .child(empty)
                    .into_any_element(),
            ]
        } else {
            options
                .into_iter()
                .enumerate()
                .map(|(index, option)| {
                    let key = option.key.clone();
                    let weak = weak.clone();
                    controls
                        .option(
                            ("combo-option", index),
                            highlighted.as_ref() == Some(&option.key),
                        )
                        .when(option.current, |this| {
                            this.font_weight(gpui_kit::FontWeight::MEDIUM)
                        })
                        .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                            // Keep focus in the input; commit before its blur closes the list.
                            window.prevent_default();
                            cx.stop_propagation();
                            let key = key.clone();
                            weak.update(cx, |_, cx| {
                                cx.emit(ComboEvent::Commit {
                                    key,
                                    keyboard: false,
                                })
                            })
                            .ok();
                        })
                        .child(option.label)
                        .into_any_element()
                })
                .collect()
        };
        deferred(
            anchored()
                .position(point(bounds.left(), bounds.bottom() + px(4.)))
                .snap_to_window_with_margin(px(8.))
                .child(
                    controls
                        .popup()
                        .id(ElementId::Name(format!("{id:?}-list").into()))
                        .occlude()
                        .w(bounds.size.width.max(min_list_width))
                        .max_h(px(300.))
                        .overflow_y_scroll()
                        .track_scroll(&scroll)
                        .children(rows),
                ),
        )
        .with_priority(gpui_kit::base::POPUP_PRIORITY)
    });

    let record = state.downgrade();
    controls
        .row(id, focused || open, !readonly)
        .relative()
        .capture_action({
            let weak = state.downgrade();
            move |_: &MoveDown, _, cx| {
                weak.update(cx, |state, cx| {
                    if state.open {
                        state.move_highlight(1, cx);
                    } else {
                        cx.propagate();
                    }
                })
                .ok();
            }
        })
        .capture_action({
            let weak = state.downgrade();
            move |_: &MoveUp, _, cx| {
                weak.update(cx, |state, cx| {
                    if state.open {
                        state.move_highlight(-1, cx);
                    } else {
                        cx.propagate();
                    }
                })
                .ok();
            }
        })
        .capture_action({
            let weak = state.downgrade();
            move |_: &Escape, _, cx| {
                weak.update(cx, |state, cx| {
                    if state.open {
                        state.set_open(false, cx);
                    } else {
                        cx.propagate();
                    }
                })
                .ok();
            }
        })
        .child(
            canvas(
                move |bounds, _, cx| {
                    record
                        .update(cx, |state, cx| {
                            if state.bounds != bounds {
                                state.bounds = bounds;
                                if state.open {
                                    cx.notify();
                                }
                            }
                        })
                        .ok();
                },
                |_, _, _, _| {},
            )
            .absolute()
            .top_0()
            .left_0()
            .size_full(),
        )
        .children(leading)
        .child(
            div().flex_1().min_w_0().child(
                Input::new(&input)
                    .appearance(false)
                    .px_0()
                    .readonly(readonly)
                    .text_size(controls.text_sm),
            ),
        )
        .children(trailing)
        .children(list)
}

/// A small icon button that removes a list entry (`RemoveItemButton`).
pub fn remove_button(
    id: impl Into<ElementId>,
    controls: Controls,
    on_click: impl Fn(&gpui_kit::ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    let text = controls.text;
    div()
        .id(id)
        .flex_none()
        .text_color(controls.muted)
        .hover(move |style| style.text_color(text))
        .on_click(on_click)
        .child(Icon::new(RenIcon::Close).size_4())
}
