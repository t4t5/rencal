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
        event.x_property(property).map(|value| match value {
            // If key exists but value is empty:
            // -> conference was requested but not yet created
            "" => EventConference::Requested {
                provider: *provider,
            },
            url => EventConference::Live {
                provider: *provider,
                url: url.to_string(),
            },
        })
    })
}

pub fn apply_conference(
    event: &mut Event,
    calendar: &Calendar,
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
            let calendar_provider = match calendar
                .remote_config()
                .map(|config| config.provider_slug().as_str())
            {
                Some("google") => ConferenceProvider::Google,
                Some(_) | None => return,
            };

            if provider != &calendar_provider {
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
