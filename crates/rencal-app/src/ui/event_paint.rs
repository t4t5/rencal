//! Event colours for the views: the accent each event is drawn in, and the
//! paint `rencal_theme::event_colors` derives from it (§4.6), as GPUI colours.

use gpui_kit::Hsla;
use rencal_theme::{ResolvedTheme, Rgba};
use rencal_time::event::ResponseStatus;
use rencal_time::{Calendar, CalendarEvent};

use crate::theme::hsla;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EventPaint {
    /// The accent: colour markers, bars, dashed borders.
    pub color: Hsla,
    /// Fill of filled blocks (week events, all-day bars).
    pub fill: Hsla,
    pub selected_fill: Hsla,
    /// Text on `fill`.
    pub text: Hsla,
    /// Accent-tinted text for bar-and-text events (month times, agenda).
    pub tinted_text: Hsla,
    /// Text of declined / needs-action events, drawn unfilled.
    pub declined_text: Hsla,
    /// A draft: dashed accent border over this fill, this text and ring.
    pub draft_fill: Hsla,
    pub draft_text: Hsla,
    pub draft_ring: Hsla,
    /// A drag-to-create selection.
    pub create_selection: Hsla,
}

/// How the account owner answered, as far as it changes the drawing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rsvp {
    Accepted,
    /// Drawn faded, unfilled with a dashed border.
    NeedsAction,
    /// Like `NeedsAction`, and struck through.
    Declined,
}

impl Rsvp {
    pub fn of(event: &CalendarEvent, calendars: &[Calendar]) -> Option<Self> {
        match event.user_response_status(calendars)? {
            ResponseStatus::Declined => Some(Self::Declined),
            ResponseStatus::NeedsAction => Some(Self::NeedsAction),
            ResponseStatus::Accepted | ResponseStatus::Tentative => Some(Self::Accepted),
        }
    }

    /// Declined and unanswered events are drawn at half opacity, unfilled.
    pub fn is_faded(rsvp: Option<Self>) -> bool {
        matches!(rsvp, Some(Self::Declined | Self::NeedsAction))
    }
}

/// The accent a calendar's events are drawn in when they have no colour of
/// their own: the calendar's colour, else the theme's primary.
pub fn calendar_accent(calendar: Option<&Calendar>, theme: &ResolvedTheme) -> Rgba {
    calendar
        .and_then(|calendar| calendar.color.as_deref())
        .and_then(Rgba::parse_hex)
        .unwrap_or_else(|| theme.color("primary"))
}

/// The accent of `event`: its own colour, else its calendar's.
pub fn event_accent(event: &CalendarEvent, calendars: &[Calendar], theme: &ResolvedTheme) -> Rgba {
    event
        .color
        .as_deref()
        .and_then(Rgba::parse_hex)
        .unwrap_or_else(|| {
            calendar_accent(
                calendars.iter().find(|c| c.slug == event.calendar_slug),
                theme,
            )
        })
}

pub fn paint_for_accent(accent: Rgba, theme: &ResolvedTheme) -> EventPaint {
    let colors = rencal_theme::event_colors(accent, theme);
    EventPaint {
        color: hsla(colors.color),
        fill: hsla(colors.fill),
        selected_fill: hsla(colors.selected_fill),
        text: hsla(colors.text),
        tinted_text: hsla(colors.tinted_text),
        declined_text: hsla(colors.declined_text),
        draft_fill: hsla(colors.draft_fill),
        draft_text: hsla(colors.draft_text),
        draft_ring: hsla(colors.draft_ring),
        create_selection: hsla(colors.create_selection),
    }
}

pub fn event_paint(
    event: &CalendarEvent,
    calendars: &[Calendar],
    theme: &ResolvedTheme,
) -> EventPaint {
    paint_for_accent(event_accent(event, calendars, theme), theme)
}
