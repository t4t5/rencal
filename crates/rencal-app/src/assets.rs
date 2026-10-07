//! Embedded assets: renCal's own icons (`assets/icons/*.svg`, converted from
//! the old `src/icons/*.tsx`) layered over gpui-kit's asset bundle.
//! Monochrome icons draw tinted with the text colour (`Icon::new(RenIcon::…)`).
//! Multi-colour artwork (provider logos, the logomark) lives in
//! `assets/images/` and draws untinted through `img(RenImage::….path())`.

use std::borrow::Cow;

use gpui_kit::component::IconNamed;
use gpui_kit::{AssetSource, Result, SharedString};

macro_rules! icons {
    ($($variant:ident => $file:literal),* $(,)?) => {
        /// renCal's icons.
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum RenIcon {
            $($variant,)*
        }

        impl IconNamed for RenIcon {
            fn path(self) -> SharedString {
                match self {
                    $(Self::$variant => concat!("icons/rencal/", $file, ".svg"),)*
                }
                .into()
            }
        }

        const ICONS: &[(&str, &[u8])] = &[
            $((
                concat!("icons/rencal/", $file, ".svg"),
                include_bytes!(concat!("../assets/icons/", $file, ".svg")),
            ),)*
        ];
    };
}

icons! {
    ArrowRight => "arrow-right",
    ArrowUpRight => "arrow-up-right",
    Bell => "bell",
    Calendar => "calendar",
    Check => "check",
    ChevronDown => "chevron-down",
    ChevronRight => "chevron-right",
    ChevronUp => "chevron-up",
    Clock => "clock",
    Close => "close",
    Cloud => "cloud",
    CloudCheck => "cloud-check",
    CloudWarning => "cloud-warning",
    Globe => "globe",
    Link => "link",
    MoreHoriz => "more-horiz",
    Palette => "palette",
    Plugin => "plugin",
    Plus => "plus",
    ProviderApple => "provider-apple",
    Pushpin => "pushpin",
    QuestionMark => "question-mark",
    QuestionMarkCircle => "question-mark-circle",
    Repeat => "repeat",
    Rss => "rss",
    Search => "search",
    Settings => "settings",
    Sidebar => "sidebar",
    Sync => "sync",
    Undo => "undo",
    User => "user",
    Video => "video",
}

macro_rules! images {
    ($($variant:ident => $file:literal),* $(,)?) => {
        /// renCal's multi-colour images.
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum RenImage {
            $($variant,)*
        }

        impl RenImage {
            pub fn path(self) -> &'static str {
                match self {
                    $(Self::$variant => concat!("images/rencal/", $file, ".svg"),)*
                }
            }
        }

        const IMAGES: &[(&str, &[u8])] = &[
            $((
                concat!("images/rencal/", $file, ".svg"),
                include_bytes!(concat!("../assets/images/", $file, ".svg")),
            ),)*
        ];
    };
}

images! {
    Logomark => "rencal-logomark",
    ProviderEtesync => "provider-etesync",
    ProviderGoogle => "provider-google",
    ProviderMicrosoft => "provider-microsoft",
    ProviderProton => "provider-proton",
}

pub struct Assets;

fn embedded() -> impl Iterator<Item = &'static (&'static str, &'static [u8])> {
    ICONS.iter().chain(IMAGES)
}

impl AssetSource for Assets {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        match embedded().find(|(name, _)| *name == path) {
            Some((_, data)) => Ok(Some(Cow::Borrowed(data))),
            None => gpui_kit::assets::Assets.load(path),
        }
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        let mut names = gpui_kit::assets::Assets.list(path)?;
        names.extend(
            embedded()
                .filter(|(name, _)| name.starts_with(path))
                .map(|(name, _)| SharedString::from(*name)),
        );
        Ok(names)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_icon_loads_and_is_an_svg() {
        for (name, _) in embedded() {
            let data = Assets.load(name).unwrap().unwrap();
            let text = std::str::from_utf8(&data).unwrap();
            assert!(
                text.starts_with("<svg") && text.contains("viewBox"),
                "{name}"
            );
        }
        assert_eq!(RenIcon::Cloud.path(), "icons/rencal/cloud.svg");
        assert_eq!(
            RenImage::ProviderGoogle.path(),
            "images/rencal/provider-google.svg"
        );
    }
}
