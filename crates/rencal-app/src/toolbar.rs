//! Toolbar controls shared by the main header and the narrow-window sidebar
//! toolbar (port of `components/toolbar/` and `MainHeader.tsx`): today,
//! settings, invitations, sync status, group switcher, view menu and search.
//! Buttons dispatch the keymap's actions, so their tooltips show the same
//! bindings as the shortcuts overlay.

use gpui_kit::component::button::{Button, ButtonRounded, ButtonVariants};
use gpui_kit::component::menu::DropdownMenu;
use gpui_kit::component::popover::Popover;
use gpui_kit::component::{Icon, Sizable, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    Action, Anchor, App, BorrowAppContext, FontWeight, Global, IntoElement, ParentElement,
    SharedString, Styled, Window, div, px,
};
use rencal_text::calendar_groups::{format_group_name, group_options};
use rencal_time::CalendarEvent;
use rencal_time::display::{format_short_date, format_time};
use rencal_time::event::ResponseStatus;

use crate::actions::CALENDAR_VIEW_CONTEXT;
use crate::assets::RenIcon;
use crate::clock::Clock;
use crate::editing::commands;
use crate::event_store::EventStore;
use crate::keymap::{GoToToday, OpenSettings, Search, SyncNow, ToggleInvites, ToggleSidebar};
use crate::settings::Settings;
use crate::sync_state::{SyncState, SyncStatus};
use crate::theme::ActiveRenTheme;
use crate::ui::{Role, color, text_size};
use crate::ui_state::UiState;
use crate::views::{VIEWS, view_def};

fn dispatch(action: Box<dyn Action>) -> impl Fn(&gpui_kit::ClickEvent, &mut Window, &mut App) {
    move |_, window, cx| window.dispatch_action(action.boxed_clone(), cx)
}

/// A label in the theme's button typography.
pub fn button_label(label: &str, cx: &App) -> SharedString {
    Role::Button.text(cx.ren_theme(), label)
}

pub fn show_sidebar_button() -> impl IntoElement {
    Button::new("show-sidebar")
        .ghost()
        .icon(Icon::new(RenIcon::Sidebar))
        .tooltip_with_action("Show sidebar", &ToggleSidebar, None)
        .on_click(dispatch(Box::new(ToggleSidebar)))
}

pub fn today_button(cx: &App) -> impl IntoElement {
    Button::new("today")
        .secondary()
        .label(button_label("Today", cx))
        .tooltip_with_action("Go to Today", &GoToToday, Some(CALENDAR_VIEW_CONTEXT))
        .on_click(dispatch(Box::new(GoToToday)))
}

pub fn settings_button() -> impl IntoElement {
    Button::new("settings")
        .ghost()
        .icon(Icon::new(RenIcon::Settings))
        .tooltip_with_action("Settings", &OpenSettings, None)
        .on_click(dispatch(Box::new(OpenSettings)))
}

pub fn search_button() -> impl IntoElement {
    Button::new("search")
        .secondary()
        .icon(Icon::new(RenIcon::Search))
        .tooltip_with_action("Search", &Search, Some(CALENDAR_VIEW_CONTEXT))
        .on_click(dispatch(Box::new(Search)))
}

/// Whether the invitations popover is open (one per window; the main header
/// and the narrow sidebar toolbar never show at once).
#[derive(Default)]
pub struct InvitesOpen(pub bool);

impl Global for InvitesOpen {}

/// Pending invitations from today on (today's stay until midnight, even
/// after they've ended).
pub fn upcoming_invites(cx: &App) -> Vec<CalendarEvent> {
    let clock = Clock::global(cx);
    let store = EventStore::global(cx);
    let store = store.read(cx);
    store
        .invites()
        .iter()
        .filter(|invite| invite.start.date_in_viewer_zone(clock.viewer) >= clock.today)
        .cloned()
        .collect()
}

pub fn toggle_invites(cx: &mut App) {
    let open = cx.default_global::<InvitesOpen>().0;
    let has_invites = !upcoming_invites(cx).is_empty();
    cx.update_global::<InvitesOpen, _>(|state, _| state.0 = !open && has_invites);
}

