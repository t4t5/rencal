//! Connecting calendars (ports of `AddAccountModal.tsx`, `ProviderList.tsx`,
//! `CredentialsForm.tsx`, `LocalCalendarForm.tsx`, `AddSubscriptionModal.tsx`
//! and `provider-connection.ts`). Browser sign-in providers connect as soon
//! as they're picked (the backend opens the browser and waits for the
//! callback); others ask for setup and credentials first.

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::{Disableable, WindowExt, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, App, AppContext, Context, Entity, InteractiveElement, IntoElement, ParentElement,
    Render, SharedString, StatefulInteractiveElement, Styled, Subscription, Window, div, px, rgb,
};
use rencal_core::caldir::{self, CredentialFieldInput, ProviderField, ProviderFieldType};
use rencal_core::caldir::{OpenUrl, ProviderConnectStepKind};

use super::providers::{
    Providers, display_name, order_account_providers, provider_icon, requires_account,
};
use crate::backend::Backend;
use crate::editing::dialogs::dialog_title;
use crate::event_store::EventStore;
use crate::theme::{ActiveRenTheme, ThemeStore};
use crate::ui::{Role, error_text, muted_text, radius_circle};

/// What the connect dialog shows.
#[derive(Clone)]
pub enum ConnectStep {
    SelectProvider,
    Setup {
        provider: String,
        instructions: String,
        fields: Vec<ProviderField>,
    },
    Credentials {
        provider: String,
        fields: Vec<ProviderField>,
    },
    LocalCalendar,
}

/// The local calendar colours to pick from.
const COLOR_PALETTE: [&str; 8] = [
    "#7986cb", "#33b679", "#8e24aa", "#e67c73", "#f6bf26", "#f4511e", "#039be5", "#0b8043",
];

type Done<T> = Box<dyn FnOnce(Result<T, String>, &mut App)>;

/// A URL opener for the backend: the backend asks from its own threads, the
/// main thread opens the browser.
fn opener(cx: &mut App) -> impl Fn(&str) -> Result<(), String> + Send + Sync + 'static {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    cx.spawn(async move |cx| {
        while let Some(url) = rx.recv().await {
            cx.update(|cx| cx.open_url(&url));
        }
    })
    .detach();
    move |url| tx.send(url.to_owned()).map_err(|err| err.to_string())
}

fn calendars_changed(cx: &mut App) {
    EventStore::global(cx).update(cx, |store, cx| store.reload_calendars(cx));
}

/// Starts connecting `provider` (`beginProviderConnection`): a browser
/// sign-in finishes the connection (`Ok(None)`); otherwise `done` gets the
/// step to ask for.
pub fn begin(
    provider: String,
    cx: &mut App,
    done: impl FnOnce(Result<Option<ConnectStep>, String>, &mut App) + 'static,
) {
    let name = provider.clone();
    let Some(info) = Backend::run(cx, move |state| async move {
        caldir::get_provider_connect_info(&state, name).await
    }) else {
        return;
    };
    let done: Done<Option<ConnectStep>> = Box::new(done);
    cx.spawn(async move |cx| {
        let info = match info.await {
            Ok(Ok(info)) => info,
            Ok(Err(err)) => return cx.update(|cx| done(Err(err.to_string()), cx)),
            Err(err) => return cx.update(|cx| done(Err(err.to_string()), cx)),
        };
        let step = match info.step {
            ProviderConnectStepKind::OAuthRedirect | ProviderConnectStepKind::HostedOAuth => None,
            ProviderConnectStepKind::NeedsSetup => Some(ConnectStep::Setup {
                provider: provider.clone(),
                instructions: info.instructions.unwrap_or_default(),
                fields: info.fields,
            }),
            ProviderConnectStepKind::Credentials => Some(ConnectStep::Credentials {
                provider: provider.clone(),
                fields: info.fields,
            }),
        };
        if step.is_some() {
            return cx.update(|cx| done(Ok(step), cx));
        }
        let connect = cx.update(|cx| {
            let open = opener(cx);
            Backend::run(cx, move |state| async move {
                let open: OpenUrl = &open;
                caldir::connect_provider(&state, open, provider).await
            })
        });
        let Some(connect) = connect else {
            return;
        };
        let result = match connect.await {
            Ok(Ok(_)) => Ok(None),
            Ok(Err(err)) => Err(err.to_string()),
            Err(err) => Err(err.to_string()),
        };
        cx.update(|cx| {
            if result.is_ok() {
                calendars_changed(cx);
            } else if let Err(err) = &result {
                log::error!("could not connect a provider: {err}");
            }
            done(result, cx);
        });
    })
    .detach();
}

