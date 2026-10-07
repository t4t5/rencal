//! The time field (port of `TimeInput.tsx`): a combo of 15-minute slots that
//! honours the 12h/24h setting. Typing narrows the list ("15:30", "3:30pm",
//! "3pm", "3" for that hour's quarters; in 12h mode an hour without am/pm
//! offers both). Enter on an untouched field keeps an off-grid time (09:07
//! isn't snapped to 09:00).

use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    App, AppContext, Context, Div, Entity, EventEmitter, IntoElement, ParentElement, SharedString,
    Styled, Subscription, Window, div, px,
};
use rencal_time::TimeFormat;
use rencal_time::display::format_wallclock_time;

use super::{ComboEvent, ComboOption, ComboState, Controls, combo};

/// A wallclock time of day.
pub type TimeOfDay = (u32, u32);

const SLOT_MINUTES: [u32; 4] = [0, 15, 30, 45];
const LAST_SLOT: u32 = 23 * 60 + 45;

fn quarter_slots(hour: u32) -> impl Iterator<Item = TimeOfDay> {
    SLOT_MINUTES.into_iter().map(move |minute| (hour, minute))
}

pub fn slot_key((hour, minute): TimeOfDay) -> SharedString {
    format!("{hour:02}:{minute:02}").into()
}

fn parse_key(key: &str) -> Option<TimeOfDay> {
    let (hour, minute) = key.split_once(':')?;
    Some((hour.parse().ok()?, minute.parse().ok()?))
}

/// The 15-minute slot closest to a time, so an off-grid time still has a row
/// to highlight (09:07 → 09:00).
pub fn nearest_slot_key(hour: u32, minute: u32) -> SharedString {
    let total = hour * 60 + minute;
    let minutes = (((f64::from(total) / 15.0).round() as u32) * 15).min(LAST_SLOT);
    slot_key((minutes / 60, minutes % 60))
}

/// Candidate times for a typed query (`getTimeOptions`). Empty → every slot.
pub fn time_options(query: &str, format: TimeFormat) -> Vec<TimeOfDay> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return (0..24).flat_map(quarter_slots).collect();
    }
    let Some((raw_hour, minute, period)) = parse_query(&q) else {
        return Vec::new();
    };
    let has_minute = minute.is_some();
    let minute = minute.unwrap_or(0);
    if minute > 59 {
        return Vec::new();
    }
    if let Some(period) = period {
        if !(1..=12).contains(&raw_hour) {
            return Vec::new();
        }
        let hour = match (period, raw_hour) {
            ('p', 12) => 12,
            ('p', hour) => hour + 12,
            (_, 12) => 0,
            (_, hour) => hour,
        };
        return if has_minute {
            vec![(hour, minute)]
        } else {
            quarter_slots(hour).collect()
        };
    }
    if raw_hour > 23 {
        return Vec::new();
    }
    // No am/pm: in 12h mode an hour up to 12 could be either.
    if format == TimeFormat::H12 && (1..=12).contains(&raw_hour) {
        let am = if raw_hour == 12 { 0 } else { raw_hour };
        let pm = if raw_hour == 12 { 12 } else { raw_hour + 12 };
        return if has_minute {
            vec![(am, minute), (pm, minute)]
        } else {
            quarter_slots(am).chain(quarter_slots(pm)).collect()
        };
    }
    if has_minute {
        vec![(raw_hour, minute)]
    } else {
        quarter_slots(raw_hour).collect()
    }
}

