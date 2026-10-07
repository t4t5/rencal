//! Ported vitest suites: `src/lib/conference.test.ts`, `src/lib/event-url.test.ts`
//! and `src/lib/contact-suggestions.test.ts`. Assertions the golden fixtures
//! already make identically are left out.

use rencal_text::conference::{
    EventLinks, JOIN_LEAD_MINUTES, conference_for_calendar, detect_conference,
    is_within_join_window,
};
use rencal_text::contacts::{Contact, suggest_contacts};
use rencal_text::event_url::{DetectedUrl, DetectedUrlSource, find_urls};
use rencal_time::event::{ConferenceProvider, EventConference};
use rencal_time::{Calendar, EventDateInfo};

fn calendar(provider: Option<&str>) -> Calendar {
    Calendar {
        slug: provider.unwrap_or("local").into(),
        provider: provider.map(str::to_owned),
        ..Calendar::default()
    }
}

#[test]
fn conference_for_calendar_preserves_live_links_when_changing_calendars() {
    let live = EventConference::Live {
        provider: ConferenceProvider::Outlook,
        url: "https://teams.example/meeting".into(),
    };
    assert_eq!(
        conference_for_calendar(Some(live.clone()), Some(&calendar(Some("google")))),
        Some(live)
    );
}

#[test]
fn detect_conference_ignores_locations_without_a_meeting_link() {
    assert_eq!(detect_conference(Some("Room 4B, Main Office")), None);
    assert_eq!(detect_conference(None), None);
}

#[test]
fn conference_rpc_round_trip() {
    for conference in [
        EventConference::Requested {
            provider: ConferenceProvider::Google,
        },
        EventConference::Live {
            provider: ConferenceProvider::Proton,
            url: "https://meet.proton.me/example".into(),
        },
    ] {
        let wire = serde_json::to_value(&conference).unwrap();
        assert_eq!(
            serde_json::from_value::<EventConference>(wire).unwrap(),
            conference
        );
    }
}

#[test]
fn join_window_opens_lead_time_before_start_and_closes_at_end() {
    let minute = 60_000;
    let info = EventDateInfo {
        start_ms: 100 * minute,
        end_ms: 130 * minute,
        ..EventDateInfo::default()
    };
    let opens_at = info.start_ms - JOIN_LEAD_MINUTES * minute;

    assert!(!is_within_join_window(&info, opens_at - 1));
    assert!(is_within_join_window(&info, opens_at));
    assert!(is_within_join_window(&info, info.start_ms));
    assert!(is_within_join_window(&info, info.end_ms - 1));
    assert!(!is_within_join_window(&info, info.end_ms));
}

#[test]
fn find_urls_returns_nothing_without_text() {
    assert!(find_urls(None).is_empty());
}

#[test]
fn find_urls_stops_at_html_markup_and_quotes() {
    assert_eq!(
        find_urls(Some(
            r#"<a href="https://example.com/page">https://example.com/page</a>"#
        )),
        ["https://example.com/page", "https://example.com/page"]
    );
}

fn detect(links: EventLinks) -> Option<(String, DetectedUrlSource)> {
    links
        .detect_url()
        .map(|DetectedUrl { url, source }| (url, source))
}

#[test]
fn detect_url_is_none_without_links() {
    let links = EventLinks {
        description: Some("Bring snacks"),
        location: Some("Kitchen"),
        ..EventLinks::default()
    };
    assert_eq!(detect(links), None);
}

#[test]
fn detect_url_finds_a_link_in_the_notes() {
    let links = EventLinks {
        description: Some("Flight details: https://www.flighty.app/"),
        ..EventLinks::default()
    };
    assert_eq!(
        detect(links),
        Some((
            "https://www.flighty.app/".into(),
            DetectedUrlSource::Description
        ))
    );
}

#[test]
fn detect_url_prefers_the_location_over_the_notes() {
    let links = EventLinks {
        location: Some("https://venue.example/map"),
        description: Some("https://other.example"),
        ..EventLinks::default()
    };
    assert_eq!(
        detect(links),
        Some((
            "https://venue.example/map".into(),
            DetectedUrlSource::Location
        ))
    );
}

#[test]
fn detect_url_skips_the_explicit_url() {
    let links = EventLinks {
        url: Some("example.com/a"),
        description: Some("https://example.com/a and https://example.com/b"),
        ..EventLinks::default()
    };
    assert_eq!(
        detect(links),
        Some((
            "https://example.com/b".into(),
            DetectedUrlSource::Description
        ))
    );
}

#[test]
fn detect_url_skips_the_events_meeting_link() {
    let meet = "https://meet.google.com/abc-defg-hij";
    let conference = EventConference::Live {
        provider: ConferenceProvider::Google,
        url: meet.into(),
    };
    let description =
        format!("Join with Google Meet: {meet}?hs=122 Agenda: https://docs.example/agenda");
    let links = EventLinks {
        conference: Some(&conference),
        description: Some(&description),
        ..EventLinks::default()
    };
    assert_eq!(
        detect(links),
        Some((
            "https://docs.example/agenda".into(),
            DetectedUrlSource::Description
        ))
    );

    let links = EventLinks {
        location: Some("https://us02web.zoom.us/j/123456789"),
        ..EventLinks::default()
    };
    assert_eq!(detect(links), None);
}

#[test]
fn detect_url_surfaces_a_meeting_link_when_the_event_has_no_meeting() {
    let links = EventLinks {
        location: Some("Room 4"),
        description: Some("https://meet.jit.si/standup"),
        ..EventLinks::default()
    };
    assert_eq!(
        detect(links),
        Some((
            "https://meet.jit.si/standup".into(),
            DetectedUrlSource::Description
        ))
    );
}

fn contact(email: &str, name: &str, count: u32) -> Contact {
    Contact {
        email: email.into(),
        name: Some(name.into()),
        count,
        last_seen: "2026-01-01".into(),
    }
}

#[test]
fn suggestions_keep_backend_order_within_a_rank_and_respect_the_limit() {
    let contacts = [
        contact("zara@example.com", "Zara Zee", 10),
        contact("alex@example.com", "Jordan Smith", 8),
        contact("sam@example.com", "Alex Cooper", 6),
        contact("person-alex@example.com", "Casey Example", 4),
    ];
    let emails: Vec<&str> = suggest_contacts(&contacts, "@example", [""; 0], 2)
        .into_iter()
        .map(|c| c.email.as_str())
        .collect();
    assert_eq!(emails, ["zara@example.com", "alex@example.com"]);
}
