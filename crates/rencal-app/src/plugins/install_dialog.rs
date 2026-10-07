//! `rencal://plugin/install` links (port of `PluginInstallDialog.tsx`): the
//! main window shows the linked plugin's details so it can be installed in
//! place. Links wait in the backend's inbox while an action runs, so a new
//! one can't swap the dialog mid-install.

use gpui_kit::component::WindowExt;
use gpui_kit::{App, AppContext, Entity, Global, ParentElement, Window, px};

use super::Plugins;
use super::details::{PluginDetails, PluginDetailsEvent};
use super::list::{PluginSelection, merge_plugins, resolve_selection};
use crate::backend::Backend;
use crate::editing::with_main_window;

#[derive(Default)]
struct InstallDialog {
    busy: bool,
}

impl Global for InstallDialog {}

/// Shows the newest queued install link, unless an action is running.
pub fn drain(cx: &mut App) {
    if cx
        .try_global::<InstallDialog>()
        .is_some_and(|dialog| dialog.busy)
    {
        return;
    }
    let Some(link) =
        Backend::try_state(cx).and_then(|state| state.deep_links.take_plugin_install())
    else {
        return;
    };
    log::info!("plugin install link: {}", link.repo);
    let selection = PluginSelection {
        id: None,
        repo: Some(link.repo),
    };
    with_main_window(cx, move |window, cx| open(selection, window, cx));
}

fn open(selection: PluginSelection, window: &mut Window, cx: &mut App) {
    let details = cx.new(|_| PluginDetails::loading(resolve_selection(&[], &selection)));
    load(selection, details.clone(), cx);
    cx.subscribe(&details, |_, event, cx| match event {
        PluginDetailsEvent::Changed => with_main_window(cx, |window, cx| window.close_dialog(cx)),
        PluginDetailsEvent::Busy(busy) => {
            cx.default_global::<InstallDialog>().busy = *busy;
            if !busy {
                drain(cx);
            }
        }
    })
    .detach();
    if window.has_active_dialog(cx) {
        window.close_dialog(cx);
    }
    window.open_dialog(cx, move |dialog, _, cx| {
        let busy = details.read(cx).is_busy();
        dialog
            .w(px(448.))
            .keyboard(!busy)
            .overlay_closable(!busy)
            .close_button(!busy)
            .child(details.clone())
    });
}

/// Fills in the plugin from the installed list and the catalog.
fn load(selection: PluginSelection, details: Entity<PluginDetails>, cx: &mut App) {
    let (Some(list), Some(catalog)) = (Plugins::list(cx), Plugins::catalog(cx)) else {
        return;
    };
    cx.spawn(async move |cx| {
        let loaded = match (list.await, catalog.await) {
            (Ok(list), Ok(catalog)) => Ok(merge_plugins(&list, Some(&catalog))),
            (Err(err), _) | (_, Err(err)) => Err(err.to_string()),
        };
        cx.update(|cx| {
            details.update(cx, |details, cx| match loaded {
                Ok(plugins) => details.set_plugin(resolve_selection(&plugins, &selection), cx),
                Err(err) => {
                    log::error!("could not load plugin details: {err}");
                    details.set_plugin(resolve_selection(&[], &selection), cx);
                    details.set_error(Some(format!("Failed to load plugin details: {err}")), cx);
                }
            })
        });
    })
    .detach();
}
