//! Video meetings (port of `src/lib/conference.ts`): meeting links found in
//! free text, whether an event has a meeting and its join link, the join
//! window, and which conferences a calendar can provision.
//!
//! Stored conferences are `rencal_time::event::EventConference`; its serde form
//! is the RPC shape, so the TS `rpcToConference`/`conferenceToRpc` are gone.

use std::sync::LazyLock;

use regex::Regex;
use rencal_time::event::{ConferenceProvider, EventConference};
use rencal_time::{Calendar, CalendarEvent, EventDateInfo};
use serde::Serialize;

/// Display name of a stored conference's provider.
pub fn conference_label(provider: ConferenceProvider) -> &'static str {
    match provider {
        ConferenceProvider::Google => "Google Meet",
        ConferenceProvider::Outlook | ConferenceProvider::Proton => "Meeting",
    }
}

/// A meeting link found in free-form event text, unlike a stored conference.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct DetectedConference {
    pub url: String,
    pub label: &'static str,
}

/// Rest of a link: anything up to whitespace, a bracket of HTML, or a quote.
const LINK_TAIL: &str = r#"[^\s<>"']+"#;

/// Known meeting links, first match wins. Character classes are ASCII as in
/// the JS originals.
static MEETING_PATTERNS: LazyLock<Vec<(&'static str, Regex)>> = LazyLock::new(|| {
    [
        (
            "Zoom",
            r"https?://(?:[A-Za-z0-9_-]+\.)*(?:zoom\.us|zoomgov\.com)/(?:j|my|s|w|wc)/",
        ),
        ("Google Meet", r"https?://meet\.google\.com/"),
        (
            "Microsoft Teams",
            r"https?://teams\.(?:microsoft|live)\.com/",
        ),
        ("Webex", r"https?://(?:[A-Za-z0-9_-]+\.)*webex\.com/"),
        ("Jitsi", r"https?://meet\.jit\.si/"),
        ("Whereby", r"https?://(?:www\.)?whereby\.com/"),
        ("Proton Meet", r"https?://meet\.proton\.me/"),
    ]
    .into_iter()
    .map(|(label, head)| {
        let pattern = format!("(?i){head}{LINK_TAIL}");
        (label, Regex::new(&pattern).expect("valid meeting pattern"))
    })
    .collect()
});

/// Find a known meeting link in free-form text, e.g. an event location holding
/// a Zoom URL. Trailing punctuation is trimmed from the link.
pub fn detect_conference(text: Option<&str>) -> Option<DetectedConference> {
    let text = text.filter(|t| !t.is_empty())?;
    MEETING_PATTERNS.iter().find_map(|(label, pattern)| {
        let found = pattern.find(text)?.as_str();
        let url = found.trim_end_matches([')', ',', '.', ';', ':', '!', '?', ']']);
        Some(DetectedConference {
            url: url.to_owned(),
            label,
        })
    })
}

/// The link-bearing fields of an event (or of a draft being edited).
#[derive(Clone, Copy, Debug, Default)]
pub struct EventLinks<'a> {
    pub url: Option<&'a str>,
    pub description: Option<&'a str>,
    pub location: Option<&'a str>,
    pub conference: Option<&'a EventConference>,
}

impl<'a> From<&'a CalendarEvent> for EventLinks<'a> {
    fn from(event: &'a CalendarEvent) -> Self {
        Self {
            url: event.url.as_deref(),
            description: event.description.as_deref(),
            location: event.location.as_deref(),
            conference: event.conference.as_ref(),
        }
    }
}

impl EventLinks<'_> {
    /// Whether the event has a video meeting: a stored conference (live or
    /// requested) or a known meeting link in its location, mirroring what the
    /// event popover's conference section shows.
    pub fn has_video_meeting(&self) -> bool {
        self.conference.is_some() || detect_conference(self.location).is_some()
    }

    /// The link to join the event's meeting: a live conference first, else a
    /// meeting link in the location. Requested conferences have no link yet.
    pub fn meeting_url(&self) -> Option<String> {
        match self.conference {
            Some(EventConference::Live { url, .. }) => Some(url.clone()),
            _ => detect_conference(self.location).map(|d| d.url),
        }
    }
}

/// How long before an event starts that its "Join" button appears.
pub const JOIN_LEAD_MINUTES: i64 = 10;

/// Whether an event is about to start or still in progress, so a "Join"
/// button makes sense.
pub fn is_within_join_window(date_info: &EventDateInfo, now_ms: i64) -> bool {
    now_ms >= date_info.start_ms - JOIN_LEAD_MINUTES * 60_000 && now_ms < date_info.end_ms
}

/// The conference provider renCal can provision for events on this calendar.
pub fn calendar_conference_provider(calendar: Option<&Calendar>) -> Option<ConferenceProvider> {
    (calendar?.provider.as_deref() == Some("google")).then_some(ConferenceProvider::Google)
}

/// Drop a requested conference when the target calendar can't provision it,
/// e.g. after moving a draft to another calendar. Live links are kept.
pub fn conference_for_calendar(
    conference: Option<EventConference>,
    calendar: Option<&Calendar>,
) -> Option<EventConference> {
    match conference {
        Some(EventConference::Requested { provider })
            if Some(provider) != calendar_conference_provider(calendar) =>
        {
            None
        }
        other => other,
    }
}
