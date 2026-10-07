//! The time zone select (port of `TimeZoneSelect.tsx`): the event's zone as
//! "GMT+2 Stockholm", opening a searchable list. Offsets are for the event's
//! date (DST-aware) and only computed while the list is open. City prefix
//! matches come first.

use gpui_kit::component::input::{Input, InputEvent, InputState, MoveDown, MoveUp};
use gpui_kit::component::popover::Popover;
use gpui_kit::component::{Icon, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    Anchor, AppContext, Context, Entity, EventEmitter, InteractiveElement, IntoElement,
    ParentElement, ScrollHandle, SharedString, StatefulInteractiveElement, Styled, Subscription,
    Window, div, px,
};
use rencal_time::tz::{list_time_zones, time_zone_city, time_zone_offset_label};
use rencal_time::{EventTime, Tz};

use super::{ControlTrigger, Controls};
use crate::assets::RenIcon;

#[derive(Clone, Debug, PartialEq)]
pub struct TzOption {
    pub tz: Tz,
    pub city: String,
    pub offset: String,
    search: String,
}

/// Every pickable zone (plus the event's and the viewer's), by city.
pub fn build_options(extra: &[Tz], at: &EventTime, viewer: Tz) -> Vec<TzOption> {
    let mut zones = list_time_zones();
    for tz in extra.iter().rev() {
        if !zones.contains(tz) {
            zones.insert(0, *tz);
        }
    }
    let mut options: Vec<TzOption> = zones
        .into_iter()
        .map(|tz| {
            let city = time_zone_city(tz.name());
            let offset = time_zone_offset_label(tz, at, viewer);
            let region = tz.name().replace(['_', '/'], " ");
            TzOption {
                search: format!("{city} {region} {offset}").to_lowercase(),
                tz,
                city,
                offset,
            }
        })
        .collect();
    options.sort_by_key(|option| option.city.to_lowercase());
    options
}

/// City prefix matches, then any other match.
pub fn filter_options<'a>(options: &'a [TzOption], query: &str) -> Vec<&'a TzOption> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return options.iter().collect();
    }
    let (prefix, other): (Vec<&TzOption>, Vec<&TzOption>) = options
        .iter()
        .filter(|option| option.search.contains(&q) || option.city.to_lowercase().starts_with(&q))
        .partition(|option| option.city.to_lowercase().starts_with(&q));
    prefix.into_iter().chain(other).collect()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TzChanged(pub Tz);