/// Connects `provider` with the user's credentials (`connectWithCredentials`).
pub fn connect_with_credentials(
    provider: String,
    credentials: Vec<CredentialFieldInput>,
    cx: &mut App,
    done: impl FnOnce(Result<(), String>, &mut App) + 'static,
) {
    let open = opener(cx);
    let Some(task) = Backend::run(cx, move |state| async move {
        let open: OpenUrl = &open;
        caldir::connect_provider_with_credentials(&state, open, provider, credentials).await
    }) else {
        return;
    };
    cx.spawn(async move |cx| {
        let result = match task.await {
            Ok(Ok(_)) => Ok(()),
            Ok(Err(err)) => Err(err.to_string()),
            Err(err) => Err(err.to_string()),
        };
        cx.update(|cx| {
            match &result {
                Ok(()) => calendars_changed(cx),
                Err(err) => log::error!("could not connect a provider: {err}"),
            }
            done(result, cx);
        });
    })
    .detach();
}

/// Opens the connect dialog at `step`. `show_local_option` offers a
/// local-only calendar under the provider list (the get-started state).
pub fn open(
    step: ConnectStep,
    show_local_option: bool,
    window: &mut Window,
    cx: &mut App,
) -> Entity<ConnectDialog> {
    Providers::load(cx);
    let view = cx.new(|cx| ConnectDialog::new(step, show_local_option, window, cx));
    let dialog_view = view.clone();
    window.open_dialog(cx, move |dialog, _, cx| {
        let title = dialog_view.read(cx).title(cx);
        let enter = dialog_view.clone();
        dialog
            .w(px(425.))
            .title(dialog_title(&title, cx))
            // Enter (which a text input passes on) submits the step.
            .on_ok(move |_, window, cx| {
                enter.update(cx, |view, cx| view.submit(window, cx));
                false
            })
            .child(dialog_view.clone())
    });
    // After opening: the dialog takes focus when it opens.
    view.update(cx, |view, cx| view.focus_first(window, cx));
    view
}

pub struct ConnectDialog {
    step: ConnectStep,
    show_local_option: bool,
    connecting: bool,
    error: Option<String>,
    /// One per credential field, or the local calendar's name.
    inputs: Vec<Entity<InputState>>,
    color: &'static str,
    _subscriptions: Vec<Subscription>,
}

impl ConnectDialog {
    fn new(
        step: ConnectStep,
        show_local_option: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let mut this = Self {
            step: ConnectStep::SelectProvider,
            show_local_option,
            connecting: false,
            error: None,
            inputs: Vec::new(),
            color: COLOR_PALETTE[0],
            _subscriptions: Vec::new(),
        };
        this.set_step(step, window, cx);
        this
    }

    fn set_step(&mut self, step: ConnectStep, window: &mut Window, cx: &mut Context<Self>) {
        self.error = None;
        self.inputs = match &step {
            ConnectStep::Credentials { fields, .. } => fields
                .iter()
                .map(|field| {
                    cx.new(|cx| {
                        InputState::new(window, cx)
                            .placeholder(field.label.clone())
                            .masked(matches!(field.field_type, ProviderFieldType::Password))
                    })
                })
                .collect(),
            ConnectStep::LocalCalendar => {
                vec![cx.new(|cx| InputState::new(window, cx).placeholder("Calendar name"))]
            }
            _ => Vec::new(),
        };
        self._subscriptions = self
            .inputs
            .iter()
            .map(|input| {
                cx.subscribe(input, |_, _, event: &InputEvent, cx| {
                    if let InputEvent::Change = event {
                        cx.notify();
                    }
                })
            })
            .collect();
        self.focus_first(window, cx);
        self.step = step;
        cx.notify();
    }

