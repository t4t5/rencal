//! The sidebar compose input (GPUI_PORT_PLAN.md §6.4, §6.5; ports of
//! `ComposeEventButton.tsx`, `ComposeEventInput.tsx`, `MagicSegments.tsx`,
//! `SidebarHeader.tsx` and `FlyAnimation.tsx`).
//!
//! - Collapsed it's a "+" button; `c` or a click expands it into an input
//!   ("Meeting at 3pm") whose text `DraftState` parses. Recognised parts
//!   (time, rule, location) get dashed outlines.
//! - With text, the draft's card opens under the toolbar with the full
//!   editor, and the calendar fades behind the draft.
//! - Enter (or "Add Event") creates the event. The card then flies into the
//!   minical day where the event starts (the fly animation: 650 ms, shrinking
//!   and fading toward the cell) while the section stays open; reduced motion
//!   skips the flight.
//! - Escape clears the text, then leaves; a click outside an empty input
//!   leaves too.

use std::time::Duration;

use gpui_kit::component::input::{Escape, Input, InputEvent, InputState};
use gpui_kit::component::{Icon, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    Animation, AnimationExt, AnyElement, App, AppContext, Bounds, Context, Entity, FontWeight,
    InteractiveElement, IntoElement, ParentElement, Pixels, SharedString,
    StatefulInteractiveElement, Styled, Subscription, Task, Window, anchored, canvas, deferred,
    div, point, px, size,
};
use rencal_text::magic::segment_event_text;
use rencal_time::display::format_time;

use super::draft::DraftState;
use super::form::{EventForm, FormEvent};
use crate::assets::RenIcon;
use crate::clock::Clock;
use crate::settings::Settings;
use crate::theme::ThemeStore;
use crate::ui::anchors::{Anchors, Named, named_anchor};
use crate::ui::{color, metric, radius, text_size};

const FLIGHT_DURATION: Duration = Duration::from_millis(650);
/// The section stays open a little past the flight, so the card settles at
/// the target before the layout collapses.
const FLY_HOLD: Duration = Duration::from_millis(650 + 300);

/// `cubic-bezier(x1, y1, x2, y2)` at progress `t`, like CSS.
pub fn cubic_bezier(x1: f32, y1: f32, x2: f32, y2: f32, t: f32) -> f32 {
    let curve = |a: f32, b: f32, s: f32| {
        let inv = 1.0 - s;
        3.0 * inv * inv * s * a + 3.0 * inv * s * s * b + s * s * s
    };
    // Solve x(s) = t by bisection, then evaluate y(s).
    let (mut lo, mut hi) = (0.0f32, 1.0f32);
    let mut s = t;
    for _ in 0..30 {
        let x = curve(x1, x2, s);
        if (x - t).abs() < 1e-5 {
            break;
        }
        if x < t {
            lo = s;
        } else {
            hi = s;
        }
        s = (lo + hi) / 2.0;
    }
    curve(y1, y2, s)
}

fn flight_easing(t: f32) -> f32 {
    cubic_bezier(0.4, 0.0, 0.2, 1.0, t)
}

/// A card in flight to the minical.
#[derive(Clone, Debug)]
struct Flight {
    from: Bounds<Pixels>,
    to: Bounds<Pixels>,
    title: SharedString,
    time: SharedString,
    /// Distinguishes consecutive flights' animations.
    id: u64,
}

pub struct Compose {
    input: Entity<InputState>,
    form: Option<Entity<EventForm>>,
    flight: Option<Flight>,
    /// The typed text, shown in the input while it flies.
    flying_text: Option<String>,
    /// Holds the section open (and the card hidden) through the flight.
    holding: Option<(Pixels, Task<()>)>,
    row_bounds: Bounds<Pixels>,
    flights: u64,
    /// Text the input is being set to (not typing).
    syncing: bool,
    _subscriptions: Vec<Subscription>,
}

