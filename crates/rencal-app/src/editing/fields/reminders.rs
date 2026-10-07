//! The reminders field (port of `ReminderSelect.tsx`): a combo offering
//! common offsets, or parsing a typed one ("2h", "3 days", "15" for every
//! unit), above the event's reminders. Values are minutes before the start;
//! negative values (all-day reminders) are minutes after midnight on the day.

use gpui_kit::component::{h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, AppContext, Context, Entity, EventEmitter, InteractiveElement, IntoElement,
    ParentElement, SharedString, Styled, Subscription, Window, div, px,
};
use rencal_time::constants::{DAY_MINUTES, HOUR_MINUTES, MONTH_MINUTES, WEEK_MINUTES};

use super::{ComboEvent, ComboOption, ComboState, Controls, combo, remove_button};
use crate::assets::RenIcon;

pub const DEFAULT_REMINDER_VALUES: [i32; 4] = [0, 10, 30, 60];

const UNITS: [(&[&str], i32); 5] = [
    (&["m", "min", "mins", "minute", "minutes"], 1),
    (&["h", "hr", "hrs", "hour", "hours"], HOUR_MINUTES),
    (&["d", "day", "days"], DAY_MINUTES),
    (&["w", "wk", "wks", "week", "weeks"], WEEK_MINUTES),
    (&["mo", "mon", "month", "months"], MONTH_MINUTES),
];

/// The offsets a typed query stands for (`getQueryValues`): `^(\d+)\s*([a-z]*)`.
pub fn query_values(query: &str) -> Vec<i32> {
    let q = query.trim();
    let digits = q.chars().take_while(char::is_ascii_digit).count();
    let Ok(num) = q[..digits].parse::<i32>() else {
        return Vec::new();
    };
    if num <= 0 {
        return Vec::new();
    }
    let rest = q[digits..].trim_start();
    let letters = rest.chars().take_while(char::is_ascii_alphabetic).count();
    let unit = rest[..letters].to_ascii_lowercase();
    if !unit.is_empty() {
        return UNITS
            .iter()
            .find(|(names, _)| names.contains(&unit.as_str()))
            .map(|(_, factor)| vec![num.saturating_mul(*factor)])
            .unwrap_or_default();
    }
    let mut values = Vec::new();
    for factor in [1, HOUR_MINUTES, DAY_MINUTES, WEEK_MINUTES, MONTH_MINUTES] {
        let value = num.saturating_mul(factor);
        if !values.contains(&value) {
            values.push(value);
        }
    }
    values
}

