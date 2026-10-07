//! Settings › Themes (port of `ThemesPage.tsx`): the theme mode, the slot
//! being picked (single, or the dark / light pair while syncing), a grid of
//! themes with previews, and the problems found in user theme files.
//!
//! Previews paint a cropped window (minical and week) from each theme's own
//! resolved tokens, so they look the same whether the theme is active or not
//! (GPUI_PORT_PLAN.md §6.6).

use std::collections::HashMap;
use std::sync::Arc;

use gpui_kit::component::tab::{Tab, TabBar};
use gpui_kit::component::{h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    BoxShadow, Context, Div, Hsla, InteractiveElement, IntoElement, ParentElement, Render,
    SharedString, StatefulInteractiveElement, Styled, Window, div, point, px, relative,
};
use rencal_config::ThemeMode;
use rencal_theme::{Appearance, ResolvedTheme, resolve_theme};

use super::controls::{SelectOption, content, field, select};
use crate::settings::Settings;
use crate::theme::ThemeStore;
use crate::theme::selection::{ThemeDescriptor, ThemeSlot, themes_for, with_slot};
use crate::ui::event_paint::paint_for_accent;
use crate::ui::{color, muted_text, radius, radius_circle, text_size};

pub struct ThemesPage {
    /// Which of the pair the grid edits while syncing; browsing never
    /// changes the theme.
    pair_slot: Appearance,
    /// Resolved previews by theme id, dropped whenever the themes change.
    previews: HashMap<String, Option<Arc<ResolvedTheme>>>,
}

impl ThemesPage {
    pub fn new(cx: &mut Context<Self>) -> Self {
        cx.observe_global::<Settings>(|_, cx| cx.notify()).detach();
        cx.observe_global::<ThemeStore>(|this, cx| {
            this.previews.clear();
            cx.notify();
        })
        .detach();
        Self {
            pair_slot: Appearance::Dark,
            previews: HashMap::new(),
        }
    }

    fn preview_theme(&mut self, id: &str, cx: &Context<Self>) -> Option<Arc<ResolvedTheme>> {
        self.previews
            .entry(id.to_owned())
            .or_insert_with(|| {
                let theme = ThemeStore::global(cx).theme(id)?;
                resolve_theme(&theme).ok().map(Arc::new)
            })
            .clone()
    }

    fn tile(
        &mut self,
        theme: &ResolvedTheme,
        descriptor: &ThemeDescriptor,
        slot: ThemeSlot,
        active: bool,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let preview = self.preview_theme(&descriptor.id, cx);
        let id = descriptor.id.clone();
        let (primary, border, muted, text) = (
            color(theme, "primary"),
            color(theme, "border"),
            color(theme, "text.muted"),
            color(theme, "text"),
        );
        let group = SharedString::from(format!("theme-tile:{}", descriptor.id));
        v_flex()
            .id(SharedString::from(format!("theme:{}", descriptor.id)))
            .group(group.clone())
            .w_full()
            .min_w_0()
            .child(
                div()
                    .relative()
                    .h(px(112.))
                    .overflow_hidden()
                    .rounded(radius(theme, 1.4))
                    .border_1()
                    .map(|this| {
                        if active {
                            // `border-primary ring-1 ring-primary`
                            this.border_color(primary).shadow(vec![BoxShadow {
                                color: primary,
                                offset: point(px(0.), px(0.)),
                                blur_radius: px(0.),
                                spread_radius: px(1.),
                                inset: false,
                            }])
                        } else {
                            this.border_color(border)
                                .group_hover(group.clone(), move |style| style.border_color(muted))
                        }
                    })
                    .children(preview.map(|preview| preview_window(&preview))),
            )
            .child(
                div()
                    .pt_2()
                    .w_full()
                    .truncate()
                    .text_center()
                    .text_size(text_size(theme, "sm"))
                    .map(|this| {
                        if active {
                            this.text_color(text)
                        } else {
                            this.text_color(muted)
                                .group_hover(group, move |style| style.text_color(text))
                        }
                    })
                    .child(SharedString::from(descriptor.name.clone())),
            )
            .on_click(move |_, _, cx| {
                let next = with_slot(&Settings::global(cx).rencal.theme, slot, &id);
                Settings::update_rencal(cx, move |config| config.theme = next.clone());
            })
    }
}

