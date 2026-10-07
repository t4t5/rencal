//! Settings › Calendars (ports of `CalendarsPage.tsx`, `GroupsColumn.tsx`
//! and `CalendarsColumn.tsx`): the calendar groups on the left; on the
//! right, which calendars the selected group shows, grouped by account, with
//! each calendar's menu (default, rename, colour, delete / disconnect) and
//! "Add subscription".

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::menu::PopupMenuItem;
use gpui_kit::component::{Icon, Sizable, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    App, Context, InteractiveElement, IntoElement, ParentElement, Render, SharedString,
    StatefulInteractiveElement, Styled, Window, div, px,
};
use rencal_theme::ResolvedTheme;
use rencal_time::Calendar;

use super::calendar_dialogs::{
    ColorDialog, DeleteCalendarDialog, NameDialog, NamePrompt, calendar_write,
};
use super::controls::{color_checkbox, content, more_menu};
use super::groups::{
    DEFAULT_GROUP, Groups, create_group, delete_group, display_name, group_calendars,
    group_name_error, group_names, rename_group, set_calendar_enabled,
};
use crate::accounts::connect;
use crate::accounts::providers::{self, Providers};
use crate::assets::RenIcon;
use crate::event_store::EventStore;
use crate::settings::Settings;
use crate::theme::{ThemeStore, hsla};
use crate::ui::event_paint::calendar_accent;
use crate::ui::{Role, color, metric, muted_text, radius, text_size};

pub struct CalendarsPage {
    selected_group: String,
}

impl CalendarsPage {
    pub fn new(cx: &mut Context<Self>) -> Self {
        cx.observe_global::<Settings>(|_, cx| cx.notify()).detach();
        cx.observe_global::<Providers>(|_, cx| cx.notify()).detach();
        let store = EventStore::global(cx);
        cx.observe(&store, |_, _, cx| cx.notify()).detach();
        Providers::load(cx);
        Self {
            selected_group: DEFAULT_GROUP.into(),
        }
    }

    #[cfg(test)]
    pub fn selected_group(&self) -> &str {
        &self.selected_group
    }
}

fn all_slugs(cx: &App) -> Vec<String> {
    EventStore::global(cx)
        .read(cx)
        .calendars()
        .iter()
        .map(|calendar| calendar.slug.clone())
        .collect()
}

fn set_groups(next: Groups, cx: &mut App) {
    Settings::update_rencal(cx, move |config| config.groups = next.clone());
}

fn groups(cx: &App) -> Groups {
    Settings::global(cx).rencal.groups.clone()
}

impl CalendarsPage {
    pub(super) fn open_group_dialog(
        &self,
        editing: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let names = group_names(&groups(cx));
        let initial = editing.clone().unwrap_or_default();
        let page = cx.entity().downgrade();
        let prompt = NamePrompt {
            title: if editing.is_some() {
                "Edit group"
            } else {
                "New group"
            },
            description: "Choose a unique name for this calendar group.",
            placeholder: "Group name",
            initial: initial.clone(),
        };
        NameDialog::open(
            prompt,
            move |name| group_name_error(name, &names, &initial).map(str::to_owned),
            move |name, cx| {
                let all = all_slugs(cx);
                let current = groups(cx);
                let next = match &editing {
                    Some(old) => rename_group(&current, old, &name, &all),
                    None => create_group(&current, &name, &all),
                };
                set_groups(next, cx);
                page.update(cx, |page, cx| {
                    // A new group is selected; a renamed one stays selected.
                    if editing.is_none() || editing.as_deref() == Some(page.selected_group.as_str())
                    {
                        page.selected_group = name;
                        cx.notify();
                    }
                })
                .ok();
                None
            },
            window,
            cx,
        );
    }

