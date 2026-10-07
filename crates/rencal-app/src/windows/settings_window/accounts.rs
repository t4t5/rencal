//! Settings › Accounts (port of `AccountsPage.tsx`): the connected accounts
//! with a live connection check each, reconnecting, and connecting a new one.

use std::collections::HashMap;

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::menu::PopupMenuItem;
use gpui_kit::component::tooltip::Tooltip;
use gpui_kit::component::{Icon, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    Animation, AnimationExt, App, Context, InteractiveElement, IntoElement, ParentElement, Render,
    SharedString, StatefulInteractiveElement, Styled, Window, div, px,
};
use rencal_theme::ResolvedTheme;

use super::controls::{content, more_menu};
use crate::accounts::connect::{self, ConnectStep};
use crate::accounts::providers::{Providers, display_name, provider_icon};
use crate::assets::RenIcon;
use crate::backend::Backend;
use crate::event_store::EventStore;
use crate::theme::ThemeStore;
use crate::ui::{Role, color, error_text, muted_text, radius, radius_circle, text_size};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccountStatus {
    Pending,
    Connected,
    Disconnected,
}

impl AccountStatus {
    fn label(self) -> &'static str {
        match self {
            Self::Pending => "Connecting...",
            Self::Connected => "Connected",
            Self::Disconnected => "Failed to connect",
        }
    }
}

/// An account and the provider its calendars come from.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Account {
    pub account: String,
    pub provider: Option<String>,
}

/// One entry per account, in the order its first calendar appears.
pub fn accounts(calendars: &[rencal_time::Calendar]) -> Vec<Account> {
    let mut accounts: Vec<Account> = Vec::new();
    for calendar in calendars {
        let Some(account) = &calendar.account else {
            continue;
        };
        if !accounts.iter().any(|a| &a.account == account) {
            accounts.push(Account {
                account: account.clone(),
                provider: calendar.provider.clone(),
            });
        }
    }
    accounts
}

pub struct AccountsPage {
    statuses: HashMap<Account, AccountStatus>,
    reconnect_error: Option<String>,
}

impl AccountsPage {
    pub fn new(cx: &mut Context<Self>) -> Self {
        cx.observe_global::<Providers>(|_, cx| cx.notify()).detach();
        let store = EventStore::global(cx);
        cx.observe(&store, |this, _, cx| this.check_accounts(cx))
            .detach();
        Providers::load(cx);
        let mut this = Self {
            statuses: HashMap::new(),
            reconnect_error: None,
        };
        this.check_accounts(cx);
        this
    }

    /// Checks every account not checked yet.
    fn check_accounts(&mut self, cx: &mut Context<Self>) {
        let calendars = EventStore::global(cx).read(cx).calendars().clone();
        for account in accounts(&calendars) {
            if self.statuses.contains_key(&account) {
                continue;
            }
            let Some(provider) = account.provider.clone() else {
                self.statuses.insert(account, AccountStatus::Disconnected);
                continue;
            };
            let name = account.account.clone();
            let Some(check) = Backend::run(cx, move |state| async move {
                rencal_core::caldir::check_provider_connection(&state, provider, name).await
            }) else {
                continue;
            };
            self.statuses
                .insert(account.clone(), AccountStatus::Pending);
            cx.spawn(async move |this, cx| {
                let status = match check.await {
                    Ok(Ok(())) => AccountStatus::Connected,
                    Ok(Err(err)) => {
                        log::error!("account {}: {err}", account.account);
                        AccountStatus::Disconnected
                    }
                    Err(_) => AccountStatus::Disconnected,
                };
                this.update(cx, |this, cx| {
                    this.statuses.insert(account, status);
                    cx.notify();
                })
                .ok();
            })
            .detach();
        }
        cx.notify();
    }

    fn reconnect(&mut self, provider: Option<String>, window: &mut Window, cx: &mut Context<Self>) {
        let Some(provider) = provider else {
            return;
        };
        self.reconnect_error = None;
        cx.notify();
        let this = cx.entity().downgrade();
        let window_handle = window.window_handle();
        connect::begin(provider, cx, move |result, cx| match result {
            Ok(Some(step)) => {
                window_handle
                    .update(cx, |_, window, cx| connect::open(step, false, window, cx))
                    .ok();
            }
            Ok(None) => {}
            Err(err) => {
                this.update(cx, |this, cx| {
                    this.reconnect_error = Some(err);
                    cx.notify();
                })
                .ok();
            }
        });
    }

