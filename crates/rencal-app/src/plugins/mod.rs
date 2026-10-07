//! Plugins (GPUI_PORT_PLAN.md Phase 5): the `Plugins` global over
//! `rencal_core`'s `PluginManager` (installed list, catalog, install,
//! uninstall), the merged list the UI shows (`list`), the details shared by
//! Settings › Plugins and the deep-link dialog (`details`), and the
//! `rencal://plugin/install` dialog (`install_dialog`).

pub mod details;
pub mod install_dialog;
pub mod list;

use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;

use gpui_kit::{App, BorrowAppContext, Global, Image, ImageFormat, ImageSource};
use rencal_core::error::CoreError;
use rencal_core::plugins::{InstalledPlugins, PluginCatalog, PluginManager};
use tokio::task::JoinHandle;

use crate::runtime::Tokio;
use crate::ui::image::image_source;

/// The plugin manager, and a revision bumped whenever the plugin
/// declarations were reconciled (an install, uninstall or hand edit), which
/// the plugin lists observe to refresh.
pub struct Plugins {
    manager: Option<PluginManager>,
    pub revision: u64,
}

impl Global for Plugins {}

impl Plugins {
    /// `None` in tests: every operation then does nothing.
    pub fn init(manager: Option<PluginManager>, cx: &mut App) {
        cx.set_global(Self {
            manager,
            revision: 0,
        });
    }

    pub fn reconciled(cx: &mut App) {
        if cx.has_global::<Self>() {
            cx.update_global::<Self, _>(|plugins, _| plugins.revision += 1);
        }
    }

    fn run<F, R>(cx: &App, operation: impl FnOnce(PluginManager) -> F) -> Option<JoinHandle<R>>
    where
        F: Future<Output = R> + Send + 'static,
        R: Send + 'static,
    {
        let manager = cx.try_global::<Self>()?.manager.clone()?;
        Some(Tokio::handle(cx).spawn(operation(manager)))
    }

    pub fn list(cx: &App) -> Option<JoinHandle<InstalledPlugins>> {
        Self::run(cx, |manager| async move { manager.list().await })
    }

    pub fn catalog(cx: &App) -> Option<JoinHandle<PluginCatalog>> {
        Self::run(cx, |manager| async move { manager.catalog().await })
    }

    /// Installs (or updates, or repairs) the plugin at GitHub `repo`.
    pub fn install(repo: String, cx: &App) -> Option<JoinHandle<Result<(), String>>> {
        Self::run(cx, |manager| async move {
            manager.install(&repo).await.map(|_| ()).map_err(|err| {
                CoreError::from(err)
                    .context(format!("Plugin [{repo}]"))
                    .to_string()
            })
        })
    }

    pub fn uninstall(id: String, cx: &App) -> Option<JoinHandle<Result<(), String>>> {
        Self::run(cx, |manager| async move {
            manager.uninstall(&id).await.map_err(|err| {
                CoreError::from(err)
                    .context(format!("Plugin [{id}]"))
                    .to_string()
            })
        })
    }
}

/// A plugin preview image, as far as it has loaded.
#[derive(Clone)]
pub enum Preview {
    Loading,
    Loaded(ImageSource),
    Failed,
}

/// Catalog previews, fetched once per run (GPUI has no HTTP client of its
/// own on the desktop).
#[derive(Default)]
struct Previews(HashMap<String, Preview>);

impl Global for Previews {}

/// The preview at `url`: a local plugin's `data:` URL, or a catalog image
/// fetched on first use (windows refresh when it arrives).
pub fn preview(url: &str, cx: &mut App) -> Preview {
    if url.starts_with("data:") {
        return image_source(url).map_or(Preview::Failed, Preview::Loaded);
    }
    if let Some(cached) = cx.default_global::<Previews>().0.get(url) {
        return cached.clone();
    }
    cx.default_global::<Previews>()
        .0
        .insert(url.to_owned(), Preview::Loading);
    let owned = url.to_owned();
    let fetch =
        Tokio::handle(cx).spawn(async move { rencal_core::plugins::fetch_preview(&owned).await });
    let url = url.to_owned();
    cx.spawn(async move |cx| {
        let image = match fetch.await {
            Ok(Ok(bytes)) => Preview::Loaded(ImageSource::Image(Arc::new(Image::from_bytes(
                ImageFormat::Png,
                bytes,
            )))),
            Ok(Err(err)) => {
                log::warn!("plugin preview {url}: {err}");
                Preview::Failed
            }
            Err(_) => Preview::Failed,
        };
        cx.update(|cx| {
            cx.default_global::<Previews>().0.insert(url, image);
            cx.refresh_windows();
        });
    })
    .detach();
    Preview::Loading
}