/// "1 hour, 30 minutes", "At time of event", "On day of event (08:00)".
pub fn human_duration(mins: i32) -> String {
    if mins == 0 {
        return "At time of event".into();
    }
    if mins < 0 {
        let after = -mins;
        return format!("On day of event ({:02}:{:02})", after / 60, after % 60);
    }
    let parts = [
        (mins / MONTH_MINUTES, "month"),
        ((mins % MONTH_MINUTES) / WEEK_MINUTES, "week"),
        ((mins % WEEK_MINUTES) / DAY_MINUTES, "day"),
        ((mins % DAY_MINUTES) / HOUR_MINUTES, "hour"),
        (mins % HOUR_MINUTES, "minute"),
    ];
    parts
        .iter()
        .filter(|(value, _)| *value > 0)
        .map(|(value, unit)| format!("{value} {unit}{}", if *value == 1 { "" } else { "s" }))
        .collect::<Vec<_>>()
        .join(", ")
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReminderEvent {
    Add(i32),
    Remove(i32),
}

pub struct ReminderField {
    combo: Entity<ComboState>,
    query: String,
    /// Settings › Reminders' variant: a bordered input without the bell,
    /// rows not indented under it.
    plain: bool,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<ReminderEvent> for ReminderField {}

impl ReminderField {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        Self::build("Reminders", false, window, cx)
    }

    /// The default reminders field in Settings › Reminders.
    pub fn plain(window: &mut Window, cx: &mut Context<Self>) -> Self {
        Self::build("Add reminder", true, window, cx)
    }

    fn build(placeholder: &str, plain: bool, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let combo = cx.new(|cx| {
            let mut combo = ComboState::new(true, window, cx);
            combo.set_placeholder(placeholder, window, cx);
            combo
        });
        let subscriptions = vec![cx.subscribe_in(&combo, window, Self::on_combo)];
        Self {
            combo,
            query: String::new(),
            plain,
            _subscriptions: subscriptions,
        }
    }

    fn values(&self) -> Vec<i32> {
        if self.query.is_empty() {
            DEFAULT_REMINDER_VALUES.to_vec()
        } else {
            query_values(&self.query)
        }
    }

    fn highlight_first(&mut self, cx: &mut Context<Self>) {
        let first = self
            .values()
            .first()
            .map(|v| SharedString::from(v.to_string()));
        if first.is_some() {
            self.combo
                .update(cx, |combo, cx| combo.set_highlighted(first, cx));
        }
    }

    fn on_combo(
        &mut self,
        _: &Entity<ComboState>,
        event: &ComboEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match event {
            ComboEvent::Opened => self.highlight_first(cx),
            ComboEvent::Query(query) => {
                self.query = query.clone();
                self.highlight_first(cx);
            }
            ComboEvent::Commit { key, .. } => {
                if let Ok(mins) = key.parse() {
                    cx.emit(ReminderEvent::Add(mins));
                }
                self.query.clear();
                self.combo.update(cx, |combo, cx| {
                    combo.set_text("", window, cx);
                    combo.set_open(false, cx);
                });
                self.highlight_first(cx);
            }
            ComboEvent::Closed => {
                self.query.clear();
                self.combo
                    .update(cx, |combo, cx| combo.set_text("", window, cx));
            }
            ComboEvent::Submit | ComboEvent::Blur => {}
        }
        cx.notify();
    }

    pub fn render_field(
        &self,
        reminders: &[i32],
        controls: Controls,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let options = self
            .values()
            .into_iter()
            .map(|mins| ComboOption {
                key: mins.to_string().into(),
                label: duration_label(mins, controls),
                current: false,
            })
            .collect();
        let mut sorted = reminders.to_vec();
        sorted.sort_unstable();
        let entity = cx.entity().downgrade();
        let plain = self.plain;
        let rows: Vec<_> = sorted
            .into_iter()
            .map(|mins| {
                let this = entity.clone();
                controls
                    .row(("reminder", mins as u64), false, false)
                    .h(controls.height)
                    .group("reminder")
                    .hover(move |style| {
                        style
                            .bg(controls.highlight)
                            .text_color(controls.highlight_text)
                    })
                    .when(!plain, |this| this.child(controls.leading(None)))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(duration_label(mins, controls)),
                    )
                    .child(
                        div()
                            .invisible()
                            .group_hover("reminder", |style| style.visible())
                            .child(remove_button(
                                ("remove-reminder", mins as u64),
                                controls,
                                move |_, _, cx| {
                                    this.update(cx, |_, cx| cx.emit(ReminderEvent::Remove(mins)))
                                        .ok();
                                },
                            )),
                    )
            })
            .collect();
        let field = combo(
            "reminders",
            &self.combo,
            controls,
            (!plain).then(|| controls.leading(Some(RenIcon::Bell))),
            None,
            options,
            "No results found.",
            px(200.),
            false,
            window,
            cx,
        );
        v_flex()
            .gap_1()
            .map(|this| {
                if plain {
                    this.child(
                        div()
                            .rounded(controls.radius)
                            .border_1()
                            .border_color(controls.border_input)
                            .child(field),
                    )
                } else {
                    this.child(field)
                }
            })
            .children(rows)
    }
}

fn duration_label(mins: i32, controls: Controls) -> AnyElement {
    h_flex()
        .gap_1p5()
        .items_baseline()
        .child(human_duration(mins))
        .when(mins > 0, |this| {
            this.child(div().text_color(controls.muted).child("before"))
        })
        .into_any_element()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typed_offsets() {
        assert_eq!(query_values("2h"), vec![120]);
        assert_eq!(query_values("3 days"), vec![3 * DAY_MINUTES]);
        assert_eq!(
            query_values("1"),
            vec![1, 60, DAY_MINUTES, WEEK_MINUTES, MONTH_MINUTES]
        );
        assert_eq!(query_values("2 parsecs"), Vec::<i32>::new());
        assert_eq!(query_values("0"), Vec::<i32>::new());
        assert_eq!(query_values("soon"), Vec::<i32>::new());
    }

    #[test]
    fn durations_read_like_the_old_labels() {
        assert_eq!(human_duration(0), "At time of event");
        assert_eq!(human_duration(-480), "On day of event (08:00)");
        assert_eq!(human_duration(90), "1 hour, 30 minutes");
        assert_eq!(
            human_duration(MONTH_MINUTES + DAY_MINUTES),
            "1 month, 1 day"
        );
        assert_eq!(human_duration(10), "10 minutes");
    }
}
