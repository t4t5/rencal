//! The token catalogue: every themeable key, its type, its legacy CSS
//! variable, and how it is derived when a theme leaves it unset.
//!
//! The derivations restate the `:root, [data-theme]` baseline of the old
//! `src/global.css`; the parity test holds them to the webview's output.

use crate::color::Rgba;
use crate::value::{Kind, TextTransform, Value};

/// How a token gets its value when the theme does not set it.
#[derive(Clone, Copy, Debug)]
pub enum Derive {
    /// A primitive: taken from the baseline theme of the same appearance.
    Baseline,
    /// Unset unless the theme sets it; consumers fall back to their own default.
    Unset,
    /// Same value as another token.
    Ref(&'static str),
    Const(Const),
    /// CSS `color-mix(in srgb, a pct, b)`.
    Mix {
        a: Src,
        pct: Pct,
        b: Src,
    },
    /// Differs by appearance (the old `[data-appearance="light"]` rules).
    ByAppearance {
        dark: &'static Derive,
        light: &'static Derive,
    },
    /// Another pixel token plus a constant.
    Offset(&'static str, f64),
    /// Another pixel token times a constant.
    Scale(&'static str, f64),
    /// Anything else (a `max()`, a two-token `calc()`).
    Custom(fn(&mut dyn Lookup) -> Result<Option<Value>, crate::ResolveError>),
}

#[derive(Clone, Copy, Debug)]
pub enum Const {
    Color(Rgba),
    Px(f64),
    Transform(TextTransform),
}

impl Const {
    pub(crate) fn value(self) -> Value {
        match self {
            Const::Color(c) => Value::Color(c),
            Const::Px(v) => Value::Px(v),
            Const::Transform(t) => Value::Transform(t),
        }
    }
}

/// A colour operand of a mix.
#[derive(Clone, Copy, Debug)]
pub enum Src {
    Tok(&'static str),
    Lit(Rgba),
}

/// A mix percentage.
#[derive(Clone, Copy, Debug)]
pub enum Pct {
    Fixed(f64),
    /// `n × surface.tint_step`.
    Steps(f64),
}

/// Read access to resolved tokens for [`Derive::Custom`] rules.
pub trait Lookup {
    fn get(&mut self, key: &'static str) -> Result<Option<Value>, crate::ResolveError>;

    fn px(&mut self, key: &'static str) -> Result<f64, crate::ResolveError> {
        Ok(self.get(key)?.and_then(|v| v.as_number()).unwrap_or(0.0))
    }
}

#[derive(Debug)]
pub struct TokenDef {
    pub key: &'static str,
    pub kind: Kind,
    pub derive: Derive,
    /// The CSS custom property this replaces, without the leading `--`.
    pub css: Option<&'static str>,
}

const T: Src = Src::Lit(Rgba::TRANSPARENT);
const W: Src = Src::Lit(Rgba::WHITE);
const B: Src = Src::Lit(Rgba::BLACK);
const TINT: Src = Src::Tok("surface.tint");

const fn tint_over(steps: f64, base: Src) -> Derive {
    Derive::Mix {
        a: TINT,
        pct: Pct::Steps(steps),
        b: base,
    }
}

const fn color(key: &'static str, css: &'static str, derive: Derive) -> TokenDef {
    TokenDef {
        key,
        kind: Kind::Color,
        derive,
        css: Some(css),
    }
}

const fn px(key: &'static str, css: &'static str, derive: Derive) -> TokenDef {
    TokenDef {
        key,
        kind: Kind::Px,
        derive,
        css: Some(css),
    }
}

const fn new(key: &'static str, kind: Kind, derive: Derive) -> TokenDef {
    TokenDef {
        key,
        kind,
        derive,
        css: None,
    }
}

const fn with_css(key: &'static str, kind: Kind, css: &'static str, derive: Derive) -> TokenDef {
    TokenDef {
        key,
        kind,
        derive,
        css: Some(css),
    }
}

const DARK_TOAST: Derive = Derive::Ref("elevated_surface.background");
const LIGHT_TOAST: Derive = Derive::Ref("text");
const DARK_TOAST_TEXT: Derive = Derive::Ref("elevated_surface.text");
const LIGHT_TOAST_TEXT: Derive = Derive::Ref("background");

fn trailing_inset(cx: &mut dyn Lookup) -> Result<Option<Value>, crate::ResolveError> {
    let height = cx.px("control.height")?;
    let xs = cx.px("control.height.xs")?;
    Ok(Some(Value::Px((height - xs) / 2.0 - 1.0)))
}

fn nav_padding(cx: &mut dyn Lookup) -> Result<Option<Value>, crate::ResolveError> {
    // Rows keep 8px inside the highlight so their text lands on layout.padding.
    Ok(Some(Value::Px((cx.px("layout.padding")? - 8.0).max(0.0))))
}

macro_rules! scale_steps {
    ($($step:literal),*) => {
        [$(
            px(concat!("text.scale.", $step, ".size"), concat!("text-", $step), Derive::Baseline),
            px(concat!("text.scale.", $step, ".line_height"), concat!("text-", $step, "--line-height"), Derive::Baseline),
        )*]
    };
}

macro_rules! role {
    ($role:literal, $step:literal) => {
        [
            px(
                concat!("typography.", $role, ".size"),
                concat!("text-", $role),
                Derive::Ref(concat!("text.scale.", $step, ".size")),
            ),
            px(
                concat!("typography.", $role, ".line_height"),
                concat!("text-", $role, "--line-height"),
                Derive::Ref(concat!("text.scale.", $step, ".line_height")),
            ),
            with_css(
                concat!("typography.", $role, ".weight"),
                Kind::Weight,
                concat!("text-", $role, "--font-weight"),
                Derive::Unset,
            ),
            with_css(
                concat!("typography.", $role, ".transform"),
                Kind::Transform,
                concat!("text-", $role, "--transform"),
                Derive::Baseline,
            ),
        ]
    };
}

const BASE: &[TokenDef] = &[
    // Primitives
    color("background", "background", Derive::Baseline),
    color("text", "foreground", Derive::Baseline),
    color("surface.tint", "surface-tint", Derive::Ref("text")),
    with_css(
        "surface.tint_step",
        Kind::Fraction,
        "surface-tint-step",
        Derive::Baseline,
    ),
    color("primary", "primary", Derive::Baseline),
    // Text
    color(
        "text.muted",
        "muted-foreground",
        Derive::Mix {
            a: Src::Tok("text"),
            pct: Pct::Fixed(0.5),
            b: T,
        },
    ),
    color(
        "text.placeholder",
        "placeholder-foreground",
        Derive::Ref("text.muted"),
    ),
    // Surfaces
    color(
        "surface.background",
        "card",
        tint_over(1.0, Src::Tok("background")),
    ),
    color("surface.text", "card-foreground", Derive::Ref("text")),
    color(
        "surface.text.muted",
        "card-muted-foreground",
        Derive::Ref("text.muted"),
    ),
    color(
        "elevated_surface.background",
        "popover",
        tint_over(1.0, Src::Tok("background")),
    ),
    color(
        "elevated_surface.text",
        "popover-foreground",
        Derive::Ref("text"),
    ),
    color(
        "elevated_surface.text.muted",
        "popover-muted-foreground",
        Derive::Ref("text.muted"),
    ),
    color("sidebar.background", "sidebar", Derive::Ref("background")),
    color(
        "tooltip.background",
        "tooltip",
        Derive::Mix {
            a: TINT,
            pct: Pct::Fixed(0.15),
            b: Src::Tok("background"),
        },
    ),
    color("tooltip.text", "tooltip-foreground", Derive::Ref("text")),
    color(
        "tooltip.text.muted",
        "tooltip-muted-foreground",
        Derive::Ref("text.muted"),
    ),
    color(
        "toast.background",
        "toast",
        Derive::ByAppearance {
            dark: &DARK_TOAST,
            light: &LIGHT_TOAST,
        },
    ),
    color(
        "toast.text",
        "toast-foreground",
        Derive::ByAppearance {
            dark: &DARK_TOAST_TEXT,
            light: &LIGHT_TOAST_TEXT,
        },
    ),
    color(
        "toast.text.muted",
        "toast-muted-foreground",
        Derive::Mix {
            a: Src::Tok("toast.text"),
            pct: Pct::Fixed(0.6),
            b: T,
        },
    ),
    color(
        "overlay",
        "overlay",
        Derive::Const(Const::Color(Rgba::new(0.0, 0.0, 0.0, 0.5))),
    ),
    // Border
    color("border", "border", tint_over(3.0, T)),
    color("border.input", "input", tint_over(4.0, T)),
    color("border.focused", "ring", Derive::Baseline),
    color(
        "button.border",
        "button-border",
        Derive::Const(Const::Color(Rgba::TRANSPARENT)),
    ),
    // Element
    color("ghost_element.hover", "hover", tint_over(1.0, T)),
    color("element.background", "secondary", tint_over(1.0, T)),
    color(
        "element.hover",
        "secondary-hover",
        tint_over(1.0, Src::Tok("element.background")),
    ),
    color("element.text", "secondary-foreground", Derive::Ref("text")),
    color(
        "element.text.muted",
        "secondary-muted-foreground",
        Derive::Ref("text.muted"),
    ),
    color("element.highlight", "accent", tint_over(3.0, T)),
    color(
        "element.highlight.text",
        "accent-foreground",
        Derive::Ref("text"),
    ),
    color(
        "element.highlight.text.muted",
        "accent-muted-foreground",
        Derive::Ref("text.muted"),
    ),
    color("element.selected", "selected", tint_over(4.0, T)),
    color(
        "element.selected.text",
        "selected-foreground",
        Derive::Ref("text"),
    ),
    color(
        "element.selected.text.muted",
        "selected-muted-foreground",
        Derive::Ref("text.muted"),
    ),
    color("element.muted", "muted", tint_over(1.0, T)),
    color(
        "control.active.background",
        "control-active-background",
        Derive::Ref("element.background"),
    ),
    color(
        "control.active.border",
        "control-active-border",
        Derive::Const(Const::Color(Rgba::TRANSPARENT)),
    ),
    // Accents
    color(
        "primary.hover",
        "primary-hover",
        Derive::Mix {
            a: W,
            pct: Pct::Steps(1.0),
            b: Src::Tok("primary"),
        },
    ),
    color(
        "primary.text",
        "primary-foreground",
        Derive::Ref("background"),
    ),
    color("today", "today", Derive::Ref("primary")),
    color(
        "today.text",
        "today-foreground",
        Derive::Ref("primary.text"),
    ),
    color("brand", "brand", Derive::Ref("primary")),
    color(
        "brand.hover",
        "brand-hover",
        Derive::Mix {
            a: W,
            pct: Pct::Steps(1.0),
            b: Src::Tok("brand"),
        },
    ),
    color("brand.text", "brand-foreground", Derive::Ref("background")),
    color(
        "weekend.background",
        "weekend",
        Derive::Ref("ghost_element.hover"),
    ),
    // Status
    color("success", "success", Derive::Baseline),
    color("warning", "warning", Derive::Baseline),
    color("error", "destructive", Derive::Baseline),
    color(
        "error.hover",
        "destructive-hover",
        Derive::Mix {
            a: W,
            pct: Pct::Steps(1.0),
            b: Src::Tok("error"),
        },
    ),
    color(
        "error.text",
        "destructive-foreground",
        Derive::Const(Const::Color(Rgba::WHITE)),
    ),
    // Events (§4.6)
    color("event.color", "event-color", Derive::Unset),
    color("event.background", "event-background", Derive::Unset),
    color("event.text", "event-foreground", Derive::Unset),
    color(
        "event.tint_surface",
        "event-tint-surface",
        Derive::Ref("background"),
    ),
    // Scrollbar and week grid (were WebKit pseudo-elements and --week-grid-background)
    new(
        "scrollbar.thumb.background",
        Kind::Color,
        Derive::Ref("border"),
    ),
    new(
        "scrollbar.thumb.hover_background",
        Kind::Color,
        Derive::Ref("border.input"),
    ),
    new(
        "scrollbar.track.background",
        Kind::Color,
        Derive::Const(Const::Color(Rgba::TRANSPARENT)),
    ),
    new("week_grid.hour_line", Kind::Color, Derive::Ref("border")),
    new(
        "week_grid.half_hour_line",
        Kind::Color,
        Derive::Const(Const::Color(Rgba::TRANSPARENT)),
    ),
    // Bevels for border_style bevel_* (§4.5)
    new(
        "bevel.highlight",
        Kind::Color,
        Derive::Mix {
            a: W,
            pct: Pct::Fixed(0.8),
            b: Src::Tok("background"),
        },
    ),
    new(
        "bevel.light",
        Kind::Color,
        Derive::Mix {
            a: W,
            pct: Pct::Fixed(0.4),
            b: Src::Tok("background"),
        },
    ),
    new(
        "bevel.shadow",
        Kind::Color,
        Derive::Mix {
            a: B,
            pct: Pct::Fixed(0.4),
            b: Src::Tok("background"),
        },
    ),
    new(
        "bevel.dark",
        Kind::Color,
        Derive::Mix {
            a: B,
            pct: Pct::Fixed(0.8),
            b: Src::Tok("background"),
        },
    ),
    // Metrics
    px("radius", "radius", Derive::Baseline),
    px(
        "radius.circle",
        "radius-circle",
        Derive::Scale("radius", 1000.0),
    ),
    px("control.height", "control-height", Derive::Baseline),
    px(
        "control.height.xs",
        "control-height-xs",
        Derive::Offset("control.height", -10.0),
    ),
    px(
        "control.height.sm",
        "control-height-sm",
        Derive::Offset("control.height", -2.0),
    ),
    px(
        "control.height.lg",
        "control-height-lg",
        Derive::Offset("control.height", 6.0),
    ),
    px(
        "control.padding_x",
        "control-padding-inline",
        Derive::Baseline,
    ),
    px("control.gap", "control-content-gap", Derive::Baseline),
    px("control.row_gap", "control-row-gap", Derive::Baseline),
    px(
        "control.leading_size",
        "control-leading-size",
        Derive::Baseline,
    ),
    px(
        "control.trailing_inset",
        "control-trailing-inset",
        Derive::Custom(trailing_inset),
    ),
    px("layout.padding", "layout-padding", Derive::Baseline),
    px(
        "nav.padding_x",
        "nav-padding-inline",
        Derive::Custom(nav_padding),
    ),
    px("month.padding_x", "month-padding-inline", Derive::Baseline),
    px("event.padding_x", "event-padding-inline", Derive::Baseline),
    px(
        "month.lane_height",
        "lane-height",
        Derive::Offset("text.scale.xs.line_height", 4.0),
    ),
    // 0 keeps scrollbars hidden, as `--scrollbar-width: none` did.
    px(
        "scrollbar.width",
        "scrollbar-width",
        Derive::Const(Const::Px(0.0)),
    ),
    // Fonts
    with_css("font.body", Kind::Fonts, "font-body", Derive::Baseline),
    with_css("font.mono", Kind::Fonts, "font-mono", Derive::Baseline),
    with_css(
        "font.heading",
        Kind::Fonts,
        "font-heading",
        Derive::Ref("font.mono"),
    ),
    with_css(
        "font.button",
        Kind::Fonts,
        "font-button",
        Derive::Ref("font.mono"),
    ),
    with_css(
        "font.numerical",
        Kind::Fonts,
        "font-numerical",
        Derive::Ref("font.mono"),
    ),
];

const SCALE: [TokenDef; 14] = scale_steps!("2xs", "xs", "sm", "base", "lg", "xl", "2xl");
const HEADING: [TokenDef; 4] = role!("heading", "lg");
const BUTTON: [TokenDef; 4] = role!("button", "sm");
const NUMERICAL: [TokenDef; 4] = role!("numerical", "xs");

/// Every token, in a stable order.
pub fn tokens() -> &'static [&'static TokenDef] {
    use std::sync::OnceLock;
    static ALL: OnceLock<Vec<&'static TokenDef>> = OnceLock::new();
    ALL.get_or_init(|| {
        BASE.iter()
            .chain(SCALE.iter())
            .chain(HEADING.iter())
            .chain(BUTTON.iter())
            .chain(NUMERICAL.iter())
            .collect()
    })
}

pub fn token(key: &str) -> Option<&'static TokenDef> {
    index_of(key).map(|i| tokens()[i])
}

pub(crate) fn index_of(key: &str) -> Option<usize> {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    static INDEX: OnceLock<HashMap<&'static str, usize>> = OnceLock::new();
    INDEX
        .get_or_init(|| {
            tokens()
                .iter()
                .enumerate()
                .map(|(i, t)| (t.key, i))
                .collect()
        })
        .get(key)
        .copied()
}

/// Component slots that accept style tokens (§4.5).
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Ord, PartialOrd)]
pub enum Slot {
    Button,
    ButtonPrimary,
    Control,
    Popover,
    Dialog,
    DialogTitleBar,
    Toast,
    TabsList,
    TabsTab,
    ToolbarMain,
    ToolbarSidebar,
    EventTimed,
    EventAllDay,
    MonthDay,
    MinicalDay,
    AgendaRow,
    Scrollbar,
    WeekGrid,
}

impl Slot {
    pub const ALL: [Slot; 18] = [
        Slot::Button,
        Slot::ButtonPrimary,
        Slot::Control,
        Slot::Popover,
        Slot::Dialog,
        Slot::DialogTitleBar,
        Slot::Toast,
        Slot::TabsList,
        Slot::TabsTab,
        Slot::ToolbarMain,
        Slot::ToolbarSidebar,
        Slot::EventTimed,
        Slot::EventAllDay,
        Slot::MonthDay,
        Slot::MinicalDay,
        Slot::AgendaRow,
        Slot::Scrollbar,
        Slot::WeekGrid,
    ];

