//! Shared styling for renCal's own components: theme tokens as GPUI values,
//! the resolved font families, typography roles and event paint. Components
//! read the theme through these helpers (and `cx.ren_theme()`), never through
//! gpui-kit's theme.

pub mod anchors;
pub mod event_paint;
pub mod image;
pub mod kbd;

use gpui_kit::{App, FontWeight, Global, Hsla, Pixels, SharedString, px};
use rencal_theme::ResolvedTheme;

use crate::theme::hsla;

/// The theme's font lists resolved to families GPUI can draw (see
/// `theme::bridge::font_family`). Set with every theme change.
#[derive(Clone, Debug, PartialEq)]
pub struct Fonts {
    pub body: SharedString,
    pub mono: SharedString,
    pub numerical: SharedString,
    pub heading: SharedString,
    pub button: SharedString,
}

impl Global for Fonts {}

pub fn fonts(cx: &App) -> &Fonts {
    cx.global::<Fonts>()
}

/// A colour token.
pub fn color(theme: &ResolvedTheme, key: &str) -> Hsla {
    hsla(theme.color(key))
}

/// A px metric token.
pub fn metric(theme: &ResolvedTheme, key: &str) -> Pixels {
    px(theme.number(key) as f32)
}

/// A step of the type scale (`2xs`, `xs`, `sm`, `base`, `lg`, …).
pub fn text_size(theme: &ResolvedTheme, step: &str) -> Pixels {
    metric(theme, &format!("text.scale.{step}.size"))
}

pub fn line_height(theme: &ResolvedTheme, step: &str) -> Pixels {
    metric(theme, &format!("text.scale.{step}.line_height"))
}

/// `radius` scaled like the old `rounded-*` steps (`xs` 0.4, `sm` 0.6, …).
pub fn radius(theme: &ResolvedTheme, factor: f64) -> Pixels {
    px(theme.radius_step(factor).max(0.0) as f32)
}

/// A fully round corner, unless the theme is square (`radius.circle`).
pub fn radius_circle(theme: &ResolvedTheme) -> Pixels {
    metric(theme, "radius.circle")
}

/// The old `[data-typography]` roles.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Heading,
    Button,
    Numerical,
}

impl Role {
    fn key(self) -> &'static str {
        match self {
            Role::Heading => "heading",
            Role::Button => "button",
            Role::Numerical => "numerical",
        }
    }

    pub fn family(self, cx: &App) -> SharedString {
        let fonts = fonts(cx);
        match self {
            Role::Heading => fonts.heading.clone(),
            Role::Button => fonts.button.clone(),
            Role::Numerical => fonts.numerical.clone(),
        }
    }

    /// `text` with the role's text transform (GPUI has none).
    pub fn text(self, theme: &ResolvedTheme, text: &str) -> SharedString {
        theme
            .transform(&format!("typography.{}.transform", self.key()))
            .apply(text)
            .into()
    }

    /// The role's weight, when the theme sets one.
    pub fn weight(self, theme: &ResolvedTheme) -> Option<FontWeight> {
        theme
            .optional_number(&format!("typography.{}.weight", self.key()))
            .map(|weight| FontWeight(weight as f32))
    }
}

/// The colours the calendar views share, read once per render.
#[derive(Clone, Copy, Debug)]
pub struct Palette {
    pub background: Hsla,
    pub muted: Hsla,
    pub border: Hsla,
    pub hover: Hsla,
    pub selected: Hsla,
    pub selected_text: Hsla,
    pub highlight: Hsla,
    pub weekend: Hsla,
    pub today: Hsla,
    pub today_text: Hsla,
    pub sidebar: Hsla,
    pub brand: Hsla,
}

impl Palette {
    pub fn new(theme: &ResolvedTheme) -> Self {
        Self {
            background: color(theme, "background"),
            muted: color(theme, "text.muted"),
            border: color(theme, "border"),
            hover: color(theme, "ghost_element.hover"),
            selected: color(theme, "element.selected"),
            selected_text: color(theme, "element.selected.text"),
            highlight: color(theme, "element.highlight"),
            weekend: color(theme, "weekend.background"),
            today: color(theme, "today"),
            today_text: color(theme, "today.text"),
            sidebar: color(theme, "sidebar.background"),
            brand: color(theme, "brand"),
        }
    }
}

/// An event's title, or a muted "Untitled event".
pub fn event_title(summary: &str, muted: Hsla) -> gpui_kit::AnyElement {
    use gpui_kit::{IntoElement, ParentElement, Styled, div};
    if summary.is_empty() {
        div()
            .text_color(muted)
            .child("Untitled event")
            .into_any_element()
    } else {
        SharedString::from(summary.to_owned()).into_any_element()
    }
}

/// An error line under a form or list (`text-sm text-destructive`).
pub fn error_text(theme: &ResolvedTheme, message: impl Into<SharedString>) -> gpui_kit::Div {
    use gpui_kit::{ParentElement, Styled, div};
    div()
        .text_size(text_size(theme, "sm"))
        .text_color(color(theme, "error"))
        .child(message.into())
}

/// Muted explanatory text (`text-<step> text-muted-foreground`).
pub fn muted_text(
    theme: &ResolvedTheme,
    step: &str,
    text: impl Into<SharedString>,
) -> gpui_kit::Div {
    use gpui_kit::{ParentElement, Styled, div};
    div()
        .text_size(text_size(theme, step))
        .text_color(color(theme, "text.muted"))
        .child(text.into())
}
