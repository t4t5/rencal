//! Settings › Plugins (ports of `PluginsPage.tsx` and `PluginSheet.tsx`):
//! the catalog merged with what's installed, searchable, sortable and
//! filterable, with a sheet of details and actions per plugin.

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::{Disableable, WindowExt, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AppContext, Context, Entity, InteractiveElement, IntoElement, ParentElement, Render,
    SharedString, StatefulInteractiveElement, Styled, Window, div, px,
};
use rencal_core::plugins::{InstalledPlugins, PluginCatalog};
use rencal_theme::ResolvedTheme;

use super::controls::{SelectOption, checkbox, content, select};
use crate::plugins::Plugins;
use crate::plugins::details::{PluginDetails, PluginDetailsEvent, badge};
use crate::plugins::list::{
    PluginListItem, PluginSelection, PluginSort, contribution_label, merge_plugins, plugin_count,
    resolve_selection, visible_plugins,
};
use crate::theme::ThemeStore;
use crate::ui::{Role, color, error_text, muted_text, radius, text_size};

pub struct PluginsPage {
    installed: Option<InstalledPlugins>,
    catalog: Option<PluginCatalog>,
    list_error: Option<String>,
    catalog_loading: bool,
    search: Entity<InputState>,
    sort: PluginSort,
    installed_only: bool,
    /// The plugin shown in the sheet.
    selected: Option<(PluginSelection, Entity<PluginDetails>)>,
    /// The newest installed-list request; an older one finishing late is
    /// dropped.
    list_request: u64,
}