    fn focus_first(&self, window: &mut Window, cx: &mut App) {
        if let Some(first) = self.inputs.first() {
            first.update(cx, |input, cx| input.focus(window, cx));
        }
    }

    fn provider_name(provider: &str, cx: &App) -> String {
        display_name(Some(provider), Providers::global(cx).find(Some(provider)))
    }

    fn title(&self, cx: &App) -> String {
        match &self.step {
            ConnectStep::SelectProvider => "Connect calendar".into(),
            ConnectStep::Setup { provider, .. } | ConnectStep::Credentials { provider, .. } => {
                format!("Connect {}", Self::provider_name(provider, cx))
            }
            ConnectStep::LocalCalendar => "New local-only calendar".into(),
        }
    }

    #[cfg(test)]
    pub fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    fn value(&self, index: usize, cx: &App) -> String {
        self.inputs
            .get(index)
            .map(|input| input.read(cx).value().to_string())
            .unwrap_or_default()
    }

    fn finish(&mut self, result: Result<(), String>, window: &mut Window, cx: &mut Context<Self>) {
        self.connecting = false;
        match result {
            Ok(()) => window.close_dialog(cx),
            Err(err) => self.error = Some(err),
        }
        cx.notify();
    }

    fn pick_provider(&mut self, provider: String, window: &mut Window, cx: &mut Context<Self>) {
        self.error = None;
        self.connecting = true;
        cx.notify();
        let this = cx.entity().downgrade();
        let window_handle = window.window_handle();
        begin(provider, cx, move |result, cx| {
            window_handle
                .update(cx, |_, window, cx| {
                    this.update(cx, |this, cx| match result {
                        Ok(Some(step)) => {
                            this.connecting = false;
                            this.set_step(step, window, cx);
                        }
                        Ok(None) => this.finish(Ok(()), window, cx),
                        Err(err) => this.finish(Err(err), window, cx),
                    })
                })
                .ok();
        });
    }