impl Render for ThemesPage {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let settings = Settings::global(cx).rencal.theme.clone();
        let store = ThemeStore::global(cx);
        let on_omarchy = store.on_omarchy();
        let descriptors = store.descriptors();
        let diagnostics: Vec<String> = store
            .diagnostics()
            .iter()
            .map(|d| {
                let file = d.file.file_name().map_or_else(
                    || d.file.display().to_string(),
                    |name| name.to_string_lossy().into_owned(),
                );
                format!("{file}: {}", d.message)
            })
            .collect();
        let syncing = settings.mode == ThemeMode::System;
        let slot = if syncing {
            ThemeSlot::from(self.pair_slot)
        } else {
            ThemeSlot::Single
        };
        let selected = crate::theme::selection::slot(&settings, slot).to_owned();
        // Independent of the selection, so picking a theme never reshuffles
        // the grid.
        let slot_themes: Vec<ThemeDescriptor> = themes_for(slot, &descriptors)
            .into_iter()
            .cloned()
            .collect();
        let tiles: Vec<_> = slot_themes
            .iter()
            .map(|descriptor| {
                let active = descriptor.id == selected;
                self.tile(&theme, descriptor, slot, active, cx)
            })
            .collect();

        content("themes-page")
            .child(field(&theme, "Theme mode", px(180.)).child(select(
                "theme-mode",
                &theme,
                vec![
                    SelectOption::new("Single theme", !syncing, |_, cx| {
                        Settings::update_rencal(cx, |config| config.theme.mode = ThemeMode::Single)
                    }),
                    SelectOption::new("Sync with system", syncing, |_, cx| {
                        Settings::update_rencal(cx, |config| config.theme.mode = ThemeMode::System)
                    }),
                ],
            )))
            .map(|this| {
                if syncing && on_omarchy {
                    this.child(muted_text(
                        &theme,
                        "sm",
                        "renCal follows your Omarchy theme.",
                    ))
                } else {
                    this.child(
                        v_flex()
                            .gap_3()
                            .when(syncing, |this| {
                                this.child(
                                    div().child(
                                        TabBar::new("theme-slot")
                                            .segmented()
                                            .selected_index(match self.pair_slot {
                                                Appearance::Dark => 0,
                                                Appearance::Light => 1,
                                            })
                                            .on_click(cx.listener(|this, index: &usize, _, cx| {
                                                this.pair_slot = if *index == 0 {
                                                    Appearance::Dark
                                                } else {
                                                    Appearance::Light
                                                };
                                                cx.notify();
                                            }))
                                            .child(Tab::new().label("Dark theme"))
                                            .child(Tab::new().label("Light theme")),
                                    ),
                                )
                            })
                            .child(
                                div()
                                    .grid()
                                    .grid_cols(3)
                                    .gap_x_3()
                                    .gap_y_4()
                                    .children(tiles),
                            ),
                    )
                }
            })
            .when(!diagnostics.is_empty(), |this| {
                this.child(
                    v_flex()
                        .gap_1()
                        .text_size(text_size(&theme, "sm"))
                        .text_color(color(&theme, "error"))
                        .children(diagnostics.into_iter().map(|line| div().child(line))),
                )
            })
    }
}

// A shortened month whose last two columns are the weekend; today is
// selected, as on launch.
const MINICAL_WEEKS: usize = 4;
const MINICAL_DAYS: usize = 5;
const TODAY: (usize, usize) = (1, 1);

fn is_outside_day(week: usize, day: usize) -> bool {
    (week == 0 && day < 1) || (week == MINICAL_WEEKS - 1 && day > 2)
}

/// Events in the theme's default calendar colour, so `primary` and `event.*`
/// overrides show: (day, top %, height %).
const PREVIEW_EVENTS: [(usize, f32, f32); 4] = [
    (0, 0.20, 0.30),
    (1, 0.40, 0.35),
    (2, 0.10, 0.25),
    (2, 0.50, 0.30),
];

fn preview_window(theme: &ResolvedTheme) -> impl IntoElement + use<> {
    div()
        .absolute()
        .inset_0()
        .pt_4()
        .pl_4()
        .bg(color(theme, "surface.background"))
        .child(
            h_flex()
                .items_start()
                .w(px(260.))
                .h(px(140.))
                .overflow_hidden()
                .rounded_tl(radius(theme, 1.4))
                .bg(color(theme, "background"))
                .shadow(vec![BoxShadow {
                    color: gpui_kit::hsla(0., 0., 0., 0.25),
                    offset: point(px(0.), px(10.)),
                    blur_radius: px(15.),
                    spread_radius: px(-3.),
                    inset: false,
                }])
                .child(minical_preview(theme))
                .child(week_preview(theme)),
        )
}

