//! The date field (port of `ui/date-picker.tsx`): the date as a short label
//! ("Wed 7 Oct", or "Today") that opens a month calendar.

use chrono::NaiveDate;
use gpui_kit::component::calendar::{Calendar, CalendarEvent, CalendarState, Date};
use gpui_kit::component::popover::Popover;
use gpui_kit::{
    Anchor, AppContext, Context, Div, Entity, EventEmitter, IntoElement, ParentElement,
    Subscription, Window, div,
};
use rencal_time::FirstDayOfWeek;
use rencal_time::display::format_short_date;

use super::{ControlTrigger, Controls};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DateChanged(pub NaiveDate);

pub struct DateField {
    calendar: Entity<CalendarState>,
    value: Option<NaiveDate>,
    open: bool,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<DateChanged> for DateField {}

impl DateField {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let calendar = cx.new(|cx| CalendarState::new(window, cx));
        let subscriptions = vec![cx.subscribe(&calendar, |this: &mut Self, _, event, cx| {
            let CalendarEvent::Selected(Date::Single(Some(date))) = event else {
                return;
            };
            this.open = false;
            cx.emit(DateChanged(*date));
            cx.notify();
        })];
        Self {
            calendar,
            value: None,
            open: false,
            _subscriptions: subscriptions,
        }
    }

    pub fn set_value(&mut self, value: NaiveDate, window: &mut Window, cx: &mut Context<Self>) {
        if self.value != Some(value) {
            self.value = Some(value);
            self.calendar
                .update(cx, |calendar, cx| calendar.set_date(value, window, cx));
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn render_field(
        &self,
        id: &'static str,
        controls: Controls,
        leading: Option<Div>,
        today: NaiveDate,
        first_day: FirstDayOfWeek,
        readonly: bool,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let label = self
            .value
            .map(|date| format_short_date(date, today))
            .unwrap_or_else(|| "Select date".into());
        let this = cx.entity().downgrade();
        let calendar = self.calendar.clone();
        let weekday = match first_day {
            FirstDayOfWeek::Monday => chrono::Weekday::Mon,
            FirstDayOfWeek::Sunday => chrono::Weekday::Sun,
        };
        Popover::new(id)
            .anchor(Anchor::TopLeft)
            .open(self.open && !readonly)
            .on_open_change(move |open, _, cx| {
                let open = *open;
                this.update(cx, |this, cx| {
                    this.open = open;
                    cx.notify();
                })
                .ok();
            })
            .trigger(
                ControlTrigger::new(id, controls, readonly)
                    .children(leading)
                    .child(div().child(label)),
            )
            .content(move |_, _, _| Calendar::new(&calendar).first_day_of_week(weekday))
    }
}