    fn submit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.connecting {
            return;
        }
        match self.step.clone() {
            ConnectStep::Credentials { provider, fields } => {
                let values: Vec<String> = (0..fields.len()).map(|i| self.value(i, cx)).collect();
                let missing = fields
                    .iter()
                    .zip(&values)
                    .any(|(field, value)| field.required && value.is_empty());
                if missing {
                    self.error = Some("Please fill in all required fields".into());
                    cx.notify();
                    return;
                }
                let credentials = fields
                    .iter()
                    .zip(values)
                    .filter(|(_, value)| !value.is_empty())
                    .map(|(field, value)| CredentialFieldInput {
                        id: field.id.clone(),
                        value,
                    })
                    .collect();
                self.connect(provider, credentials, window, cx);
            }
            ConnectStep::LocalCalendar => self.create_local(window, cx),
            ConnectStep::Setup {
                provider, fields, ..
            } => self.set_step(ConnectStep::Credentials { provider, fields }, window, cx),
            ConnectStep::SelectProvider => {}
        }
    }

    fn connect(
        &mut self,
        provider: String,
        credentials: Vec<CredentialFieldInput>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.error = None;
        self.connecting = true;
        cx.notify();
        let this = cx.entity().downgrade();
        let window_handle = window.window_handle();
        connect_with_credentials(provider, credentials, cx, move |result, cx| {
            window_handle
                .update(cx, |_, window, cx| {
                    this.update(cx, |this, cx| this.finish(result, window, cx))
                })
                .ok();
        });
    }

    fn create_local(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let name = self.value(0, cx).trim().to_owned();
        if name.is_empty() {
            self.error = Some("Please enter a calendar name".into());
            cx.notify();
            return;
        }
        let color = self.color.to_owned();
        let Some(task) = Backend::write(cx, move |state| {
            caldir::create_local_calendar(state, name, Some(color))
        }) else {
            return;
        };
        self.error = None;
        self.connecting = true;
        cx.notify();
        cx.spawn_in(window, async move |this, cx| {
            let result = match task.await {
                Ok(Ok(_)) => Ok(()),
                Ok(Err(err)) => Err(err.to_string()),
                Err(err) => Err(err.to_string()),
            };
            this.update_in(cx, |this, window, cx| {
                match &result {
                    Ok(()) => calendars_changed(cx),
                    Err(err) => log::error!("could not create a local calendar: {err}"),
                }
                this.finish(result, window, cx);
            })
            .ok();
        })
        .detach();
    }

    fn provider_list(&self, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let theme = ThemeStore::active(cx);
        let providers = Providers::global(cx);
        let slugs: Vec<String> = providers
            .list
            .iter()
            .map(|provider| provider.slug.clone())
            .filter(|slug| requires_account(slug))
            .collect();
        order_account_providers(&slugs)
            .into_iter()
            .map(|slug| {
                let caldav = slug == "caldav";
                let info = providers.find(Some(&slug));
                let label = if caldav {
                    "Other CalDAV server".to_owned()
                } else {
                    display_name(Some(&slug), info)
                };
                let icon = (!caldav)
                    .then(|| provider_icon(Some(&slug), info, None, px(16.)))
                    .flatten();
                let pick = slug.clone();
                Button::new(SharedString::from(format!("provider-{slug}")))
                    .secondary()
                    .w_full()
                    .disabled(self.connecting)
                    .child(
                        h_flex()
                            .gap_3()
                            .children(icon)
                            .child(Role::Button.text(&theme, &label)),
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.pick_provider(pick.clone(), window, cx)
                    }))
                    .into_any_element()
            })
            .collect()
    }
}

impl Render for ConnectDialog {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let error = self
            .error
            .clone()
            .or_else(|| match self.step {
                ConnectStep::SelectProvider => Providers::global(cx).error.clone(),
                _ => None,
            })
            .map(|error| error_text(&theme, error));
        let submit = |id: &'static str, label: String, enabled: bool, cx: &mut Context<Self>| {
            Button::new(id)
                .primary()
                .disabled(!enabled)
                .label(Role::Button.text(cx.ren_theme(), &label))
                .on_click(cx.listener(|this, _, window, cx| this.submit(window, cx)))
        };
        let body = match self.step.clone() {
            ConnectStep::SelectProvider => v_flex()
                .items_center()
                .gap_3()
                .child(
                    v_flex()
                        .w(px(240.))
                        .gap_3()
                        .children(self.provider_list(cx)),
                )
                .children(error)
                .when(self.show_local_option, |this| {
                    this.child(
                        div().w(px(240.)).child(
                            Button::new("local-only")
                                .ghost()
                                .w_full()
                                .label(Role::Button.text(&theme, "Local-only calendar"))
                                .on_click(cx.listener(|this, _, window, cx| {
                                    this.set_step(ConnectStep::LocalCalendar, window, cx)
                                })),
                        ),
                    )
                }),
            ConnectStep::Setup { instructions, .. } => v_flex()
                .gap_4()
                .child(muted_text(&theme, "sm", instructions))
                .child(h_flex().justify_center().child(submit(
                    "setup-continue",
                    "Continue".into(),
                    true,
                    cx,
                ))),
            ConnectStep::Credentials { provider, fields } => {
                let name = Self::provider_name(&provider, cx);
                let label = if self.connecting {
                    "Connecting...".to_owned()
                } else {
                    format!("Connect {name}")
                };
                v_flex()
                    .gap_3()
                    .children(fields.iter().zip(&self.inputs).map(|(field, input)| {
                        let masked = matches!(field.field_type, ProviderFieldType::Password);
                        v_flex()
                            .gap_1()
                            .child(
                                Input::new(input)
                                    .disabled(self.connecting)
                                    .when(masked, |input| input.mask_toggle()),
                            )
                            .children(
                                field
                                    .help
                                    .clone()
                                    .map(|help| muted_text(&theme, "xs", help)),
                            )
                    }))
                    .children(error)
                    .child(h_flex().justify_end().mt_3().child(submit(
                        "credentials-submit",
                        label,
                        !self.connecting,
                        cx,
                    )))
            }
            ConnectStep::LocalCalendar => {
                let has_name = !self.value(0, cx).trim().is_empty();
                let label = if self.connecting {
                    "Creating..."
                } else {
                    "Create calendar"
                };
                v_flex()
                    .gap_4()
                    .child(muted_text(
                        &theme,
                        "sm",
                        "This calendar will live on your computer only, and never be connected to the internet.",
                    ))
                    .children(self.inputs.first().map(Input::new))
                    .child(
                        h_flex()
                            .flex_wrap()
                            .justify_center()
                            .gap_2()
                            .children(COLOR_PALETTE.iter().map(|swatch| {
                                color_swatch(swatch, *swatch == self.color, &theme, cx)
                            })),
                    )
                    .children(error)
                    .child(h_flex().justify_end().child(submit(
                        "local-submit",
                        label.into(),
                        has_name && !self.connecting,
                        cx,
                    )))
            }
        };
        body.w_full()
    }
}