impl Compose {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = cx.new(|cx| InputState::new(window, cx).placeholder("Meeting at 3pm"));
        let draft = DraftState::global(cx);
        let subscriptions = vec![
            cx.subscribe_in(&input, window, Self::on_input),
            cx.observe_in(&draft, window, Self::draft_changed),
        ];
        Self {
            input,
            form: None,
            flight: None,
            flying_text: None,
            holding: None,
            row_bounds: Bounds::default(),
            flights: 0,
            syncing: false,
            _subscriptions: subscriptions,
        }
    }

    fn composing(&self, cx: &App) -> bool {
        DraftState::read(cx).is_composing()
    }

    /// Whether the input is shown (composing, or a card still in flight).
    pub fn is_expanded(&self, cx: &App) -> bool {
        self.composing(cx) || self.holding.is_some()
    }

    fn draft_changed(
        &mut self,
        draft: Entity<DraftState>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let composing = draft.read(cx).is_composing();
        if composing && self.form.is_none() {
            // Started composing: an empty input with focus, and the card's form.
            self.form = Some(cx.new(|cx| EventForm::compose(window, cx)));
            let form = self.form.clone().expect("just set");
            self._subscriptions.push(cx.subscribe_in(
                &form,
                window,
                |this, _, event: &FormEvent, window, cx| {
                    let FormEvent::Done = event;
                    this.create(window, cx);
                },
            ));
            self.set_input_text("", window, cx);
            self.input.update(cx, |input, cx| input.focus(window, cx));
        } else if !composing && self.form.is_some() && self.holding.is_none() {
            self.form = None;
            self.set_input_text("", window, cx);
        }
        // The text clears after a create.
        let text = draft.read(cx).text().to_owned();
        if self.flying_text.is_none() && self.input.read(cx).value() != text {
            self.set_input_text(&text, window, cx);
        }
        cx.notify();
    }

    fn set_input_text(&mut self, text: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.syncing = true;
        let text = text.to_owned();
        self.input
            .update(cx, |input, cx| input.set_value(text, window, cx));
        self.syncing = false;
    }

    fn on_input(
        &mut self,
        input: &Entity<InputState>,
        event: &InputEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match event {
            InputEvent::Change if !self.syncing && self.flying_text.is_none() => {
                let text = input.read(cx).value().to_string();
                DraftState::global(cx).update(cx, |state, cx| state.set_text(text, cx));
            }
            InputEvent::PressEnter { .. } if !DraftState::read(cx).text().is_empty() => {
                self.create(window, cx);
            }
            _ => {}
        }
    }

    /// Escape: clears the text, else leaves.
    fn escape(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if DraftState::read(cx).text().is_empty() {
            self.exit(window, cx);
        } else {
            self.set_input_text("", window, cx);
            DraftState::global(cx).update(cx, |state, cx| state.set_text(String::new(), cx));
        }
    }

    fn exit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        DraftState::global(cx).update(cx, |state, cx| state.stop_composing(cx));
        crate::windows::main_window::focus_calendar(window, cx);
    }

    /// Creates the draft, flying its card to the minical.
    fn create(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let draft_state = DraftState::global(cx);
        draft_state.update(cx, |state, cx| state.flush_parse(cx));
        let draft = draft_state.read(cx).draft().clone();
        if draft.calendar_slug.is_empty() {
            return;
        }
        self.start_flight(&draft, cx);
        draft_state.update(cx, |state, cx| {
            state.create(cx);
            state.stop_composing(cx);
        });
        crate::windows::main_window::focus_calendar(window, cx);
    }

    fn start_flight(&mut self, draft: &rencal_time::CalendarEvent, cx: &mut Context<Self>) {
        let Some(from) = Anchors::named(Named::ComposeCard, cx).filter(|b| b.size.width > px(0.))
        else {
            return;
        };
        let viewer = Clock::global(cx).viewer;
        let date = draft.start.date_in_viewer_zone(viewer);
        let target = Anchors::named(Named::MinicalDay(date), cx)
            .or_else(|| Anchors::named(Named::Minical, cx));
        self.flying_text = Some(DraftState::read(cx).text().to_owned());
        let height = from.size.height;
        self.holding = Some((
            height,
            cx.spawn(async move |this, cx| {
                cx.background_executor().timer(FLY_HOLD).await;
                this.update(cx, |this, cx| {
                    this.holding = None;
                    this.flight = None;
                    this.flying_text = None;
                    if !DraftState::read(cx).is_composing() {
                        this.form = None;
                    }
                    cx.notify();
                })
                .ok();
            }),
        ));
        if cx.reduce_motion() {
            return;
        }
        let Some(to) = target else {
            return;
        };
        let format = Settings::global(cx).time_format();
        self.flights += 1;
        self.flight = Some(Flight {
            from,
            to,
            title: draft.summary.clone().into(),
            time: if draft.start.is_all_day() {
                SharedString::default()
            } else {
                format_time(&draft.start, format, viewer).into()
            },
            id: self.flights,
        });
    }

    fn set_row_bounds(&mut self, bounds: Bounds<Pixels>, cx: &mut Context<Self>) {
        if self.row_bounds != bounds {
            self.row_bounds = bounds;
            cx.notify();
        }
    }

    /// Dashed outlines over the parsed parts of the text.
    fn outlines(&self, text: &str, cx: &App) -> Vec<Bounds<Pixels>> {
        if text.trim().is_empty() {
            return Vec::new();
        }
        let clock = Clock::global(cx);
        let now = clock.now.with_timezone(&clock.viewer).naive_local();
        let input = self.input.read(cx);
        segment_event_text(text, now, clock.viewer)
            .into_iter()
            .filter(|segment| segment.parsed)
            .filter_map(|segment| input.range_to_bounds(&segment.range))
            .collect()
    }

    /// The toolbar part: the "+" button, or the input while composing.
    pub fn render_button(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let theme = ThemeStore::active(cx);
        let height = metric(&theme, "control.height");
        let composing = self.composing(cx);
        let expanded = self.is_expanded(cx);
        if !expanded {
            let hover = color(&theme, "element.hover");
            return div()
                .id("compose-button")
                .flex_none()
                .size(height)
                .flex()
                .items_center()
                .justify_center()
                .rounded(radius(&theme, 0.8))
                .bg(color(&theme, "element.background"))
                .text_color(color(&theme, "element.text"))
                .hover(move |style| style.bg(hover))
                .tooltip(|window, cx| {
                    gpui_kit::component::tooltip::Tooltip::new("Create new event")
                        .action(
                            &crate::keymap::ComposeEvent,
                            Some(crate::actions::CALENDAR_VIEW_CONTEXT),
                        )
                        .build(window, cx)
                })
                .on_click(|_, _, cx| DraftState::start_composing(cx))
                .child(Icon::new(RenIcon::Plus).size_4())
                .into_any_element();
        }

        let text = self
            .flying_text
            .clone()
            .unwrap_or_else(|| DraftState::read(cx).text().to_owned());
        let origin = self.row_bounds.origin;
        let outlines = self.outlines(&text, cx).into_iter().map(|bounds| {
            div()
                .absolute()
                .left(bounds.left() - origin.x - px(2.))
                .top(bounds.top() - origin.y - px(2.))
                .w(bounds.size.width + px(4.))
                .h(bounds.size.height + px(4.))
                .rounded(px(3.))
                .border_1()
                .border_dashed()
                .border_color(color(&theme, "text.muted").opacity(0.4))
        });
        let weak = cx.entity().downgrade();
        let empty = text.is_empty();
        h_flex()
            .id("compose-input")
            .relative()
            .flex_1()
            .min_w_0()
            .h(height)
            .on_mouse_down_out(cx.listener(|this, _, window, cx| {
                // A click outside an empty input leaves compose mode.
                if this.flight.is_none()
                    && DraftState::read(cx).text().is_empty()
                    && this.composing(cx)
                {
                    this.exit(window, cx);
                }
            }))
            .capture_action(cx.listener(|this, _: &Escape, window, cx| this.escape(window, cx)))
            .child(
                canvas(
                    move |bounds, _, cx| {
                        weak.update(cx, |this, cx| this.set_row_bounds(bounds, cx))
                            .ok();
                    },
                    |_, _, _, _| {},
                )
                .absolute()
                .top_0()
                .left_0()
                .size_full(),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(Input::new(&self.input).readonly(!composing).when(
                        !empty && composing,
                        |this| {
                            this.suffix(
                                div()
                                    .id("compose-clear")
                                    .text_color(color(&theme, "text.muted"))
                                    .on_mouse_down(gpui_kit::MouseButton::Left, |_, window, _| {
                                        window.prevent_default()
                                    })
                                    .on_click(cx.listener(|this, _, window, cx| {
                                        this.set_input_text("", window, cx);
                                        DraftState::global(cx).update(cx, |state, cx| {
                                            state.set_text(String::new(), cx)
                                        });
                                        this.input.update(cx, |input, cx| input.focus(window, cx));
                                    }))
                                    .child(Icon::new(RenIcon::Close).size_3p5()),
                            )
                        },
                    )),
            )
            .child(
                div()
                    .absolute()
                    .top_0()
                    .left_0()
                    .size_full()
                    .overflow_hidden()
                    .children(outlines),
            )
            .into_any_element()
    }

    /// The draft card under the toolbar (and the flight), when shown.
    pub fn render_card(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let theme = ThemeStore::active(cx);
        let flight = self
            .flight
            .clone()
            .map(|flight| flight_element(flight, &theme, window));
        if let Some((height, _)) = &self.holding {
            // Hold the space (the card itself is in flight).
            return Some(
                div()
                    .pt_4()
                    .child(div().h(*height))
                    .children(flight)
                    .into_any_element(),
            );
        }
        let draft = DraftState::read(cx);
        if !(draft.is_composing() && !draft.text().is_empty()) {
            return None;
        }
        let form = self.form.clone()?;
        Some(
            div()
                .pt_4()
                .child(
                    v_flex()
                        .relative()
                        .bg(color(&theme, "surface.background"))
                        .text_color(color(&theme, "surface.text"))
                        .border_1()
                        .border_color(color(&theme, "border"))
                        .rounded(radius(&theme, 1.2))
                        .overflow_hidden()
                        .child(named_anchor(Named::ComposeCard))
                        .child(form),
                )
                .into_any_element(),
        )
    }
}

