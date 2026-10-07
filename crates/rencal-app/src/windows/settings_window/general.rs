//! Settings › General (port of `GeneralPage.tsx`): time format, first day of
//! the week, week numbers, the caldir data directory, automatic sync and the
//! version. The update check arrives with the updater (Phase 6).

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::{h_flex, v_flex};
use gpui_kit::{
    App, Context, IntoElement, ParentElement, PathPromptOptions, Render, SharedString, Styled,
    Window, div, px,
};
use rencal_config::FirstDayOfWeek;
use rencal_core::caldir::TimeFormat;

use super::controls::{SelectOption, checkbox, content, field, label, select};
use crate::settings::Settings;
use crate::theme::ThemeStore;
use crate::ui::{Role, color, metric, muted_text, radius, text_size};

pub struct GeneralPage;

impl GeneralPage {
    pub fn new(cx: &mut Context<Self>) -> Self {
        cx.observe_global::<Settings>(|_, cx| cx.notify()).detach();
        Self
    }
}

/// Asks for a new data directory (the portal's folder picker on Linux).
fn change_calendar_dir(cx: &mut App) {
    let picked = cx.prompt_for_paths(PathPromptOptions {
        files: false,
        directories: true,
        multiple: false,
        prompt: None,
    });
    cx.spawn(async move |cx| {
        let path = match picked.await {
            Ok(Ok(Some(paths))) => paths.into_iter().next(),
            Ok(Err(err)) => {
                log::error!("could not pick a folder: {err}");
                None
            }
            _ => None,
        };
        if let Some(path) = path {
            cx.update(|cx| Settings::set_calendar_dir(path.to_string_lossy().into_owned(), cx));
        }
    })
    .detach();
}

impl Render for GeneralPage {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let settings = Settings::global(cx).clone();
        let h24 = settings.caldir.time_format == TimeFormat::H24;
        let monday = settings.rencal.first_day_of_week == FirstDayOfWeek::Monday;

        content("general-page")
            .child(field(&theme, "Time format", px(150.)).child(select(
                "time-format",
                &theme,
                vec![
                    SelectOption::new("24h", h24, |_, cx| {
                        Settings::set_time_format(TimeFormat::H24, cx)
                    }),
                    SelectOption::new("12h", !h24, |_, cx| {
                        Settings::set_time_format(TimeFormat::H12, cx)
                    }),
                ],
            )))
            .child(field(&theme, "Start week on", px(150.)).child(select(
                "first-day-of-week",
                &theme,
                vec![
                    SelectOption::new("Monday", monday, |_, cx| {
                        Settings::update_rencal(cx, |config| {
                            config.first_day_of_week = FirstDayOfWeek::Monday
                        })
                    }),
                    SelectOption::new("Sunday", !monday, |_, cx| {
                        Settings::update_rencal(cx, |config| {
                            config.first_day_of_week = FirstDayOfWeek::Sunday
                        })
                    }),
                ],
            )))
            .child(checkbox(
                "show-week-numbers",
                &theme,
                settings.rencal.show_week_numbers,
                "Show week numbers",
                |show, _, cx| {
                    Settings::update_rencal(cx, move |config| config.show_week_numbers = show)
                },
            ))
            .child(
                field(&theme, "Data directory", px(400.)).child(
                    h_flex()
                        .gap_2()
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .h(metric(&theme, "control.height"))
                                .px(metric(&theme, "control.padding_x"))
                                .flex()
                                .items_center()
                                .border_1()
                                .border_color(color(&theme, "border.input"))
                                .rounded(radius(&theme, 0.8))
                                .text_size(text_size(&theme, "sm"))
                                .child(div().truncate().child(SharedString::from(
                                    settings.caldir.calendar_dir.clone(),
                                ))),
                        )
                        .child(
                            Button::new("change-calendar-dir")
                                .secondary()
                                .label(Role::Button.text(&theme, "Change"))
                                .on_click(|_, _, cx| change_calendar_dir(cx)),
                        ),
                ),
            )
            .child(
                v_flex()
                    .gap_1()
                    .w(px(400.))
                    .child(checkbox(
                        "auto-sync",
                        &theme,
                        settings.rencal.auto_sync_enabled,
                        "Automatic sync",
                        |enabled, _, cx| {
                            Settings::update_rencal(cx, move |config| {
                                config.auto_sync_enabled = enabled
                            })
                        },
                    ))
                    .child(
                        muted_text(
                            &theme,
                            "xs",
                            "Uncheck if you prefer to manually push/pull changes.",
                        )
                        .pl_7(),
                    ),
            )
            .child(div().h_px().w_full().bg(color(&theme, "border")))
            .child(
                v_flex()
                    .gap_2()
                    .w(px(400.))
                    .child(label(&theme, "About"))
                    .child(muted_text(
                        &theme,
                        "xs",
                        format!("renCal v{}", env!("CARGO_PKG_VERSION")),
                    )),
            )
    }
}