fn parse_hex(hex: &str) -> u32 {
    u32::from_str_radix(hex.trim_start_matches('#'), 16).unwrap_or(0)
}

fn color_swatch(
    swatch: &'static str,
    selected: bool,
    theme: &rencal_theme::ResolvedTheme,
    cx: &mut Context<ConnectDialog>,
) -> impl IntoElement + use<> {
    let ring = crate::ui::color(theme, "text");
    let gap = crate::ui::color(theme, "elevated_surface.background");
    let round = radius_circle(theme);
    div()
        .id(SharedString::from(format!("swatch-{swatch}")))
        .size(px(32.))
        .p(px(2.))
        .rounded(round)
        .border_2()
        .border_color(if selected {
            ring
        } else {
            gpui_kit::transparent_black()
        })
        .child(
            div()
                .size_full()
                .rounded(round)
                .border_2()
                .border_color(gap)
                .bg(rgb(parse_hex(swatch))),
        )
        .on_click(cx.listener(move |this, _, _, cx| {
            this.color = swatch;
            cx.notify();
        }))
}

/// "Add subscription": a public `.ics` feed through the webcal provider.
pub fn open_subscription(window: &mut Window, cx: &mut App) {
    let view = cx.new(|cx| SubscriptionDialog::new(window, cx));
    let url = view.read(cx).url.clone();
    window.open_dialog(cx, move |dialog, _, cx| {
        let enter = view.clone();
        dialog
            .w(px(425.))
            .title(dialog_title("Add subscription", cx))
            .on_ok(move |_, window, cx| {
                enter.update(cx, |view, cx| view.submit(window, cx));
                false
            })
            .child(view.clone())
    });
    url.update(cx, |input, cx| input.focus(window, cx));
}

/// `webcal:`, `http:` and `https:` URLs with a host.
fn is_supported_calendar_url(value: &str) -> bool {
    ["webcal://", "http://", "https://"].iter().any(|scheme| {
        value
            .get(..scheme.len())
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(scheme))
            && value.len() > scheme.len()
    })
}

pub struct SubscriptionDialog {
    url: Entity<InputState>,
    connecting: bool,
    error: Option<String>,
    _subscription: Subscription,
}