    fn account_row(
        &self,
        account: &Account,
        theme: &ResolvedTheme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let providers = Providers::global(cx);
        let info = providers.find(account.provider.as_deref());
        let name = display_name(account.provider.as_deref(), info);
        let icon = provider_icon(
            account.provider.as_deref(),
            info,
            Some(RenIcon::Calendar),
            px(24.),
        );
        let status = self
            .statuses
            .get(account)
            .copied()
            .unwrap_or(AccountStatus::Pending);
        let dot = match status {
            AccountStatus::Pending => color(theme, "text.muted"),
            AccountStatus::Connected => color(theme, "success"),
            AccountStatus::Disconnected => color(theme, "error"),
        };
        let provider = account.provider.clone();
        let page = cx.entity().downgrade();
        let label = status.label();
        h_flex()
            .gap_3()
            .child(
                div()
                    .size(px(44.))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded(radius(theme, 1.4))
                    .bg(color(theme, "element.background"))
                    .children(icon),
            )
            .child(
                v_flex()
                    .flex_1()
                    .min_w_0()
                    .gap_0p5()
                    .child(
                        div()
                            .text_size(text_size(theme, "sm"))
                            .when_some(Role::Heading.weight(theme), |this, weight| {
                                this.font_weight(weight)
                            })
                            .child(Role::Heading.text(theme, &name)),
                    )
                    .child(
                        h_flex()
                            .gap_1()
                            .child(
                                div()
                                    .id(SharedString::from(format!("status-{}", account.account)))
                                    .size(px(6.))
                                    .flex_none()
                                    .rounded(radius_circle(theme))
                                    .bg(dot)
                                    .tooltip(move |window, cx| {
                                        Tooltip::new(label).build(window, cx)
                                    })
                                    .map(|this| {
                                        if status == AccountStatus::Pending {
                                            this.with_animation(
                                                "status-pulse",
                                                Animation::new(std::time::Duration::from_secs(2))
                                                    .repeat(),
                                                |this, delta| {
                                                    let fade =
                                                        (delta * std::f32::consts::TAU).cos();
                                                    this.opacity(0.75 + 0.25 * fade)
                                                },
                                            )
                                            .into_any_element()
                                        } else {
                                            this.into_any_element()
                                        }
                                    }),
                            )
                            .child(muted_text(theme, "xs", account.account.clone()).truncate()),
                    ),
            )
            .child(more_menu(
                SharedString::from(format!("account-menu-{}", account.account)),
                theme,
                move |menu, _, _| {
                    let provider = provider.clone();
                    let page = page.clone();
                    menu.item(
                        PopupMenuItem::new("Reconnect...").on_click(move |_, window, cx| {
                            let provider = provider.clone();
                            page.update(cx, |page, cx| page.reconnect(provider, window, cx))
                                .ok();
                        }),
                    )
                },
            ))
    }
}

impl Render for AccountsPage {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let calendars = EventStore::global(cx).read(cx).calendars().clone();
        let accounts = accounts(&calendars);
        let rows: Vec<_> = accounts
            .iter()
            .map(|account| self.account_row(account, &theme, cx))
            .collect();
        content("accounts-page").child(
            v_flex()
                .w(px(400.))
                .gap_6()
                .when(!rows.is_empty(), |this| {
                    this.child(v_flex().gap_4().children(rows))
                })
                .when(accounts.is_empty(), |this| {
                    this.child(muted_text(&theme, "sm", "No accounts connected yet."))
                })
                .children(
                    self.reconnect_error
                        .clone()
                        .map(|error| error_text(&theme, error)),
                )
                .child(
                    h_flex().child(
                        Button::new("connect-account")
                            .primary()
                            .icon(Icon::new(RenIcon::Plus))
                            .label(Role::Button.text(&theme, "Connect new account"))
                            .on_click(|_, window, cx: &mut App| {
                                connect::open(ConnectStep::SelectProvider, false, window, cx);
                            }),
                    ),
                ),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn calendar(
        slug: &str,
        account: Option<&str>,
        provider: Option<&str>,
    ) -> rencal_time::Calendar {
        rencal_time::Calendar {
            slug: slug.into(),
            name: None,
            color: None,
            provider: provider.map(Into::into),
            account: account.map(Into::into),
            read_only: None,
        }
    }

    #[test]
    fn one_entry_per_account_in_calendar_order() {
        let calendars = [
            calendar("work", Some("me@work.com"), Some("google")),
            calendar("local", None, None),
            calendar("home", Some("me@home.com"), Some("icloud")),
            calendar("team", Some("me@work.com"), Some("google")),
        ];
        let accounts = accounts(&calendars);
        assert_eq!(
            accounts
                .iter()
                .map(|a| a.account.as_str())
                .collect::<Vec<_>>(),
            ["me@work.com", "me@home.com"]
        );
        assert_eq!(accounts[1].provider.as_deref(), Some("icloud"));
    }
}