    fn groups_column(
        &self,
        theme: &ResolvedTheme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let padding = metric(theme, "layout.padding");
        let names = group_names(&groups(cx));
        let rows = names.into_iter().map(|group| {
            let selected = group == self.selected_group;
            let is_default = group == DEFAULT_GROUP;
            let pick = group.clone();
            let id = SharedString::from(format!("group:{group}"));
            let menu_group = group.clone();
            h_flex()
                .id(id)
                .group("group-row")
                .w_full()
                .h(metric(theme, "control.height"))
                .px_2()
                .gap_2()
                .rounded(radius(theme, 1.0))
                .text_size(text_size(theme, "sm"))
                .map(|this| {
                    if selected {
                        this.bg(color(theme, "element.selected"))
                            .text_color(color(theme, "element.selected.text"))
                    } else {
                        let hover = color(theme, "ghost_element.hover");
                        this.text_color(color(theme, "text.muted"))
                            .hover(move |style| style.bg(hover))
                    }
                })
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .truncate()
                        .child(display_name(&group).to_owned()),
                )
                .when(!is_default, |this| {
                    this.child(
                        div()
                            .invisible()
                            .group_hover("group-row", |style| style.visible())
                            .when(selected, |this| this.visible())
                            .child(more_menu(
                                SharedString::from(format!("group-menu:{group}")),
                                theme,
                                {
                                    let page = cx.entity().downgrade();
                                    move |menu, _, _| {
                                        let edit = menu_group.clone();
                                        let delete = menu_group.clone();
                                        let page_edit = page.clone();
                                        let page_delete = page.clone();
                                        menu.item(PopupMenuItem::new("Edit").on_click(
                                            move |_, window, cx| {
                                                let edit = edit.clone();
                                                page_edit
                                                    .update(cx, |page, cx| {
                                                        page.open_group_dialog(
                                                            Some(edit),
                                                            window,
                                                            cx,
                                                        )
                                                    })
                                                    .ok();
                                            },
                                        ))
                                        .item(
                                            PopupMenuItem::new("Delete").on_click(
                                                move |_, _, cx| {
                                                    set_groups(
                                                        delete_group(&groups(cx), &delete),
                                                        cx,
                                                    );
                                                    page_delete
                                                        .update(cx, |page, cx| {
                                                            if page.selected_group == delete {
                                                                page.selected_group =
                                                                    DEFAULT_GROUP.into();
                                                                cx.notify();
                                                            }
                                                        })
                                                        .ok();
                                                },
                                            ),
                                        )
                                    }
                                },
                            )),
                    )
                })
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.selected_group = pick.clone();
                    cx.notify();
                }))
        });
        v_flex()
            .id("groups-column")
            .w(px(220.))
            .flex_none()
            .h_full()
            .overflow_y_scroll()
            .gap_2()
            .py(px(15.))
            .border_r_1()
            .border_color(color(theme, "border"))
            .child(
                h_flex()
                    .w_full()
                    .justify_between()
                    .px(padding)
                    .child(
                        muted_text(theme, "sm", Role::Heading.text(theme, "Groups"))
                            .when_some(Role::Heading.weight(theme), |this, weight| {
                                this.font_weight(weight)
                            }),
                    )
                    .child(
                        Button::new("new-group")
                            .ghost()
                            .xsmall()
                            .icon(Icon::new(RenIcon::Plus))
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.open_group_dialog(None, window, cx)
                            })),
                    ),
            )
            .child(v_flex().w_full().gap_1().px_2().children(rows))
    }

    fn calendar_row(
        &self,
        calendar: &Calendar,
        enabled: bool,
        is_default: bool,
        theme: &ResolvedTheme,
    ) -> impl IntoElement + use<> {
        let slug = calendar.slug.clone();
        let name = calendar
            .name
            .clone()
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| slug.clone());
        let fill = hsla(calendar_accent(Some(calendar), theme));
        let read_only = calendar.read_only == Some(true);
        let local = calendar.provider.is_none();
        let group = self.selected_group.clone();
        let toggle = {
            let (slug, group) = (slug.clone(), group.clone());
            move |_: &mut Window, cx: &mut App| {
                let next =
                    set_calendar_enabled(&groups(cx), &group, &all_slugs(cx), &slug, !enabled);
                set_groups(next, cx);
            }
        };
        let toggle_label = toggle.clone();
        let menu = {
            let (slug, name) = (slug.clone(), name.clone());
            move |menu: gpui_kit::component::menu::PopupMenu, _: &mut Window, _: &mut Context<_>| {
                let (default_slug, rename_slug, color_slug, delete_slug) =
                    (slug.clone(), slug.clone(), slug.clone(), slug.clone());
                let (rename_name, color_name, delete_name) =
                    (name.clone(), name.clone(), name.clone());
                menu.item(
                    PopupMenuItem::new("Set as default")
                        .disabled(is_default || read_only)
                        .on_click(move |_, _, cx| {
                            Settings::set_default_calendar(Some(default_slug.clone()), cx)
                        }),
                )
                .item(
                    PopupMenuItem::new("Rename calendar").on_click(move |_, window, cx| {
                        let slug = rename_slug.clone();
                        NameDialog::open(
                            NamePrompt {
                                title: "Rename calendar",
                                description: "Choose a new display name for this calendar.",
                                placeholder: "Calendar name",
                                initial: rename_name.clone(),
                            },
                            |name| {
                                name.trim()
                                    .is_empty()
                                    .then(|| "Enter a calendar name.".to_owned())
                            },
                            move |name, cx| {
                                let slug = slug.clone();
                                calendar_write(cx, move |state| {
                                    rencal_core::caldir::rename_calendar(state, slug, name)
                                })
                            },
                            window,
                            cx,
                        );
                    }),
                )
                .item(
                    PopupMenuItem::new("Change calendar color").on_click(move |_, window, cx| {
                        ColorDialog::open(color_slug.clone(), color_name.clone(), fill, window, cx)
                    }),
                )
                .item(
                    PopupMenuItem::new(if local {
                        "Delete calendar"
                    } else {
                        "Disconnect calendar"
                    })
                    .on_click(move |_, window, cx| {
                        DeleteCalendarDialog::open(
                            delete_slug.clone(),
                            delete_name.clone(),
                            local,
                            window,
                            cx,
                        )
                    }),
                )
            }
        };
        h_flex()
            .w_full()
            .min_w_0()
            .gap_3()
            .child(
                h_flex()
                    .flex_1()
                    .min_w_0()
                    .gap_2()
                    .child(color_checkbox(
                        SharedString::from(format!("calendar-{slug}")),
                        theme,
                        enabled,
                        fill,
                        toggle,
                    ))
                    .child(
                        div()
                            .id(SharedString::from(format!("calendar-label-{slug}")))
                            .min_w_0()
                            .truncate()
                            .text_size(text_size(theme, "sm"))
                            .child(name)
                            .on_click(move |_, window, cx| toggle_label(window, cx)),
                    ),
            )
            .when(is_default, |this| {
                this.child(muted_text(theme, "sm", "Default"))
            })
            .child(more_menu(
                SharedString::from(format!("calendar-menu-{slug}")),
                theme,
                menu,
            ))
    }

    fn calendars_column(
        &self,
        theme: &ResolvedTheme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let calendars = EventStore::global(cx).read(cx).calendars().clone();
        let all: Vec<String> = calendars.iter().map(|c| c.slug.clone()).collect();
        let shown = group_calendars(&groups(cx), &self.selected_group, &all);
        let default_calendar = Settings::global(cx).caldir.default_calendar.clone();

        // Accounts in the order their first calendar appears, then local ones.
        let mut sections: Vec<(Option<String>, Vec<&Calendar>)> = Vec::new();
        for calendar in calendars.iter().filter(|c| c.provider.is_some()) {
            match sections
                .iter_mut()
                .find(|(provider, _)| *provider == calendar.provider)
            {
                Some((_, list)) => list.push(calendar),
                None => sections.push((calendar.provider.clone(), vec![calendar])),
            }
        }
        let local: Vec<&Calendar> = calendars.iter().filter(|c| c.provider.is_none()).collect();
        if !local.is_empty() {
            sections.push((None, local));
        }
        let providers = Providers::global(cx).clone();
        let sections: Vec<_> = sections
            .into_iter()
            .map(|(provider, list)| {
                let title = match &provider {
                    Some(slug) => providers::display_name(Some(slug), providers.find(Some(slug))),
                    None => "Local-only".to_owned(),
                };
                let rows: Vec<_> = list
                    .into_iter()
                    .map(|calendar| {
                        let enabled = shown.contains(&calendar.slug);
                        let is_default =
                            default_calendar.as_deref() == Some(calendar.slug.as_str());
                        self.calendar_row(calendar, enabled, is_default, theme)
                    })
                    .collect();
                v_flex()
                    .gap_2()
                    .child(muted_text(theme, "sm", title))
                    .child(v_flex().gap_1().children(rows))
            })
            .collect();

        content("calendars-column")
            .py_5()
            .when(!calendars.is_empty(), |this| {
                this.child(v_flex().gap_4().children(sections))
            })
            .when(calendars.is_empty(), |this| {
                this.child(muted_text(theme, "sm", "No calendars yet."))
            })
            .child(
                h_flex().child(
                    Button::new("add-subscription")
                        .secondary()
                        .icon(Icon::new(RenIcon::Rss))
                        .label(Role::Button.text(theme, "Add subscription"))
                        .on_click(|_, window, cx| connect::open_subscription(window, cx)),
                ),
            )
    }
}

impl Render for CalendarsPage {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // A deleted (or renamed) group falls back to the default one.
        if !group_names(&groups(cx)).contains(&self.selected_group) {
            self.selected_group = DEFAULT_GROUP.into();
        }
        let theme = ThemeStore::active(cx);
        h_flex()
            .size_full()
            .min_w_0()
            .items_start()
            .child(self.groups_column(&theme, cx))
            .child(self.calendars_column(&theme, cx))
    }
}
