//! renCal theme format v2 (GPUI_PORT_PLAN.md §4): Zed-style JSON theme
//! families with flat dotted tokens, typed non-colour tokens and per-slot
//! style tokens, plus the resolver that derives every unset token.
//!
//! No GPUI here: colours are [`Rgba`] and metrics plain `f64` pixels; the app
//! converts. See `README.md` for the format and `AGENTS.md` for conventions.

mod builtin;
mod color;
mod event;
#[cfg(feature = "legacy-css")]
pub mod legacy;
mod omarchy;
mod resolve;
mod schema;
mod theme;
mod tokens;
mod value;

pub use builtin::{
    BuiltinTheme, DARK_BASELINE_ID, LIGHT_BASELINE_ID, baseline, builtin, builtin_themes,
    resolve_theme, variant_ids,
};
pub use color::{Oklch, Rgba};
pub use event::{EventColors, event_colors};
pub use omarchy::{OMARCHY_THEME_ID, OmarchyColors, omarchy_theme};
pub use resolve::{ResolveError, ResolvedTheme, SlotStyle, resolve};
pub use schema::{theme_schema, theme_schema_string};
pub use theme::{
    Appearance, Diagnostic, SCHEMA_URL, Style, Theme, ThemeContent, ThemeFamily, slugify,
};
pub use tokens::{
    Const, Derive, Lookup, Pct, Prop, Slot, SlotKey, Src, State, TokenDef, token, tokens,
};
pub use value::{BorderStyle, Fill, Kind, Shadow, TextShadow, TextTransform, Value};
