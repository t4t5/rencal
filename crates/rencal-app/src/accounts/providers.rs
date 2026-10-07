//! The caldir providers renCal can run (port of `useProviders` and
//! `lib/providers.ts`): their display names, icons and the order the connect
//! dialog lists them in.

use gpui_kit::component::Icon;
use gpui_kit::{AnyElement, App, Global, IntoElement, Pixels, Styled, img};
use rencal_core::state::ProviderInfo;

use crate::assets::{RenIcon, RenImage};
use crate::backend::Backend;
use crate::ui::image::image_source;
use crate::watchers::CaldirRevision;

/// The provider list, shared by every window.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Providers {
    pub list: Vec<ProviderInfo>,
    pub error: Option<String>,
    /// The newest load; an older one finishing late is dropped.
    generation: u64,
}

impl Global for Providers {}

impl Providers {
    pub fn global(cx: &App) -> &Self {
        cx.global::<Self>()
    }

    /// Installs the empty list and reloads it when the providers change
    /// (a provider plugin installed or removed).
    pub fn init(cx: &mut App) {
        cx.set_global(Self::default());
        let mut providers = cx.try_global::<CaldirRevision>().map(|r| r.providers);
        cx.observe_global::<CaldirRevision>(move |cx| {
            let revision = cx.global::<CaldirRevision>().providers;
            if providers != Some(revision) {
                providers = Some(revision);
                Self::load(cx);
            }
        })
        .detach();
    }

    /// Rescans the providers, so a binary installed on `PATH` shows up when
    /// a provider list opens.
    pub fn load(cx: &mut App) {
        let Some(task) = Backend::read(cx, rencal_core::caldir::list_providers) else {
            return;
        };
        let generation = {
            let providers = cx.default_global::<Self>();
            providers.generation += 1;
            providers.generation
        };
        cx.spawn(async move |cx| {
            let result = task.await;
            cx.update(|cx| {
                let providers = cx.default_global::<Self>();
                if providers.generation != generation {
                    return;
                }
                match result {
                    Ok(Ok(list)) => {
                        providers.list = list;
                        providers.error = None;
                    }
                    Ok(Err(err)) => providers.error = Some(err.to_string()),
                    Err(err) => providers.error = Some(format!("Failed to load providers: {err}")),
                }
            });
        })
        .detach();
    }

    pub fn find(&self, slug: Option<&str>) -> Option<&ProviderInfo> {
        let slug = slug?;
        self.list.iter().find(|provider| provider.slug == slug)
    }
}

/// A plugin's manifest name wins over renCal's built-in names.
pub fn display_name(slug: Option<&str>, info: Option<&ProviderInfo>) -> String {
    let Some(slug) = slug else {
        return "Unknown".into();
    };
    if let Some(name) = info.and_then(|info| info.name.clone()) {
        return name;
    }
    match slug {
        "google" => "Google".into(),
        "icloud" => "iCloud".into(),
        "outlook" => "Outlook".into(),
        "caldav" => "CalDAV".into(),
        _ => {
            let mut chars = slug.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().chain(chars).collect())
                .unwrap_or_default()
        }
    }
}

/// Webcal feeds are subscriptions, not accounts.
pub fn requires_account(slug: &str) -> bool {
    slug != "webcal"
}

const CORE_ACCOUNT_PROVIDERS: [&str; 3] = ["google", "icloud", "outlook"];
const FALLBACK_ACCOUNT_PROVIDER: &str = "caldav";

/// The core providers first, then discovered ones, then generic CalDAV.
pub fn order_account_providers(slugs: &[String]) -> Vec<String> {
    let has = |slug: &str| slugs.iter().any(|s| s == slug);
    CORE_ACCOUNT_PROVIDERS
        .iter()
        .filter(|slug| has(slug))
        .map(|slug| (*slug).to_owned())
        .chain(
            slugs
                .iter()
                .filter(|slug| {
                    !CORE_ACCOUNT_PROVIDERS.contains(&slug.as_str())
                        && *slug != FALLBACK_ACCOUNT_PROVIDER
                })
                .cloned(),
        )
        .chain(has(FALLBACK_ACCOUNT_PROVIDER).then(|| FALLBACK_ACCOUNT_PROVIDER.to_owned()))
        .collect()
}

/// The provider's icon: a plugin's own icon wins over renCal's built-in
/// ones; `fallback` otherwise, or nothing.
pub fn provider_icon(
    slug: Option<&str>,
    info: Option<&ProviderInfo>,
    fallback: Option<RenIcon>,
    size: Pixels,
) -> Option<AnyElement> {
    if let Some(source) = info
        .and_then(|info| info.icon.as_deref())
        .and_then(image_source)
    {
        return Some(img(source).size(size).flex_none().into_any_element());
    }
    let image = match slug {
        Some("google") => Some(RenImage::ProviderGoogle),
        Some("outlook") => Some(RenImage::ProviderMicrosoft),
        Some("proton") => Some(RenImage::ProviderProton),
        Some("etesync") => Some(RenImage::ProviderEtesync),
        _ => None,
    };
    if let Some(image) = image {
        return Some(img(image.path()).size(size).flex_none().into_any_element());
    }
    let icon = match slug {
        Some("icloud") => Some(RenIcon::ProviderApple),
        _ => fallback,
    };
    icon.map(|icon| Icon::new(icon).size(size).into_any_element())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slugs(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| (*name).to_owned()).collect()
    }

    #[test]
    fn orders_core_then_discovered_then_caldav() {
        assert_eq!(
            order_account_providers(&slugs(&["caldav", "proton", "google", "outlook"])),
            slugs(&["google", "outlook", "proton", "caldav"])
        );
    }

    #[test]
    fn names_prefer_the_plugin_manifest() {
        assert_eq!(display_name(Some("icloud"), None), "iCloud");
        assert_eq!(display_name(Some("tuta"), None), "Tuta");
        assert_eq!(display_name(None, None), "Unknown");
        assert!(!requires_account("webcal"));
    }
}