fn bar(width: f32, height: f32, fill: Hsla, theme: &ResolvedTheme) -> Div {
    div()
        .w(px(width))
        .h(px(height))
        .flex_none()
        .rounded(radius(theme, 0.4))
        .bg(fill)
}

fn today_marker(width: f32, height: f32, mark: (f32, f32), theme: &ResolvedTheme) -> Div {
    div()
        .w(px(width))
        .h(px(height))
        .flex()
        .items_center()
        .justify_center()
        .rounded(radius_circle(theme))
        .bg(color(theme, "today"))
        .child(
            div()
                .w(px(mark.0))
                .h(px(mark.1))
                .bg(color(theme, "today.text")),
        )
}

fn minical_preview(theme: &ResolvedTheme) -> impl IntoElement + use<> {
    let muted = color(theme, "text.muted");
    let faint = muted.opacity(0.4);
    let weeks = (0..MINICAL_WEEKS).map(|week| {
        h_flex()
            .when(week == TODAY.0, |this| {
                this.bg(color(theme, "ghost_element.hover"))
            })
            .children((0..MINICAL_DAYS).map(|day| {
                div()
                    .flex_1()
                    .h(px(12.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .when(day >= MINICAL_DAYS - 2, |this| {
                        this.bg(color(theme, "weekend.background"))
                    })
                    .child(if (week, day) == TODAY {
                        today_marker(12., 12., (4., 4.), theme)
                    } else {
                        div().size(px(4.)).bg(if is_outside_day(week, day) {
                            faint
                        } else {
                            muted
                        })
                    })
            }))
    });
    v_flex()
        .w(px(76.))
        .h_full()
        .flex_none()
        .gap(px(10.))
        .pt(px(10.))
        .border_r_1()
        .border_color(color(theme, "border"))
        .child(
            h_flex()
                .gap_1()
                .px_2()
                .child(bar(24., 6., color(theme, "text"), theme))
                .child(bar(14., 6., color(theme, "brand"), theme)),
        )
        .child(v_flex().px_1().children(weeks))
}

fn week_preview(theme: &ResolvedTheme) -> impl IntoElement + use<> {
    let border = color(theme, "border");
    let weekend = color(theme, "weekend.background");
    let paint = paint_for_accent(theme.color("primary"), theme);
    let is_weekend = |day: usize| day >= 5;
    let header = h_flex()
        .h(px(16.))
        .flex_none()
        .border_b_1()
        .border_color(border)
        .children((0..7).map(|day| {
            h_flex()
                .flex_1()
                .h_full()
                .justify_end()
                .items_center()
                .px_1()
                .border_r_1()
                .border_color(border)
                .map(|this| {
                    if day == TODAY.1 {
                        this.bg(color(theme, "element.selected"))
                    } else if is_weekend(day) {
                        this.bg(weekend)
                    } else {
                        this
                    }
                })
                .child(if day == TODAY.1 {
                    today_marker(12., 10., (6., 2.), theme)
                } else {
                    div().w(px(6.)).h(px(2.)).bg(color(theme, "text.muted"))
                })
        }));
    let today = color(theme, "today");
    let columns = h_flex().flex_1().items_start().children((0..7).map(|day| {
        div()
            .relative()
            .flex_1()
            .h_full()
            .border_r_1()
            .border_color(border)
            .when(is_weekend(day), |this| this.bg(weekend))
            .children(
                PREVIEW_EVENTS
                    .iter()
                    .filter(|(event_day, ..)| *event_day == day)
                    .map(|(_, top, height)| {
                        div()
                            .absolute()
                            .left(px(1.))
                            .right(px(1.))
                            .top(relative(*top))
                            .h(relative(*height))
                            .overflow_hidden()
                            .rounded(radius(theme, 0.4))
                            .bg(paint.fill)
                            .child(
                                div()
                                    .absolute()
                                    .top_0()
                                    .bottom_0()
                                    .left_0()
                                    .w(px(2.))
                                    .bg(paint.color),
                            )
                    }),
            )
            .when(day == TODAY.1, |this| {
                // The dashed current-time line.
                this.child(
                    h_flex()
                        .absolute()
                        .left_0()
                        .right_0()
                        .top(relative(0.3))
                        .h(px(1.))
                        .overflow_hidden()
                        .gap(px(2.))
                        .children((0..8).map(|_| div().w(px(3.)).h(px(1.)).flex_none().bg(today))),
                )
            })
    }));
    v_flex().flex_1().h_full().child(header).child(columns)
}