pub fn invites_badge(cx: &mut App) -> Option<impl IntoElement + use<>> {
    let invites = upcoming_invites(cx);
    if invites.is_empty() {
        return None;
    }
    let open = cx.default_global::<InvitesOpen>().0;
    let theme = cx.ren_theme();
    let clock = *Clock::global(cx);
    let time_format = Settings::global(cx).time_format();
    let muted = color(theme, "text.muted");
    let border = color(theme, "border");
    let avatar_text = color(theme, "background");
    let size_sm = text_size(theme, "sm");
    let size_xs = text_size(theme, "xs");
    Some(
        Popover::new("invites")
            .anchor(Anchor::TopLeft)
            .open(open)
            .on_open_change(|open, _, cx| {
                cx.set_global(InvitesOpen(*open));
            })
            .trigger(
                Button::new("invites-badge")
                    .primary()
                    .xsmall()
                    .rounded(ButtonRounded::Size(px(999.)))
                    .label(invites.len().to_string())
                    .tooltip_with_action(
                        "Invitations",
                        &ToggleInvites,
                        Some(CALENDAR_VIEW_CONTEXT),
                    ),
            )
            .content(move |_, _, _| {
                v_flex()
                    .w(px(320.))
                    .child(
                        div()
                            .p_3()
                            .border_b_1()
                            .border_color(border)
                            .font_weight(FontWeight::MEDIUM)
                            .text_size(size_sm)
                            .child("Invitations"),
                    )
                    .children(invites.iter().map(|invite| {
                        let organizer = invite
                            .organizer
                            .as_ref()
                            .map(|o| o.email.clone())
                            .unwrap_or_else(|| "Unknown".into());
                        let name = invite
                            .organizer
                            .as_ref()
                            .and_then(|o| o.name.clone())
                            .unwrap_or_else(|| organizer.clone());
                        let initial = name.chars().next().map(|c| c.to_uppercase().to_string());
                        let date = invite.start.date_in_viewer_zone(clock.viewer);
                        let when = if invite.start.is_all_day() {
                            format_short_date(date, clock.today)
                        } else {
                            format!(
                                "{} {}",
                                format_short_date(date, clock.today),
                                format_time(&invite.start, time_format, clock.viewer)
                            )
                        };
                        let rsvp =
                            |id: &'static str, label: &'static str, response: ResponseStatus| {
                                let invite = invite.clone();
                                Button::new(SharedString::from(format!("{id}:{}", invite.key().0)))
                                    .small()
                                    .label(label)
                                    .on_click(move |_, _, cx| commands::rsvp(&invite, response, cx))
                            };
                        v_flex()
                            .gap_2()
                            .p_3()
                            .border_b_1()
                            .border_color(border)
                            .child(
                                h_flex()
                                    .gap_3()
                                    .child(
                                        div()
                                            .size_8()
                                            .flex_shrink_0()
                                            .flex()
                                            .items_center()
                                            .justify_center()
                                            .rounded_full()
                                            .bg(muted)
                                            .text_color(avatar_text)
                                            .text_size(size_xs)
                                            .font_weight(FontWeight::MEDIUM)
                                            .child(initial.unwrap_or_default()),
                                    )
                                    .child(
                                        v_flex()
                                            .min_w_0()
                                            .gap_0p5()
                                            .child(
                                                div()
                                                    .truncate()
                                                    .text_size(size_sm)
                                                    .font_weight(FontWeight::MEDIUM)
                                                    .child(invite.summary.clone()),
                                            )
                                            .child(
                                                div()
                                                    .truncate()
                                                    .text_size(size_xs)
                                                    .text_color(muted)
                                                    .child(format!("From: {organizer}")),
                                            )
                                            .child(
                                                div()
                                                    .text_size(size_xs)
                                                    .text_color(muted)
                                                    .child(when),
                                            ),
                                    ),
                            )
                            .child(
                                h_flex()
                                    .justify_between()
                                    .gap_1p5()
                                    .child(
                                        rsvp("invite-maybe", "Maybe", ResponseStatus::Tentative)
                                            .secondary(),
                                    )
                                    .child(
                                        h_flex()
                                            .gap_1p5()
                                            .child(
                                                rsvp(
                                                    "invite-decline",
                                                    "Decline",
                                                    ResponseStatus::Declined,
                                                )
                                                .secondary(),
                                            )
                                            .child(
                                                rsvp(
                                                    "invite-accept",
                                                    "Accept",
                                                    ResponseStatus::Accepted,
                                                )
                                                .primary(),
                                            ),
                                    ),
                            )
                    }))
            }),
    )
}