/// The card shrinking into the minical cell.
fn flight_element(
    flight: Flight,
    theme: &rencal_theme::ResolvedTheme,
    window: &mut Window,
) -> AnyElement {
    let Flight {
        from,
        to,
        title,
        time,
        id,
        ..
    } = flight;
    let scale = (f32::from(to.size.width) / f32::from(from.size.width)).max(0.05);
    let from_center = from.center();
    let to_center = to.center();
    let surface = color(theme, "surface.background");
    let border = color(theme, "border");
    let text = color(theme, "surface.text");
    let muted = color(theme, "text.muted");
    let text_sm = text_size(theme, "sm");
    let text_xs = text_size(theme, "xs");
    let corner = radius(theme, 1.2);
    let _ = window;
    deferred(
        anchored()
            .position(point(px(0.), px(0.)))
            .position_mode(gpui_kit::AnchoredPositionMode::Window)
            .child(
                div()
                    .id(("fly", id))
                    .absolute()
                    .overflow_hidden()
                    .bg(surface)
                    .border_1()
                    .border_color(border)
                    .rounded(corner)
                    .p_3()
                    .text_color(text)
                    .child(
                        div()
                            .truncate()
                            .text_size(text_sm)
                            .font_weight(FontWeight::MEDIUM)
                            .child(title),
                    )
                    .child(div().text_size(text_xs).text_color(muted).child(time))
                    .with_animation(
                        ("fly-animation", id),
                        Animation::new(FLIGHT_DURATION).with_easing(flight_easing),
                        move |this, delta| {
                            let factor = 1.0 + (scale - 1.0) * delta;
                            let size = size(from.size.width * factor, from.size.height * factor);
                            let center = point(
                                from_center.x + (to_center.x - from_center.x) * delta,
                                from_center.y + (to_center.y - from_center.y) * delta,
                            );
                            this.left(center.x - size.width / 2.0)
                                .top(center.y - size.height / 2.0)
                                .w(size.width)
                                .h(size.height)
                                .opacity(1.0 - delta)
                        },
                    ),
            ),
    )
    .with_priority(3)
    .into_any_element()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bezier_matches_the_css_curve() {
        assert!((cubic_bezier(0.4, 0.0, 0.2, 1.0, 0.0)).abs() < 1e-4);
        assert!((cubic_bezier(0.4, 0.0, 0.2, 1.0, 1.0) - 1.0).abs() < 1e-4);
        // ease-in-out-ish: slow start, fast middle.
        let quarter = cubic_bezier(0.4, 0.0, 0.2, 1.0, 0.25);
        assert!(quarter > 0.2 && quarter < 0.5, "{quarter}");
        // linear is the identity.
        assert!((cubic_bezier(0.25, 0.25, 0.75, 0.75, 0.3) - 0.3).abs() < 1e-3);
    }
}
