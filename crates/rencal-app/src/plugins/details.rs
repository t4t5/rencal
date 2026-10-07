//! A plugin's details and actions (port of `PluginDetails.tsx`,
//! `PluginBadge.tsx` and `PluginPreview.tsx`), shared by the Settings ›
//! Plugins sheet and the deep-link install dialog: install, update or
//! repair, uninstall, the preview and the details list.

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::notification::Notification;
use gpui_kit::component::{Disableable, WindowExt, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AnyElement, Context, EventEmitter, FontWeight, IntoElement, ObjectFit, ParentElement, Render,
    SharedString, Styled, StyledImage, Window, div, img, px,
};
use rencal_theme::ResolvedTheme;

use super::list::{PluginListItem, contribution_label};
use super::{Plugins, Preview};
use crate::assets::RenImage;
use crate::theme::ThemeStore;
use crate::ui::{Role, color, error_text, muted_text, radius, text_size};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PluginAction {
    Install,
    Update,
    Uninstall,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PluginDetailsEvent {
    /// An action finished: the installed list changed.
    Changed,
    /// An action started (`true`) or ended.
    Busy(bool),
}

pub struct PluginDetails {
    plugin: PluginListItem,
    action: Option<PluginAction>,
    error: Option<String>,
    /// Shown above the details while the lists load (the deep-link dialog).
    loading: bool,
}

impl EventEmitter<PluginDetailsEvent> for PluginDetails {}

impl PluginDetails {
    pub fn new(plugin: PluginListItem) -> Self {
        Self {
            plugin,
            action: None,
            error: None,
            loading: false,
        }
    }

    pub fn loading(plugin: PluginListItem) -> Self {
        Self {
            loading: true,
            ..Self::new(plugin)
        }
    }

    /// The latest lists' version of the plugin.
    pub fn set_plugin(&mut self, plugin: PluginListItem, cx: &mut Context<Self>) {
        self.loading = false;
        if self.plugin != plugin {
            self.plugin = plugin;
            cx.notify();
        }
    }

    pub fn set_error(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        self.error = error;
        cx.notify();
    }

    pub fn is_busy(&self) -> bool {
        self.action.is_some()
    }

    #[cfg(test)]
    pub fn plugin_item(&self) -> &PluginListItem {
        &self.plugin
    }

    fn run(&mut self, action: PluginAction, window: &mut Window, cx: &mut Context<Self>) {
        if self.action.is_some() {
            return;
        }
        let task = match action {
            PluginAction::Install | PluginAction::Update => {
                let Some(repo) = self.repository() else {
                    return;
                };
                Plugins::install(repo, cx)
            }
            PluginAction::Uninstall => {
                let Some(installed) = &self.plugin.installed else {
                    return;
                };
                Plugins::uninstall(installed.id.clone(), cx)
            }
        };
        let Some(task) = task else {
            return;
        };
        self.action = Some(action);
        self.error = None;
        cx.emit(PluginDetailsEvent::Busy(true));
        cx.notify();
        let name = self.plugin.name.clone();
        cx.spawn_in(window, async move |this, cx| {
            let result = task.await.map_err(|err| err.to_string()).and_then(|r| r);
            this.update_in(cx, |this, window, cx| {
                this.action = None;
                match result {
                    Ok(()) => {
                        let done = match action {
                            PluginAction::Install => Some(format!("Installed {name}")),
                            PluginAction::Uninstall => Some(format!("Uninstalled {name}")),
                            PluginAction::Update => None,
                        };
                        if let Some(done) = done {
                            window.push_notification(Notification::success(done), cx);
                        }
                        cx.emit(PluginDetailsEvent::Changed);
                    }
                    Err(err) => {
                        log::error!("plugin {}: {err}", this.plugin.id);
                        this.error = Some(err);
                    }
                }
                cx.emit(PluginDetailsEvent::Busy(false));
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn repository(&self) -> Option<String> {
        repository(&self.plugin)
    }

    fn actions(&self, theme: &ResolvedTheme, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let busy = self.action.is_some();
        let label = |action: PluginAction, idle: &str, running: &str| {
            Role::Button.text(
                theme,
                if self.action == Some(action) {
                    running
                } else {
                    idle
                },
            )
        };
        let button = |id: &'static str,
                      action: PluginAction,
                      label: SharedString,
                      cx: &mut Context<Self>| {
            Button::new(id)
                .disabled(busy)
                .label(label)
                .on_click(cx.listener(move |this, _, window, cx| this.run(action, window, cx)))
        };
        let mut row = h_flex().flex_wrap().gap_2();
        if let Some((action, idle)) = install_action(&self.plugin) {
            let running = match action {
                PluginAction::Install => "Installing…",
                _ => "Updating…",
            };
            row = row.child(
                button("plugin-install", action, label(action, &idle, running), cx).primary(),
            );
        }
        if self.plugin.installed.is_some() {
            row = row.child(
                button(
                    "plugin-uninstall",
                    PluginAction::Uninstall,
                    label(PluginAction::Uninstall, "Uninstall", "Uninstalling…"),
                    cx,
                )
                .danger(),
            );
        }
        if let Some(repo) = self.plugin.repo.clone() {
            row = row.child(
                Button::new("plugin-github")
                    .secondary()
                    .label(Role::Button.text(theme, "View on GitHub"))
                    .on_click(move |_, _, cx| cx.open_url(&format!("https://github.com/{repo}"))),
            );
        }
        row
    }

    fn details_list(&self, theme: &ResolvedTheme) -> impl IntoElement + use<> {
        let plugin = &self.plugin;
        let installed = plugin.installed.as_ref();
        let version = installed
            .and_then(|installed| installed.version.clone())
            .or_else(|| plugin.version.clone())
            .map(
                |version| match installed.and_then(|i| i.update_version.as_ref()) {
                    Some(update) => format!("{version} · {update} available"),
                    None => version,
                },
            );
        let rows = [
            Some(("Author", plugin.owner().to_owned())),
            plugin.repo.clone().map(|repo| ("Repository", repo)),
            installed
                .and_then(|installed| installed.local_dir.clone())
                .map(|dir| ("Path", dir)),
            version.map(|version| ("Version", version)),
        ];
        let muted = color(theme, "text.muted");
        v_flex()
            .gap_3()
            .pt_6()
            .border_t_1()
            .border_color(color(theme, "border"))
            .child(heading(theme, "Details"))
            .child(
                v_flex()
                    .gap_2()
                    .children(rows.into_iter().flatten().map(|(term, value)| {
                        h_flex()
                            .gap_6()
                            .items_start()
                            .child(div().w(px(80.)).flex_none().text_color(muted).child(term))
                            .child(div().flex_1().min_w_0().child(value))
                    })),
            )
    }
}

/// Where installs come from. Local checkouts shadow their repo, so
/// installing from it would replace them.
fn repository(plugin: &PluginListItem) -> Option<String> {
    let local = plugin
        .installed
        .as_ref()
        .is_some_and(|installed| installed.local_dir.is_some());
    (!local).then(|| plugin.repo.clone()).flatten()
}

/// The install-side action a plugin offers, with its label: install, update
/// to the newer release, or reinstall a broken one.
fn install_action(plugin: &PluginListItem) -> Option<(PluginAction, String)> {
    repository(plugin)?;
    match &plugin.installed {
        None => Some((PluginAction::Install, "Install".into())),
        Some(installed) => match (&installed.update_version, &installed.error) {
            (Some(version), _) => Some((PluginAction::Update, format!("Update to {version}"))),
            (None, Some(_)) => Some((PluginAction::Update, "Reinstall".into())),
            (None, None) => None,
        },
    }
}

fn heading(theme: &ResolvedTheme, text: &str) -> impl IntoElement + use<> {
    div()
        .text_size(text_size(theme, "sm"))
        .when_some(Role::Heading.weight(theme), |this, weight| {
            this.font_weight(weight)
        })
        .child(Role::Heading.text(theme, text))
}

/// A contribution badge, or the solid status one (`PluginBadge`).
pub fn badge(theme: &ResolvedTheme, label: &str, solid: bool) -> impl IntoElement + use<> {
    div()
        .flex_none()
        .px_1p5()
        .py_0p5()
        .rounded(radius(theme, 0.4))
        .border_1()
        .text_size(text_size(theme, "xs"))
        .map(|this| {
            if solid {
                this.border_color(gpui_kit::transparent_black())
                    .bg(color(theme, "element.background"))
                    .text_color(color(theme, "element.text"))
            } else {
                this.border_color(color(theme, "border"))
                    .text_color(color(theme, "text.muted"))
            }
        })
        .child(SharedString::from(label.to_owned()))
}

/// The contribution badges plus "Installed" (`PluginBadges`).
pub fn badges(theme: &ResolvedTheme, plugin: &PluginListItem) -> Option<AnyElement> {
    if plugin.contributions.is_empty() && plugin.installed.is_none() {
        return None;
    }
    Some(
        h_flex()
            .flex_wrap()
            .gap_1p5()
            .children(
                plugin
                    .contributions
                    .iter()
                    .map(|kind| badge(theme, contribution_label(*kind), false)),
            )
            .when(plugin.installed.is_some(), |this| {
                this.child(badge(theme, "Installed", true))
            })
            .into_any_element(),
    )
}

/// The author's preview (`PluginPreview`): the logomark until it loads, or
/// when it can't.
pub fn preview(theme: &ResolvedTheme, preview: Preview) -> impl IntoElement + use<> {
    let placeholder = || {
        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .child(
                img(RenImage::Logomark.path())
                    .w(px(32.))
                    .h(px(29.))
                    .opacity(0.15)
                    .grayscale(true),
            )
            .into_any_element()
    };
    div()
        .w_full()
        .aspect_ratio(16. / 9.)
        .overflow_hidden()
        .rounded(radius(theme, 0.4))
        .bg(color(theme, "element.muted"))
        .child(match preview {
            Preview::Loaded(source) => img(source)
                .size_full()
                .object_fit(ObjectFit::Cover)
                .with_loading(placeholder)
                .with_fallback(placeholder)
                .into_any_element(),
            Preview::Loading | Preview::Failed => placeholder(),
        })
}

impl Render for PluginDetails {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let plugin = self.plugin.clone();
        let errors: Vec<String> = [
            plugin.installed.as_ref().and_then(|i| i.error.clone()),
            self.error.clone(),
        ]
        .into_iter()
        .flatten()
        .collect();
        v_flex()
            .w_full()
            .min_w_0()
            .gap_4()
            .text_size(text_size(&theme, "sm"))
            .child(
                v_flex()
                    .gap_3()
                    .child(
                        div()
                            .pr_6()
                            .text_size(text_size(&theme, "lg"))
                            .font_family(Role::Heading.family(cx))
                            .font_weight(Role::Heading.weight(&theme).unwrap_or(FontWeight::MEDIUM))
                            .child(Role::Heading.text(&theme, &plugin.name)),
                    )
                    .children(badges(&theme, &plugin))
                    .children(
                        plugin
                            .description
                            .clone()
                            .map(|d| muted_text(&theme, "sm", d)),
                    ),
            )
            .map(|this| {
                if self.loading {
                    this.child(muted_text(&theme, "sm", "Loading plugin…"))
                } else {
                    this.child(
                        v_flex()
                            .gap_3()
                            .child(self.actions(&theme, cx))
                            .when(!plugin.listed, |this| {
                                this.child(muted_text(
                                    &theme,
                                    "xs",
                                    "This plugin isn't listed in the renCal catalog.",
                                ))
                            })
                            .children(errors.into_iter().map(|error| error_text(&theme, error))),
                    )
                    .when_some(plugin.preview_url.clone(), |this, url| {
                        this.child(preview(&theme, super::preview(&url, cx)))
                    })
                    .child(self.details_list(&theme))
                }
            })
    }
}

#[cfg(test)]
mod tests {
    use rencal_core::plugins::InstalledPlugin;

    use super::*;
    use crate::plugins::list::{PluginSelection, resolve_selection};

    fn plugin(installed: Option<InstalledPlugin>) -> PluginListItem {
        let mut plugin = resolve_selection(
            &[],
            &PluginSelection {
                id: Some("alice.dusk".into()),
                repo: Some("alice/dusk".into()),
            },
        );
        plugin.installed = installed;
        plugin
    }

    fn installed(
        update: Option<&str>,
        error: Option<&str>,
        local: Option<&str>,
    ) -> InstalledPlugin {
        InstalledPlugin {
            id: "alice.dusk".into(),
            name: "Dusk".into(),
            description: None,
            contributions: Vec::new(),
            preview_url: None,
            repo: Some("alice/dusk".into()),
            local_dir: local.map(Into::into),
            version: Some("v1.2.0".into()),
            update_version: update.map(Into::into),
            error: error.map(Into::into),
        }
    }

    fn label(plugin: &PluginListItem) -> Option<String> {
        install_action(plugin).map(|(_, label)| label)
    }

    #[test]
    fn offers_install_update_or_repair() {
        assert_eq!(label(&plugin(None)).as_deref(), Some("Install"));
        assert_eq!(
            label(&plugin(Some(installed(Some("v1.10.0"), None, None)))).as_deref(),
            Some("Update to v1.10.0")
        );
        assert_eq!(
            label(&plugin(Some(installed(
                None,
                Some("Package files are missing"),
                None
            ))))
            .as_deref(),
            Some("Reinstall")
        );
        assert_eq!(label(&plugin(Some(installed(None, None, None)))), None);
    }

    #[test]
    fn local_checkouts_only_uninstall() {
        let local = installed(
            Some("v9.0.0"),
            Some("Package files are missing"),
            Some("/home/alice/dev/dusk"),
        );
        assert_eq!(label(&plugin(Some(local))), None);
    }
}