pub struct TzField {
    search: Entity<InputState>,
    open: bool,
    value: Tz,
    at: Option<EventTime>,
    viewer: Tz,
    options: Vec<TzOption>,
    query: String,
    highlighted: Option<Tz>,
    scroll: ScrollHandle,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<TzChanged> for TzField {}

impl TzField {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| InputState::new(window, cx).placeholder("Search timezones"));
        let subscriptions = vec![cx.subscribe_in(&search, window, Self::on_search)];
        Self {
            search,
            open: false,
            value: Tz::UTC,
            at: None,
            viewer: Tz::UTC,
            options: Vec::new(),
            query: String::new(),
            highlighted: None,
            scroll: ScrollHandle::new(),
            _subscriptions: subscriptions,
        }
    }

    pub fn set_value(&mut self, value: Tz, at: EventTime, viewer: Tz) {
        self.value = value;
        self.at = Some(at);
        self.viewer = viewer;
    }

    pub fn set_open(&mut self, open: bool, window: &mut Window, cx: &mut Context<Self>) {
        if open == self.open {
            return;
        }
        self.open = open;
        self.query.clear();
        if open {
            let at = self
                .at
                .clone()
                .unwrap_or(EventTime::Date(chrono::NaiveDate::MIN));
            self.options = build_options(&[self.value, self.viewer], &at, self.viewer);
            self.highlighted = Some(self.value);
            self.search.update(cx, |search, cx| {
                search.set_value("", window, cx);
                search.focus(window, cx);
            });
            self.reveal();
        } else {
            self.options.clear();
        }
        cx.notify();
    }

    fn filtered(&self) -> Vec<&TzOption> {
        filter_options(&self.options, &self.query)
    }

    fn reveal(&self) {
        if let Some(index) = self
            .filtered()
            .iter()
            .position(|option| Some(option.tz) == self.highlighted)
        {
            self.scroll.scroll_to_item(index);
        }
    }

    fn on_search(
        &mut self,
        search: &Entity<InputState>,
        event: &InputEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match event {
            InputEvent::Change => {
                self.query = search.read(cx).value().to_string();
                self.highlighted = if self.query.trim().is_empty() {
                    Some(self.value)
                } else {
                    self.filtered().first().map(|option| option.tz)
                };
                self.reveal();
                cx.notify();
            }
            InputEvent::PressEnter { .. } => {
                if let Some(tz) = self.highlighted {
                    self.commit(tz, window, cx);
                }
            }
            _ => {}
        }
    }

    fn commit(&mut self, tz: Tz, window: &mut Window, cx: &mut Context<Self>) {
        if tz != self.value {
            cx.emit(TzChanged(tz));
        }
        self.set_open(false, window, cx);
    }

    fn move_highlight(&mut self, delta: isize, cx: &mut Context<Self>) {
        let filtered: Vec<Tz> = self.filtered().iter().map(|option| option.tz).collect();
        if filtered.is_empty() {
            return;
        }
        let current = self
            .highlighted
            .and_then(|tz| filtered.iter().position(|t| *t == tz));
        let len = filtered.len() as isize;
        let next = match current {
            Some(index) => (index as isize + delta).rem_euclid(len),
            None => 0,
        };
        self.highlighted = Some(filtered[next as usize]);
        self.reveal();
        cx.notify();
    }

    pub fn render_field(
        &self,
        controls: Controls,
        readonly: bool,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let at = self
            .at
            .clone()
            .unwrap_or(EventTime::Date(chrono::NaiveDate::MIN));
        let label = tz_label(
            time_zone_offset_label(self.value, &at, self.viewer),
            time_zone_city(self.value.name()),
            controls,
        );
        let this = cx.entity().downgrade();
        let rows: Vec<_> = self
            .filtered()
            .into_iter()
            .enumerate()
            .map(|(index, option)| {
                let tz = option.tz;
                let this = this.clone();
                controls
                    .option(("tz-option", index), Some(tz) == self.highlighted)
                    .when(tz == self.value, |this| {
                        this.font_weight(gpui_kit::FontWeight::MEDIUM)
                    })
                    .on_click(move |_, window, cx| {
                        this.update(cx, |this, cx| this.commit(tz, window, cx)).ok();
                    })
                    .child(tz_label(
                        option.offset.clone(),
                        option.city.clone(),
                        controls,
                    ))
            })
            .collect();
        let empty = rows.is_empty();
        let search = self.search.clone();
        let scroll = self.scroll.clone();
        let rows = std::rc::Rc::new(std::cell::RefCell::new(Some(rows)));
        let (up, down) = (this.clone(), this.clone());
        Popover::new("timezone")
            .anchor(Anchor::TopLeft)
            .open(self.open && !readonly)
            .on_open_change({
                let this = this.clone();
                move |open, window, cx| {
                    let open = *open;
                    this.update(cx, |this, cx| this.set_open(open, window, cx))
                        .ok();
                }
            })
            .trigger(
                ControlTrigger::new("timezone-trigger", controls, readonly)
                    .full_width()
                    .child(controls.leading(Some(RenIcon::Globe)))
                    .child(div().flex_1().min_w_0().child(label))
                    .when(!readonly, |this| {
                        this.child(
                            Icon::new(RenIcon::ChevronDown)
                                .size_4()
                                .text_color(controls.muted),
                        )
                    }),
            )
            .content(move |_, _, _| {
                let up = up.clone();
                let down = down.clone();
                v_flex()
                    .w(px(300.))
                    .capture_action(move |_: &MoveUp, _, cx| {
                        up.update(cx, |this, cx| this.move_highlight(-1, cx)).ok();
                    })
                    .capture_action(move |_: &MoveDown, _, cx| {
                        down.update(cx, |this, cx| this.move_highlight(1, cx)).ok();
                    })
                    .child(
                        div()
                            .border_b_1()
                            .border_color(controls.border)
                            .child(Input::new(&search).appearance(false)),
                    )
                    .child(
                        v_flex()
                            .id("timezone-list")
                            .p_1()
                            .max_h(px(300.))
                            .overflow_y_scroll()
                            .track_scroll(&scroll)
                            .children(rows.borrow_mut().take().unwrap_or_default())
                            .when(empty, |this| {
                                this.child(
                                    div()
                                        .px_2()
                                        .py_1p5()
                                        .text_size(controls.text_sm)
                                        .text_color(controls.muted)
                                        .child("No timezones found."),
                                )
                            }),
                    )
            })
    }
}

fn tz_label(offset: String, city: String, controls: Controls) -> impl IntoElement {
    h_flex()
        .min_w_0()
        .items_baseline()
        .gap_1p5()
        .child(
            div()
                .flex_shrink_0()
                .text_color(controls.muted)
                .child(SharedString::from(offset)),
        )
        .child(div().truncate().child(SharedString::from(city)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn city_prefixes_come_first() {
        let at = EventTime::zoned(
            "2026-07-01T12:00:00".parse().unwrap(),
            chrono_tz::Europe::Stockholm,
        );
        let options = build_options(&[], &at, chrono_tz::UTC);
        let stockholm = options
            .iter()
            .find(|o| o.tz == chrono_tz::Europe::Stockholm)
            .unwrap();
        assert_eq!(stockholm.offset, "GMT+2");
        let found = filter_options(&options, "lon");
        assert_eq!(found[0].city, "London");
        // A match inside the name counts too, after the prefix matches.
        let york = filter_options(&options, "york");
        assert_eq!(york[0].city, "New York");
        // Offsets are searchable too.
        let plus_two = filter_options(&options, "gmt+2");
        assert!(
            plus_two
                .iter()
                .any(|o| o.tz == chrono_tz::Europe::Stockholm)
        );
    }
}