impl PluginsPage {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| InputState::new(window, cx).placeholder("Search plugins…"));
        cx.subscribe(&search, |_, _, event: &InputEvent, cx| {
            if matches!(event, InputEvent::Change) {
                cx.notify();
            }
        })
        .detach();
        cx.observe_global::<Plugins>(|this, cx| this.refresh_installed(cx))
            .detach();
        let mut this = Self {
            installed: None,
            catalog: None,
            list_error: None,
            catalog_loading: false,
            search,
            sort: PluginSort::default(),
            installed_only: false,
            selected: None,
            list_request: 0,
        };
        this.refresh_installed(cx);
        this.refresh_catalog(cx);
        this
    }

    fn plugins(&self) -> Vec<PluginListItem> {
        self.installed
            .as_ref()
            .map(|installed| merge_plugins(installed, self.catalog.as_ref()))
            .unwrap_or_default()
    }

    /// The lists changed: the sheet follows its plugin's latest state.
    fn lists_changed(&mut self, cx: &mut Context<Self>) {
        if let Some((selection, details)) = &self.selected {
            let plugin = resolve_selection(&self.plugins(), selection);
            details.update(cx, |details, cx| details.set_plugin(plugin, cx));
        }
        cx.notify();
    }

    #[cfg(test)]
    pub fn set_lists(
        &mut self,
        installed: InstalledPlugins,
        catalog: PluginCatalog,
        cx: &mut Context<Self>,
    ) {
        self.installed = Some(installed);
        self.catalog = Some(catalog);
        self.lists_changed(cx);
    }

    fn refresh_installed(&mut self, cx: &mut Context<Self>) {
        let Some(task) = Plugins::list(cx) else {
            return;
        };
        self.list_request += 1;
        let request = self.list_request;
        cx.spawn(async move |this, cx| {
            let result = task.await;
            this.update(cx, |this, cx| {
                if request != this.list_request {
                    return;
                }
                match result {
                    Ok(installed) => {
                        this.installed = Some(installed);
                        this.list_error = None;
                    }
                    Err(err) => {
                        this.list_error = Some(format!("Failed to load installed plugins: {err}"))
                    }
                }
                this.lists_changed(cx);
            })
            .ok();
        })
        .detach();
    }

    fn refresh_catalog(&mut self, cx: &mut Context<Self>) {
        let Some(task) = Plugins::catalog(cx) else {
            return;
        };
        self.catalog_loading = true;
        cx.notify();
        cx.spawn(async move |this, cx| {
            let result = task.await;
            this.update(cx, |this, cx| {
                this.catalog_loading = false;
                this.catalog = Some(match result {
                    Ok(catalog) => catalog,
                    Err(err) => PluginCatalog {
                        plugins: this.catalog.take().map(|c| c.plugins).unwrap_or_default(),
                        error: Some(format!("Failed to load plugin catalog: {err}")),
                    },
                });
                this.lists_changed(cx);
            })
            .ok();
        })
        .detach();
    }

    pub fn open_plugin(
        &mut self,
        plugin: &PluginListItem,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let selection = plugin.selection();
        let details = cx.new(|_| PluginDetails::new(plugin.clone()));
        cx.subscribe_in(&details, window, |this, _, event, window, cx| match event {
            PluginDetailsEvent::Changed => {
                this.selected = None;
                window.close_sheet(cx);
                this.refresh_installed(cx);
            }
            PluginDetailsEvent::Busy(_) => cx.notify(),
        })
        .detach();
        self.selected = Some((selection, details.clone()));
        let page = cx.entity().downgrade();
        window.open_sheet(cx, move |sheet, _, cx| {
            let busy = details.read(cx).is_busy();
            let page = page.clone();
            sheet
                .size(px(448.))
                .overlay_closable(!busy)
                .on_close(move |_, _, cx| {
                    page.update(cx, |page, cx| {
                        page.selected = None;
                        cx.notify();
                    })
                    .ok();
                })
                .child(details.clone())
        });
        cx.notify();
    }

    #[cfg(test)]
    pub fn selected(&self) -> Option<&Entity<PluginDetails>> {
        self.selected.as_ref().map(|(_, details)| details)
    }

    fn card(
        &self,
        plugin: &PluginListItem,
        theme: &ResolvedTheme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let installed = plugin.installed.as_ref();
        let status = installed.map(|installed| {
            if installed.update_version.is_some() {
                "Update available"
            } else {
                "Installed"
            }
        });
        let error = installed.and_then(|installed| installed.error.clone());
        let (border, hover) = (color(theme, "border"), color(theme, "text.muted"));
        let open = plugin.clone();
        let selector = format!("plugin-card:{}", plugin.id);
        v_flex()
            .id(SharedString::from(selector.clone()))
            .debug_selector(move || selector)
            .w_full()
            .min_w_0()
            .gap_3()
            .p_4()
            .rounded(radius(theme, 1.4))
            .border_1()
            .border_color(border)
            .hover(move |style| style.border_color(hover))
            .child(
                div()
                    .truncate()
                    .text_size(text_size(theme, "sm"))
                    .when_some(Role::Heading.weight(theme), |this, weight| {
                        this.font_weight(weight)
                    })
                    .child(Role::Heading.text(theme, &plugin.name)),
            )
            .when(
                !plugin.contributions.is_empty() || status.is_some(),
                |this| {
                    this.child(
                        h_flex()
                            .flex_wrap()
                            .gap_1p5()
                            .children(
                                plugin
                                    .contributions
                                    .iter()
                                    .map(|kind| badge(theme, contribution_label(*kind), false)),
                            )
                            .children(status.map(|status| badge(theme, status, true))),
                    )
                },
            )
            .children(plugin.description.clone().map(|description| {
                muted_text(theme, "sm", description)
                    .text_ellipsis()
                    .line_clamp(2)
            }))
            .child(muted_text(theme, "xs", format!("by {}", plugin.owner())).truncate())
            .children(error.map(|error| {
                div()
                    .text_ellipsis()
                    .line_clamp(2)
                    .text_size(text_size(theme, "xs"))
                    .text_color(color(theme, "error"))
                    .child(error)
            }))
            .on_click(cx.listener(move |this, _, window, cx| this.open_plugin(&open, window, cx)))
    }
}

