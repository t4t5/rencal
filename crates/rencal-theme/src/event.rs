//! Event paint derived from each event's accent colour (§4.6). A port of the
//! `[data-slot="calendar-event"]` rules in the old `src/global.css`.
//!
//! Dark themes mix a chroma-boosted accent into `text` for a soft pastel;
//! light themes keep the accent's hue and cap its lightness instead (mixing
//! would muddy it: yellow + black is olive). The knobs are internal.

use crate::color::Rgba;
use crate::resolve::ResolvedTheme;
use crate::theme::Appearance;

/// OKLCH chroma multiplier for the boosted and tinted accent.
const CHROMA_BOOST: f64 = 1.4;
/// Light themes cap the tinted accent's OKLCH lightness here.
const LIGHT_MAX_LIGHTNESS: f64 = 0.45;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EventColors {
    /// The accent itself (`event.color` wins over the calendar/event colour):
    /// colour markers, bars, draft/declined borders.
    pub color: Rgba,
    /// Fill of filled blocks (week events, all-day chips).
    pub fill: Rgba,
    /// Fill of a selected filled block.
    pub selected_fill: Rgba,
    /// Text on `fill`.
    pub text: Rgba,
    /// Accent-tinted text for bar-and-text events (month time labels, agenda, board).
    pub tinted_text: Rgba,
    /// Text of declined / needs-action events (drawn unfilled with a dashed border).
    pub declined_text: Rgba,
    pub draft_fill: Rgba,
    pub draft_text: Rgba,
    /// The 2px ring around a draft.
    pub draft_ring: Rgba,
    /// Drag-to-create selection tint.
    pub create_selection: Rgba,
}

pub fn event_colors(accent: Rgba, theme: &ResolvedTheme) -> EventColors {
    let color = theme.optional_color("event.color").unwrap_or(accent);
    let oklch = color.to_oklch();
    let boosted = crate::color::Oklch {
        c: oklch.c * CHROMA_BOOST,
        ..oklch
    }
    .to_rgba();
    let (max_lightness, text_mix) = match theme.appearance {
        Appearance::Dark => (f64::INFINITY, None),
        Appearance::Light => (LIGHT_MAX_LIGHTNESS, Some(0.0)),
    };
    let tinted = crate::color::Oklch {
        l: oklch.l.min(max_lightness),
        c: oklch.c * CHROMA_BOOST,
        ..oklch
    }
    .to_rgba();
    let text = theme.color("text");
    // Dark themes mix this much `text` into the tinted accent; light themes none.
    let tint_text = |dark_mix: f64| text.mix(text_mix.unwrap_or(dark_mix), tinted);
    let surface = theme.color("event.tint_surface");

    let fill = theme
        .optional_color("event.background")
        .unwrap_or_else(|| boosted.mix(0.2, surface));
    let tinted_text = tint_text(0.6);
    EventColors {
        color,
        fill,
        selected_fill: fill.mix(0.8, theme.optional_color("event.text").unwrap_or(text)),
        text: theme.optional_color("event.text").unwrap_or(tinted_text),
        tinted_text,
        declined_text: tint_text(0.5),
        draft_fill: boosted.mix(0.15, surface),
        draft_text: tint_text(0.4),
        draft_ring: color.mix(0.25, Rgba::TRANSPARENT),
        create_selection: boosted.mix(0.2, Rgba::TRANSPARENT),
    }
}