/// `^(\d{1,2})(?::(\d{1,2}))?\s*(am?|pm?)?$` → (hour, minute, 'a' | 'p').
fn parse_query(q: &str) -> Option<(u32, Option<u32>, Option<char>)> {
    let digits = |s: &str| s.chars().take_while(char::is_ascii_digit).count();
    let hour_len = digits(q);
    if !(1..=2).contains(&hour_len) {
        return None;
    }
    let hour = q[..hour_len].parse().ok()?;
    let mut rest = &q[hour_len..];
    let mut minute = None;
    if let Some(after) = rest.strip_prefix(':') {
        let len = digits(after);
        if !(1..=2).contains(&len) {
            return None;
        }
        minute = Some(after[..len].parse().ok()?);
        rest = &after[len..];
    }
    let rest = rest.trim_start();
    let period = match rest {
        "" => None,
        "a" | "am" => Some('a'),
        "p" | "pm" => Some('p'),
        _ => return None,
    };
    Some((hour, minute, period))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TimeChanged(pub TimeOfDay);

pub struct TimeField {
    combo: Entity<ComboState>,
    /// `None` shows an empty field (an all-day event with no remembered time).
    value: Option<TimeOfDay>,
    format: TimeFormat,
    query: String,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<TimeChanged> for TimeField {}

impl TimeField {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let combo = cx.new(|cx| ComboState::new(true, window, cx));
        let subscriptions = vec![cx.subscribe_in(&combo, window, Self::on_combo)];
        Self {
            combo,
            value: None,
            format: TimeFormat::H24,
            query: String::new(),
            _subscriptions: subscriptions,
        }
    }

    #[cfg(test)]
    pub fn combo(&self) -> &Entity<ComboState> {
        &self.combo
    }

    fn label(&self) -> String {
        self.value
            .map(|(hour, minute)| format_wallclock_time(hour, minute, self.format))
            .unwrap_or_default()
    }

    fn current_slot(&self) -> Option<SharedString> {
        self.value
            .map(|(hour, minute)| nearest_slot_key(hour, minute))
    }

    /// Shows `value` (from the event) in `format`.
    pub fn set_value(
        &mut self,
        value: Option<TimeOfDay>,
        format: TimeFormat,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.value = value;
        self.format = format;
        let label = self.label();
        let open = self.combo.read(cx).is_open();
        self.combo.update(cx, |combo, cx| {
            combo.set_placeholder(&label, window, cx);
            if !open {
                combo.set_text(&label, window, cx);
            }
        });
    }

    fn on_combo(
        &mut self,
        _: &Entity<ComboState>,
        event: &ComboEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match event {
            ComboEvent::Opened => {
                // Opening shows the query (empty), with the time as its
                // placeholder; opened by typing, the typed text stays.
                let label = self.label();
                let current = self.current_slot();
                self.combo.update(cx, |combo, cx| {
                    if combo.text(cx) == label {
                        combo.set_text("", window, cx);
                    }
                    combo.set_highlighted(current, cx);
                });
                self.query = self.combo.read(cx).text(cx);
            }
            ComboEvent::Closed => {
                self.query.clear();
                let label = self.label();
                self.combo
                    .update(cx, |combo, cx| combo.set_text(&label, window, cx));
            }
            ComboEvent::Query(query) => {
                self.query = query.clone();
                let best = if query.trim().is_empty() {
                    self.current_slot()
                } else {
                    time_options(query, self.format)
                        .first()
                        .copied()
                        .map(slot_key)
                };
                self.combo
                    .update(cx, |combo, cx| combo.set_highlighted(best, cx));
            }
            ComboEvent::Commit { key, keyboard } => {
                // Untouched, Enter only closes: an off-grid time stays.
                let untouched = *keyboard
                    && self.query.trim().is_empty()
                    && Some(key) == self.current_slot().as_ref();
                if !untouched && let Some(time) = parse_key(key) {
                    cx.emit(TimeChanged(time));
                }
                self.combo.update(cx, |combo, cx| combo.set_open(false, cx));
            }
            ComboEvent::Submit | ComboEvent::Blur => {}
        }
        cx.notify();
    }

    /// The field: an optional leading slot, sized to the widest label.
    #[allow(clippy::too_many_arguments)]
    pub fn render_field(
        &self,
        id: &'static str,
        controls: Controls,
        leading: Option<Div>,
        readonly: bool,
        disabled: bool,
        window: &mut Window,
        cx: &mut App,
    ) -> impl IntoElement + use<> {
        let options: Vec<ComboOption> = time_options(&self.query, self.format)
            .into_iter()
            .map(|time| {
                let key = slot_key(time);
                ComboOption {
                    current: Some(&key) == self.current_slot().as_ref(),
                    key,
                    label: format_wallclock_time(time.0, time.1, self.format).into_any_element(),
                }
            })
            .collect();
        let text_width = match self.format {
            TimeFormat::H24 => px(44.),
            TimeFormat::H12 => px(70.),
        };
        let leading_width = if leading.is_some() {
            controls.leading + controls.gap
        } else {
            px(0.)
        };
        div()
            .flex_none()
            .w(text_width + controls.padding_x * 2.0 + leading_width + px(2.))
            .when(disabled, |this| this.opacity(0.5))
            .child(combo(
                id,
                &self.combo,
                controls,
                leading,
                None,
                options,
                "No results found.",
                px(120.),
                readonly || disabled,
                window,
                cx,
            ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn options_follow_the_query() {
        assert_eq!(time_options("", TimeFormat::H24).len(), 96);
        assert_eq!(time_options("15:30", TimeFormat::H24), vec![(15, 30)]);
        assert_eq!(time_options("3:30pm", TimeFormat::H24), vec![(15, 30)]);
        assert_eq!(
            time_options("3pm", TimeFormat::H24),
            vec![(15, 0), (15, 15), (15, 30), (15, 45)]
        );
        assert_eq!(
            time_options("12a", TimeFormat::H24),
            vec![(0, 0), (0, 15), (0, 30), (0, 45)]
        );
        assert_eq!(time_options("14", TimeFormat::H24)[1], (14, 15));
        // 12h without am/pm: both.
        assert_eq!(
            time_options("3:10", TimeFormat::H12),
            vec![(3, 10), (15, 10)]
        );
        assert_eq!(time_options("13pm", TimeFormat::H24), Vec::new());
        assert_eq!(time_options("9:75", TimeFormat::H24), Vec::new());
        assert_eq!(time_options("nine", TimeFormat::H24), Vec::new());
        assert_eq!(time_options("9 pm", TimeFormat::H24).len(), 4);
    }

    #[test]
    fn nearest_slot_rounds_to_a_quarter() {
        assert_eq!(nearest_slot_key(9, 7), "09:00");
        assert_eq!(nearest_slot_key(9, 8), "09:15");
        assert_eq!(nearest_slot_key(23, 59), "23:45");
    }
}
