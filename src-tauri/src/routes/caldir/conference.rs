use caldir_core::{Calendar, Event, XProperty};

use super::types::{ConferenceProvider, EventConference};

pub const GOOGLE_CONFERENCE_PROP: &str = "X-GOOGLE-CONFERENCE";
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

pub fn apply_conference_request(event: &mut Event, calendar: &Calendar, requested: bool) {
    let conference_property = match calendar
        .remote_config()
        .map(|config| config.provider_slug().as_str())
    {
        Some("google") => GOOGLE_CONFERENCE_PROP,
        Some(_) | None => return, // Conference requests are unsupported for other providers.
    };

    if requested && event.x_property(conference_property).is_none() {
        event
            .x_properties
            .push(XProperty::new(conference_property, ""));
    } else if !requested {
        event.x_properties.retain(|property| {
            !(property.name == conference_property && property.value.is_empty())
        });
    }
}
