use caldir_core::{Calendar, Event, XProperty};

use super::types::{ConferenceProvider, EventConference};

const GOOGLE_CONFERENCE_PROP: &str = "X-GOOGLE-CONFERENCE";
const OUTLOOK_CONFERENCE_PROP: &str = "X-OUTLOOK-CONFERENCE";
const PROTON_CONFERENCE_PROP: &str = "X-PM-CONFERENCE-URL";

const CONFERENCE_PROPS: [(&str, ConferenceProvider); 3] = [
    (GOOGLE_CONFERENCE_PROP, ConferenceProvider::Google),
    (OUTLOOK_CONFERENCE_PROP, ConferenceProvider::Outlook),
    (PROTON_CONFERENCE_PROP, ConferenceProvider::Proton),
];

pub fn conference_from_event(event: &Event) -> Option<EventConference> {
    CONFERENCE_PROPS.iter().find_map(|(property, provider)| {
        event.x_property(property).map(|value| match value.trim() {
            // If key exists but value is empty:
            // -> conference was requested but not yet created
            "" => EventConference::Requested {
                provider: *provider,
            },
            _ => EventConference::Live {
                provider: *provider,
                url: value.to_string(),
            },
        })
    })
}

pub fn apply_conference(
    event: &mut Event,
    calendar: &Calendar,
    conference: Option<&EventConference>,
) {
    let calendar_provider = calendar
        .remote_config()
        .map(|config| config.provider_slug().as_str());
    apply_conference_for_provider(event, calendar_provider, conference);
}

fn apply_conference_for_provider(
    event: &mut Event,
    calendar_provider: Option<&str>,
    conference: Option<&EventConference>,
) {
    event.x_properties.retain(|property| {
        !CONFERENCE_PROPS
            .iter()
            .any(|(conference_property, _)| property.name == *conference_property)
    });

    let Some(conference) = conference else {
        return;
    };

    let (provider, value) = match conference {
        EventConference::Requested { provider } => {
            // Google is currently the only provider whose sync adapter supports
            // creating conferences.
            let provisioned_provider = match calendar_provider {
                Some("google") => ConferenceProvider::Google,
                Some(_) | None => return,
            };

            if provider != &provisioned_provider {
                return;
            }

            (*provider, "")
        }
        EventConference::Live { provider, url } => (*provider, url.as_str()),
    };

    let conference_property = CONFERENCE_PROPS
        .iter()
        .find_map(|(property, candidate)| (*candidate == provider).then_some(*property))
        .expect("every conference provider has an x-property");

    event
        .x_properties
        .push(XProperty::new(conference_property, value));
}

#[cfg(test)]
mod tests {
    use caldir_core::EventTime;
    use chrono::NaiveDate;

    use super::*;

    fn event() -> Event {
        Event::new(
            "Planning",
            EventTime::Date(NaiveDate::from_ymd_opt(2026, 7, 24).unwrap()),
        )
    }

    #[test]
    fn parses_requested_and_live_conferences() {
        let mut requested = event();
        requested.x_properties = vec![XProperty::new(GOOGLE_CONFERENCE_PROP, " \t ")];
        assert!(matches!(
            conference_from_event(&requested),
            Some(EventConference::Requested {
                provider: ConferenceProvider::Google
            })
        ));

        let mut live = event();
        live.x_properties = vec![XProperty::new(
            OUTLOOK_CONFERENCE_PROP,
            "https://teams.example/meeting",
        )];
        assert!(matches!(
            conference_from_event(&live),
            Some(EventConference::Live {
                provider: ConferenceProvider::Outlook,
                url
            }) if url == "https://teams.example/meeting"
        ));
    }

    #[test]
    fn applies_google_request_only_to_google_calendars() {
        let request = EventConference::Requested {
            provider: ConferenceProvider::Google,
        };

        let mut google_event = event();
        apply_conference_for_provider(&mut google_event, Some("google"), Some(&request));
        assert_eq!(google_event.x_property(GOOGLE_CONFERENCE_PROP), Some(""));

        let mut outlook_event = event();
        apply_conference_for_provider(&mut outlook_event, Some("outlook"), Some(&request));
        assert!(conference_from_event(&outlook_event).is_none());
    }

    #[test]
    fn replaces_or_removes_known_conference_properties() {
        let mut live_event = event();
        live_event.x_properties = vec![
            XProperty::new(GOOGLE_CONFERENCE_PROP, "https://meet.google.com/old"),
            XProperty::new("X-UNRELATED", "keep"),
        ];
        let conference = EventConference::Live {
            provider: ConferenceProvider::Proton,
            url: "https://meet.proton.me/new".to_string(),
        };

        apply_conference_for_provider(&mut live_event, None, Some(&conference));
        assert_eq!(
            live_event.x_property(PROTON_CONFERENCE_PROP),
            Some("https://meet.proton.me/new")
        );
        assert_eq!(live_event.x_property("X-UNRELATED"), Some("keep"));
        assert!(live_event.x_property(GOOGLE_CONFERENCE_PROP).is_none());

        apply_conference_for_provider(&mut live_event, None, None);
        assert!(conference_from_event(&live_event).is_none());
        assert_eq!(live_event.x_property("X-UNRELATED"), Some("keep"));
    }
}