impl Render for PluginsPage {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let search = self.search.read(cx).value().to_string();
        let plugins = self.plugins();
        let visible = visible_plugins(&plugins, &search, self.installed_only, self.sort);
        let sort = self.sort;
        let page = cx.entity().downgrade();
        let sort_option = |option: PluginSort| {
            let page = page.clone();
            SelectOption::new(option.label(), sort == option, move |_, cx| {
                page.update(cx, |page, cx| {
                    page.sort = option;
                    cx.notify();
                })
                .ok();
            })
        };
        let retry = |id: &'static str, disabled: bool| {
            Button::new(id)
                .ghost()
                .disabled(disabled)
                .label(Role::Button.text(&theme, "Retry"))
        };
        let catalog_error = self
            .catalog
            .as_ref()
            .and_then(|catalog| catalog.error.clone());
        let empty_text = if !search.is_empty() {
            "No plugins match your search."
        } else if self.installed_only {
            "No plugins installed yet."
        } else {
            "No plugins listed yet."
        };
        let empty = (self.installed.is_some()
            && self.catalog.is_some()
            && catalog_error.is_none()
            && visible.is_empty())
        .then_some(empty_text);
        let cards: Vec<_> = visible
            .iter()
            .map(|plugin| self.card(plugin, &theme, cx))
            .collect();

        v_flex()
            .size_full()
            .min_w_0()
            .child(
                v_flex()
                    .flex_none()
                    .gap_3()
                    .p_4()
                    .pt_7()
                    .border_b_1()
                    .border_color(color(&theme, "border"))
                    .child(
                        h_flex()
                            .gap_2()
                            .child(div().flex_1().child(Input::new(&self.search)))
                            .child(div().w(px(144.)).child(select(
                                "plugin-sort",
                                &theme,
                                vec![
                                    sort_option(PluginSort::Stars),
                                    sort_option(PluginSort::Latest),
                                ],
                            ))),
                    )
                    .child(
                        h_flex()
                            .justify_between()
                            .gap_4()
                            .child(muted_text(
                                &theme,
                                "sm",
                                if self.installed.is_some() {
                                    plugin_count(visible.len(), plugins.len())
                                } else {
                                    String::new()
                                },
                            ))
                            .child(checkbox(
                                "installed-only",
                                &theme,
                                self.installed_only,
                                "Installed only",
                                {
                                    let page = page.clone();
                                    move |checked, _, cx| {
                                        page.update(cx, |page, cx| {
                                            page.installed_only = checked;
                                            cx.notify();
                                        })
                                        .ok();
                                    }
                                },
                            )),
                    ),
            )
            .child(
                content("plugins-page")
                    .gap_3()
                    .children(self.list_error.clone().map(|error| {
                        h_flex().gap_2().child(error_text(&theme, error)).child(
                            retry("retry-installed", false)
                                .on_click(cx.listener(|this, _, _, cx| this.refresh_installed(cx))),
                        )
                    }))
                    .children(
                        self.installed
                            .iter()
                            .flat_map(|installed| installed.errors.clone())
                            .map(|error| error_text(&theme, error)),
                    )
                    .children(catalog_error.map(|error| {
                        h_flex().gap_2().child(error_text(&theme, error)).child(
                            retry("retry-catalog", self.catalog_loading)
                                .loading(self.catalog_loading)
                                .on_click(cx.listener(|this, _, _, cx| this.refresh_catalog(cx))),
                        )
                    }))
                    .when(
                        self.installed.is_none() && self.list_error.is_none(),
                        |this| this.child(muted_text(&theme, "sm", "Loading plugins…")),
                    )
                    .children(empty.map(|text| muted_text(&theme, "sm", text)))
                    .when(!cards.is_empty(), |this| {
                        this.child(div().grid().grid_cols(2).gap_3().children(cards))
                    }),
            )
    }
}