    pub fn key(self) -> &'static str {
        match self {
            Slot::Button => "button",
            Slot::ButtonPrimary => "button.primary",
            Slot::Control => "control",
            Slot::Popover => "popover",
            Slot::Dialog => "dialog",
            Slot::DialogTitleBar => "dialog.title_bar",
            Slot::Toast => "toast",
            Slot::TabsList => "tabs.list",
            Slot::TabsTab => "tabs.tab",
            Slot::ToolbarMain => "toolbar.main",
            Slot::ToolbarSidebar => "toolbar.sidebar",
            Slot::EventTimed => "event.timed",
            Slot::EventAllDay => "event.all_day",
            Slot::MonthDay => "month.day",
            Slot::MinicalDay => "minical.day",
            Slot::AgendaRow => "agenda.row",
            Slot::Scrollbar => "scrollbar",
            Slot::WeekGrid => "week_grid",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Ord, PartialOrd)]
pub enum State {
    Hover,
    Active,
    Selected,
    Open,
    Today,
    Disabled,
}

impl State {
    pub const ALL: [State; 6] = [
        State::Hover,
        State::Active,
        State::Selected,
        State::Open,
        State::Today,
        State::Disabled,
    ];

    pub fn key(self) -> &'static str {
        match self {
            State::Hover => "hover",
            State::Active => "active",
            State::Selected => "selected",
            State::Open => "open",
            State::Today => "today",
            State::Disabled => "disabled",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Ord, PartialOrd)]
pub enum Prop {
    Fill,
    Text,
    Border,
    BorderWidth,
    BorderStyle,
    Shadow,
    Radius,
    TextShadow,
    Gap,
}

impl Prop {
    pub const ALL: [Prop; 9] = [
        Prop::Fill,
        Prop::Text,
        Prop::Border,
        Prop::BorderWidth,
        Prop::BorderStyle,
        Prop::Shadow,
        Prop::Radius,
        Prop::TextShadow,
        Prop::Gap,
    ];

