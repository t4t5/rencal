//! Embedded assets: renCal's own icons (`assets/icons/*.svg`, converted from
//! the old `src/icons/*.tsx`) layered over gpui-kit's asset bundle.
//! Monochrome icons draw tinted with the text colour (`Icon::new(RenIcon::…)`).

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
    Plus => "plus",
    Pushpin => "pushpin",
    QuestionMark => "question-mark",
    QuestionMarkCircle => "question-mark-circle",
    Repeat => "repeat",
    Search => "search",
    Settings => "settings",
    Sidebar => "sidebar",
    Sync => "sync",
    Undo => "undo",
    User => "user",
    Video => "video",
}

pub struct Assets;

impl AssetSource for Assets {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        match ICONS.iter().find(|(name, _)| *name == path) {
            Some((_, data)) => Ok(Some(Cow::Borrowed(data))),
            None => gpui_kit::assets::Assets.load(path),
        }
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        let mut names = gpui_kit::assets::Assets.list(path)?;
        names.extend(
            ICONS
                .iter()
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
        for (name, _) in ICONS {
            let data = Assets.load(name).unwrap().unwrap();
            let text = std::str::from_utf8(&data).unwrap();
            assert!(
                text.starts_with("<svg") && text.contains("viewBox"),
                "{name}"
            );
        }
        assert_eq!(RenIcon::Cloud.path(), "icons/rencal/cloud.svg");
    }
}
