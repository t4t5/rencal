//! Settings › Reminders (port of `RemindersPage.tsx`): notifications on or
//! off, and the reminders new events start with.

use gpui_kit::component::v_flex;
use gpui_kit::{
    AppContext, Context, Entity, IntoElement, ParentElement, Render, Styled, Window, px,
};

use super::controls::{checkbox, content, label};
use crate::editing::fields::Controls;
use crate::editing::fields::reminders::{ReminderEvent, ReminderField};
use crate::settings::Settings;
use crate::theme::ThemeStore;

pub struct RemindersPage {
    defaults: Entity<ReminderField>,
}

impl RemindersPage {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        cx.observe_global::<Settings>(|_, cx| cx.notify()).detach();
        let defaults = cx.new(|cx| ReminderField::plain(window, cx));
        cx.subscribe(&defaults, |_, _, event, cx| {
            let mut reminders = Settings::global(cx).caldir.default_reminders.clone();
            match *event {
                ReminderEvent::Add(mins) => reminders.push(mins),
                ReminderEvent::Remove(mins) => reminders.retain(|m| *m != mins),
            }
            Settings::set_default_reminders(reminders, cx);
        })
        .detach();
        Self { defaults }
    }
}

impl Render for RemindersPage {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let settings = Settings::global(cx);
        let enabled = settings.rencal.notifications_enabled;
        let reminders = settings.caldir.default_reminders.clone();
        let controls = Controls::new(&theme);
        let field = self.defaults.update(cx, |field, cx| {
            field.render_field(&reminders, controls, window, cx)
        });
        content("reminders-page")
            .child(v_flex().w(px(300.)).child(checkbox(
                "notifications-enabled",
                &theme,
                enabled,
                "Enable notifications",
                |enabled, _, cx| {
                    Settings::update_rencal(cx, move |config| {
                        config.notifications_enabled = enabled
                    })
                },
            )))
            .child(
                v_flex()
                    .gap_2()
                    .w(px(300.))
                    .child(label(&theme, "Default reminders"))
                    .child(field),
            )
    }
}