    pub fn key(self) -> &'static str {
        match self {
            Prop::Fill => "fill",
            Prop::Text => "text",
            Prop::Border => "border",
            Prop::BorderWidth => "border_width",
            Prop::BorderStyle => "border_style",
            Prop::Shadow => "shadow",
            Prop::Radius => "radius",
            Prop::TextShadow => "text_shadow",
            Prop::Gap => "gap",
        }
    }

    pub fn kind(self) -> Kind {
        match self {
            Prop::Fill => Kind::Fill,
            Prop::Text | Prop::Border => Kind::Color,
            Prop::BorderWidth | Prop::Radius | Prop::Gap => Kind::Px,
            Prop::BorderStyle => Kind::BorderStyle,
            Prop::Shadow => Kind::Shadows,
            Prop::TextShadow => Kind::TextShadow,
        }
    }
}

/// `<slot>[.<state>].<property>`.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Ord, PartialOrd)]
pub struct SlotKey {
    pub slot: Slot,
    pub state: Option<State>,
    pub prop: Prop,
}

impl SlotKey {
    /// Parses a style key, preferring the longest slot name (`button.primary.fill`
    /// is the `button.primary` slot, not `button` with a `primary` state).
    /// Keys spelled like a token (`toast.text`) are the token, not a slot key;
    /// [`crate::Theme`] stores them as tokens and slot lookups read them back.
    pub fn parse(key: &str) -> Option<SlotKey> {
        let (rest, prop) = key.rsplit_once('.')?;
        let prop = Prop::ALL.into_iter().find(|p| p.key() == prop)?;
        if let Some(slot) = Slot::ALL.into_iter().find(|s| s.key() == rest) {
            return Some(SlotKey {
                slot,
                state: None,
                prop,
            });
        }
        let (slot, state) = rest.rsplit_once('.')?;
        Some(SlotKey {
            slot: Slot::ALL.into_iter().find(|s| s.key() == slot)?,
            state: Some(State::ALL.into_iter().find(|s| s.key() == state)?),
            prop,
        })
    }

    pub fn key(self) -> String {
        match self.state {
            Some(state) => format!("{}.{}.{}", self.slot.key(), state.key(), self.prop.key()),
            None => format!("{}.{}", self.slot.key(), self.prop.key()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_unique_and_slot_aliases_agree_on_kind() {
        let mut seen = std::collections::HashSet::new();
        for t in tokens() {
            assert!(seen.insert(t.key), "duplicate token {}", t.key);
            // A token spelled like a slot property (`toast.text`, `button.border`,
            // `control.active.border`) is that property's value.
            if let Some(slot_key) = SlotKey::parse(t.key) {
                let kind = slot_key.prop.kind();
                assert!(
                    kind == t.kind || (kind == Kind::Fill && t.kind == Kind::Color),
                    "{}",
                    t.key
                );
            }
        }
    }

    #[test]
    fn slot_keys_round_trip() {
        for key in [
            "button.primary.fill",
            "button.hover.fill",
            "tabs.list.gap",
            "dialog.title_bar.text_shadow",
        ] {
            assert_eq!(SlotKey::parse(key).unwrap().key(), key);
        }
        assert!(SlotKey::parse("button.nope.fill").is_none());
    }
}