/// The sync button: its icon tells the state, its tooltip the details.
pub fn sync_status(cx: &App) -> impl IntoElement + use<> {
    let state = SyncState::global(cx);
    let theme = cx.ren_theme();
    let auto_sync = Settings::global(cx).rencal.auto_sync_enabled;
    let pending = state.pending_count();
    let store = EventStore::global(cx);
    let calendar_name = |slug: &str| {
        store
            .read(cx)
            .calendar(slug)
            .and_then(|c| c.name.clone())
            .unwrap_or_else(|| slug.to_owned())
    };

    let (icon, tint, tooltip): (RenIcon, &str, String) = if let Some(error) = &state.error {
        (RenIcon::CloudWarning, "warning", error.clone())
    } else if state.status == SyncStatus::Syncing {
        (RenIcon::Sync, "text.muted", "Syncing...".into())
    } else if state.status == SyncStatus::Checking {
        (
            RenIcon::Cloud,
            "text.muted",
            "Checking for changes...".into(),
        )
    } else if pending > 0 {
        let mut lines = Vec::new();
        if !auto_sync {
            lines.push("Click to sync".to_owned());
            for preview in &state.pending {
                let mut parts = Vec::new();
                if preview.to_pull > 0 {
                    parts.push(format!("{} to pull", preview.to_pull));
                }
                if preview.to_push > 0 {
                    parts.push(format!("{} to push", preview.to_push));
                }
                lines.push(format!(
                    "{}: {}",
                    calendar_name(&preview.calendar_slug),
                    parts.join(", ")
                ));
            }
        }
        (RenIcon::Cloud, "text.muted", lines.join("\n"))
    } else {
        (RenIcon::CloudCheck, "text.muted", "Up-to-date".into())
    };
    let badge = (pending > 0 && !auto_sync).then(|| {
        div()
            .absolute()
            .top(px(-2.))
            .right(px(-2.))
            .min_w(px(14.))
            .h(px(14.))
            .px(px(3.))
            .rounded_full()
            .bg(color(theme, "primary"))
            .text_color(color(theme, "primary.text"))
            .text_size(text_size(theme, "2xs"))
            .line_height(px(14.))
            .text_center()
            .font_weight(FontWeight::MEDIUM)
            .child(pending.to_string())
    });

    div()
        .relative()
        .child(
            Button::new("sync-status")
                .ghost()
                .icon(Icon::new(icon).text_color(color(theme, tint)))
                .when(!tooltip.is_empty(), |this| this.tooltip(tooltip))
                .on_click(dispatch(Box::new(SyncNow))),
        )
        .children(badge)
}

/// Switches the active calendar group; hidden with fewer than two groups.
pub fn group_switcher(cx: &App) -> Option<impl IntoElement + use<>> {
    let options = group_options(&Settings::global(cx).rencal.groups);
    if options.len() < 2 {
        return None;
    }
    let active = UiState::global(cx).active_group.clone();
    Some(
        Button::new("group-switcher")
            .outline()
            .dropdown_caret(true)
            .label(button_label(&format_group_name(&active), cx))
            .dropdown_menu_with_anchor(Anchor::TopRight, move |menu, _, _| {
                options.iter().fold(menu, |menu, name| {
                    let name = name.clone();
                    menu.menu_with_check(
                        format_group_name(&name),
                        name == active,
                        Box::new(SetGroup(name)),
                    )
                })
            }),
    )
}

/// Shows `0`'s calendar group (the group switcher's menu items).
#[derive(Clone, PartialEq, Debug, gpui_kit::Action)]
#[action(namespace = rencal, no_json)]
pub struct SetGroup(pub String);

pub fn init(cx: &mut App) {
    cx.set_global(InvitesOpen::default());
    cx.on_action(|action: &SetGroup, cx| {
        let name = action.0.clone();
        UiState::update(cx, |ui| ui.active_group = name);
    });
    cx.on_action(|_: &ToggleInvites, cx| toggle_invites(cx));
}

pub fn view_menu(cx: &App) -> impl IntoElement + use<> {
    let current = view_def(&UiState::global(cx).calendar_view);
    let selected = current.id;
    Button::new("calendar-view")
        .outline()
        .dropdown_caret(true)
        .label(button_label(current.name, cx))
        .dropdown_menu_with_anchor(Anchor::TopRight, move |menu, _, _| {
            VIEWS.iter().fold(menu, |menu, view| {
                menu.menu_with_check(view.name, view.id == selected, (view.action)())
            })
        })
}