impl SubscriptionDialog {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let url = cx
            .new(|cx| InputState::new(window, cx).placeholder("https://example.com/calendar.ics"));
        let subscription = cx.subscribe(&url, |_, _, event, cx| {
            if let InputEvent::Change = event {
                cx.notify();
            }
        });
        Self {
            url,
            connecting: false,
            error: None,
            _subscription: subscription,
        }
    }

    fn submit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.connecting {
            return;
        }
        let url = self.url.read(cx).value().trim().to_owned();
        self.error = if url.is_empty() {
            Some("Please enter a calendar URL".into())
        } else if !is_supported_calendar_url(&url) {
            Some("Please enter a webcal, http, or https URL".into())
        } else {
            None
        };
        if self.error.is_some() {
            cx.notify();
            return;
        }
        self.connecting = true;
        cx.notify();
        let this = cx.entity().downgrade();
        let window_handle = window.window_handle();
        let credentials = vec![CredentialFieldInput {
            id: "url".into(),
            value: url,
        }];
        connect_with_credentials("webcal".into(), credentials, cx, move |result, cx| {
            window_handle
                .update(cx, |_, window, cx| {
                    this.update(cx, |this, cx| {
                        this.connecting = false;
                        match result {
                            Ok(()) => window.close_dialog(cx),
                            Err(err) => this.error = Some(err),
                        }
                        cx.notify();
                    })
                })
                .ok();
        });
    }
}

impl Render for SubscriptionDialog {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let has_url = !self.url.read(cx).value().trim().is_empty();
        v_flex()
            .w_full()
            .gap_3()
            .child(muted_text(
                &theme,
                "sm",
                "Paste a public .ics calendar feed URL (webcal or http)",
            ))
            .child(Input::new(&self.url).disabled(self.connecting))
            .children(self.error.clone().map(|error| error_text(&theme, error)))
            .child(
                h_flex().justify_end().mt_3().child(
                    Button::new("subscription-submit")
                        .primary()
                        .disabled(self.connecting || !has_url)
                        .label(Role::Button.text(
                            &theme,
                            if self.connecting {
                                "Adding..."
                            } else {
                                "Add subscription"
                            },
                        ))
                        .on_click(cx.listener(|this, _, window, cx| this.submit(window, cx))),
                ),
            )
    }
}

#[cfg(test)]
mod tests {
    use gpui_kit::{TestAppContext, VisualTestContext};
    use rencal_config::ThemeConfig;

    use super::*;
    use crate::windows::main_window;
    use crate::{actions, test_support};

    #[gpui_kit::test]
    fn a_local_calendar_needs_a_name(cx: &mut TestAppContext) {
        let handle = cx.update(|cx| {
            test_support::init(ThemeConfig::default(), None, cx);
            actions::init(cx);
            Providers::init(cx);
            main_window::open(cx).unwrap();
            main_window::handle(cx).unwrap()
        });
        let cx = VisualTestContext::from_window(handle, cx).into_mut();
        cx.update(|window, _| window.activate_window());
        let dialog = cx.update(|window, cx| open(ConnectStep::SelectProvider, true, window, cx));
        cx.run_until_parked();
        dialog.update_in(cx, |dialog, window, cx| {
            dialog.set_step(ConnectStep::LocalCalendar, window, cx)
        });
        cx.run_until_parked();

        // Enter in the name field submits the step.
        cx.simulate_input("   ");
        cx.simulate_keystrokes("enter");
        cx.run_until_parked();
        assert!(cx.update(|window, cx| window.has_active_dialog(cx)));
        assert_eq!(
            dialog.read_with(cx, |dialog, _| dialog.error().map(str::to_owned)),
            Some("Please enter a calendar name".to_owned())
        );
    }

    #[test]
    fn accepts_feed_urls_only() {
        assert!(is_supported_calendar_url("webcal://example.com/a.ics"));
        assert!(is_supported_calendar_url("HTTPS://example.com/a.ics"));
        assert!(!is_supported_calendar_url("ftp://example.com/a.ics"));
        assert!(!is_supported_calendar_url("example.com/a.ics"));
        assert!(!is_supported_calendar_url("https://"));
    }
}
